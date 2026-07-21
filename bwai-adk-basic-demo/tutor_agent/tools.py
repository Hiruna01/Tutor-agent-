"""Function tools for TutorAgent.

Every tool is deterministic and operates on ADK session state via ``ToolContext``
so the language model handles *wording* while these tools handle *facts and
memory*. State keys used:

- ``notes_chunks``: list of ``{"id", "source", "text"}`` — the student's material.
- ``quiz``:         dict ``question_id -> {question, reference_answer, concept, sources}``.
- ``scores``:       dict ``concept -> {"correct": int, "total": int}`` — the feedback loop.
"""

from __future__ import annotations

from typing import Any

from google.adk.tools import ToolContext

from .retrieval import COVERAGE_THRESHOLD, chunk_text, rank_chunks

# ── State helpers ─────────────────────────────────────────────────────────────


def _notes(ctx: ToolContext) -> list[dict[str, Any]]:
    return ctx.state.get("notes_chunks", [])


def _quiz(ctx: ToolContext) -> dict[str, Any]:
    return ctx.state.get("quiz", {})


def _scores(ctx: ToolContext) -> dict[str, Any]:
    return ctx.state.get("scores", {})


# ── Notes ingestion & retrieval (RAG) ─────────────────────────────────────────


def ingest_notes(source_name: str, content: str, tool_context: ToolContext) -> dict:
    """Store the student's study material so it can be used to teach and quiz them.

    Call this whenever the student pastes or uploads notes. The content is split
    into retrieval chunks and appended to any material already provided.

    Args:
        source_name: A short label for this material, e.g. "Biology Ch. 4" or
            "Lecture 3 slides". Used later to cite where an answer came from.
        content: The full text of the notes.

    Returns:
        A status dict with the number of chunks stored and the running total of
        sources and chunks.
    """
    if not content or not content.strip():
        return {"status": "error", "message": "No note content was provided to store."}

    chunks = _notes(tool_context)
    new_chunks = chunk_text(content, source_name)
    start_id = len(chunks)
    for i, ch in enumerate(new_chunks):
        chunks.append({"id": start_id + i, "source": ch["source"], "text": ch["text"]})
    tool_context.state["notes_chunks"] = chunks

    sources = sorted({c["source"] for c in chunks})
    return {
        "status": "success",
        "source_name": source_name,
        "chunks_added": len(new_chunks),
        "total_chunks": len(chunks),
        "all_sources": sources,
    }


def list_sources(tool_context: ToolContext) -> dict:
    """List the study materials the student has uploaded so far.

    Returns:
        The distinct source labels and how many chunks each contributed. An
        empty list means no notes have been ingested yet.
    """
    chunks = _notes(tool_context)
    counts: dict[str, int] = {}
    for c in chunks:
        counts[c["source"]] = counts.get(c["source"], 0) + 1
    return {
        "status": "success",
        "has_notes": bool(chunks),
        "sources": [{"source": s, "chunks": n} for s, n in sorted(counts.items())],
        "total_chunks": len(chunks),
    }


def search_notes(query: str, tool_context: ToolContext, top_k: int = 4) -> dict:
    """Retrieve the most relevant passages from the student's notes for a topic.

    This is the grounding step: always call it before explaining a concept,
    generating a quiz, or grading an answer. Inspect ``coverage`` in the result —
    if it is ``"insufficient"``, the notes do not cover the topic well and you
    should fall back to the ``web_research`` tool and label the answer as coming
    from the web, not the notes.

    Args:
        query: The concept or question to look up.
        top_k: Maximum number of passages to return.

    Returns:
        Ranked passages with a relevance score and their source label, plus a
        ``coverage`` assessment ("good" or "insufficient").
    """
    chunks = _notes(tool_context)
    if not chunks:
        return {
            "status": "success",
            "coverage": "insufficient",
            "reason": "no_notes_uploaded",
            "passages": [],
        }

    ranked = rank_chunks(query, chunks, top_k=top_k)
    best = ranked[0]["score"] if ranked else 0.0
    coverage = "good" if best >= COVERAGE_THRESHOLD else "insufficient"
    return {
        "status": "success",
        "coverage": coverage,
        "best_score": best,
        "passages": [
            {"source": r["source"], "score": r["score"], "text": r["text"]}
            for r in ranked
        ],
    }


# ── Quiz generation & the grading / feedback loop ─────────────────────────────


def save_quiz_question(
    question: str,
    reference_answer: str,
    concept: str,
    sources: str,
    tool_context: ToolContext,
) -> dict:
    """Persist a quiz question you generated so it can be graded later.

    Call this once per question after you have written it from the retrieved
    notes. The reference answer and sources you supply here become the ground
    truth used to grade the student, so derive them strictly from the material.

    Args:
        question: The question text shown to the student.
        reference_answer: The correct answer, grounded in the notes (or web).
        concept: A short topic label (e.g. "photosynthesis", "big-O notation").
            Grading tracks performance per concept to find the weakest one.
        sources: Where the answer is grounded, e.g. "notes: Biology Ch. 4" or
            "web".

    Returns:
        The assigned ``question_id`` to reference when grading.
    """
    quiz = _quiz(tool_context)
    question_id = f"q{len(quiz) + 1}"
    quiz[question_id] = {
        "question": question,
        "reference_answer": reference_answer,
        "concept": concept,
        "sources": sources,
    }
    tool_context.state["quiz"] = quiz
    return {"status": "success", "question_id": question_id, "concept": concept}


def get_grading_reference(question_id: str, tool_context: ToolContext) -> dict:
    """Fetch the reference answer and source for a question before grading it.

    Args:
        question_id: The id returned by ``save_quiz_question`` (e.g. "q1").

    Returns:
        The stored question, its reference answer, concept, and source, or an
        error if the id is unknown.
    """
    quiz = _quiz(tool_context)
    item = quiz.get(question_id)
    if not item:
        return {
            "status": "error",
            "message": f"No saved question with id '{question_id}'.",
            "known_ids": list(quiz.keys()),
        }
    return {"status": "success", "question_id": question_id, **item}


def record_result(concept: str, is_correct: bool, tool_context: ToolContext) -> dict:
    """Record whether the student answered a concept correctly (the feedback loop).

    Call this after grading each answer. It updates the per-concept score that
    ``get_weakest_concept`` uses to decide what to re-teach.

    Args:
        concept: The concept label the question tested (match ``save_quiz_question``).
        is_correct: True if the student's answer was correct (or mostly correct).

    Returns:
        The updated tally for that concept.
    """
    scores = _scores(tool_context)
    entry = scores.get(concept, {"correct": 0, "total": 0})
    entry["total"] += 1
    if is_correct:
        entry["correct"] += 1
    scores[concept] = entry
    tool_context.state["scores"] = scores
    return {
        "status": "success",
        "concept": concept,
        "correct": entry["correct"],
        "total": entry["total"],
    }


def get_weakest_concept(tool_context: ToolContext) -> dict:
    """Find the concept the student is struggling with most, to re-teach it.

    Returns:
        The concept with the lowest accuracy (ties broken by most attempts), a
        full per-concept breakdown, and a ``should_reteach`` flag that is true
        only when that concept's accuracy is below 100%.
    """
    scores = _scores(tool_context)
    if not scores:
        return {
            "status": "success",
            "has_data": False,
            "message": "No answers graded yet, so there is nothing to re-teach.",
        }

    breakdown = []
    for concept, s in scores.items():
        accuracy = s["correct"] / s["total"] if s["total"] else 0.0
        breakdown.append(
            {"concept": concept, "accuracy": round(accuracy, 2), **s}
        )
    # Lowest accuracy first; break ties by whoever was attempted more often.
    breakdown.sort(key=lambda b: (b["accuracy"], -b["total"]))
    weakest = breakdown[0]
    return {
        "status": "success",
        "has_data": True,
        "weakest_concept": weakest["concept"],
        "weakest_accuracy": weakest["accuracy"],
        "should_reteach": weakest["accuracy"] < 1.0,
        "breakdown": breakdown,
    }
