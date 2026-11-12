"""TutorAgent — a source-grounded study companion built on Google ADK.

A multi-agent system:

    root_agent (tutor)  ──uses──▶  web_research  ──delegates to──▶  search_agent
        │                                                          (google_search)
        └── function tools: ingest_notes, list_sources, search_notes,
            save_quiz_question, get_grading_reference, record_result,
            get_weakest_concept

The tutor grounds every explanation in the student's own uploaded notes (RAG).
When the notes do not cover a topic, it delegates to a dedicated search agent
for live Google Search — and always labels which source an answer came from.
It also generates quizzes from the material, grades answers against the source,
tracks per-concept performance, and re-teaches the weakest concept.
"""

from __future__ import annotations

import dotenv
from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import google_search
from google.adk.tools.agent_tool import AgentTool
from google.genai import types

from .tools import (
    get_grading_reference,
    get_weakest_concept,
    ingest_notes,
    list_sources,
    record_result,
    save_quiz_question,
    search_notes,
)

dotenv.load_dotenv()

# ── Models (hybrid) ───────────────────────────────────────────────────────────
# The tutor runs on OpenRouter (via ADK's LiteLLM integration) to escape the
# Google free-tier rate limit — the teaching/quiz/grading loop is where most
# requests happen. Needs OPENROUTER_API_KEY in the environment.
TUTOR_MODEL = LiteLlm(model="openrouter/google/gemini-3.1-flash-lite")

# Cap the response length. OpenRouter reserves account credit up front based on
# max_tokens, and the model default (65536) reserves so much that a small
# balance is rejected with "requires more credits, or fewer max_tokens". A few
# thousand tokens is plenty for a tutor turn and keeps the reservation tiny.
TUTOR_CONFIG = types.GenerateContentConfig(max_output_tokens=2048)

# The search sub-agent stays on the NATIVE Google API: the built-in
# `google_search` grounding tool only works there, not through OpenRouter.
# `gemini-flash-latest` is an alias that tracks the current Gemini flash model,
# so this won't break when a version is retired. Needs GOOGLE_API_KEY.
SEARCH_MODEL = "gemini-flash-latest"

# ── Search sub-agent ──────────────────────────────────────────────────────────
# ADK's built-in `google_search` tool cannot be mixed with other tools in the
# same agent, so it lives in its own specialist agent. The tutor reaches it
# through an AgentTool (`web_research`), giving us a clean multi-agent boundary:
# the tutor decides *when* the notes fall short; this agent handles *how* to
# search the live web.
search_agent = Agent(
    name="search_agent",
    model=SEARCH_MODEL,
    description="Runs live Google Search and returns current, cited web findings.",
    instruction="""
You are a web research specialist. You are given a single, focused query about
a study topic that the student's own notes did not cover well.

Use the google_search tool to find accurate, up-to-date information. Then reply
with a concise factual summary of what you found. Prefer authoritative sources.
Note any dates or version numbers that matter for freshness. Do not add study
advice or quiz the user — just report the findings and their sources. If the
search returns nothing useful, say so plainly.
""",
    tools=[google_search],
)

# ── Tutor orchestrator (root) ─────────────────────────────────────────────────
root_agent = Agent(
    name="tutor_agent",
    model=TUTOR_MODEL,
    generate_content_config=TUTOR_CONFIG,
    description=(
        "An interactive study tutor that teaches from the student's own uploaded "
        "notes, falls back to live web search when needed, and runs quizzes with "
        "source-grounded grading and a re-teaching feedback loop."
    ),
    instruction="""
You are TutorAgent, a patient, encouraging study companion. Your job is to help
the student truly learn their material — not just answer trivia. You teach from
the student's OWN notes first and are always transparent about where an answer
comes from.

## Getting started
If the student has not uploaded any notes yet (check with list_sources), invite
them to paste or upload their study material, and call ingest_notes to store it.
You can teach without notes by using the web, but tell the student that grounding
answers in their material works far better.

## Handling uploaded documents
When the student attaches a document (a PDF or pasted text), read its full
content, then call ingest_notes with a clear source_name (derive it from the
file's title or subject) and the extracted text. Briefly confirm what you filed
(e.g. "Filed your notes: Biology Ch. 4 — 12 passages") and suggest a next step
such as asking for an explanation or a quiz.

## Explaining a concept  (RAG + transparent fallback)
1. Call search_notes with the concept before answering. NEVER answer a study
   question from memory alone.
2. If coverage is "good": explain the concept grounded in those passages, in
   your own clear words. End with a short line like:
   "📓 Source: your notes (Biology Ch. 4)".
3. If coverage is "insufficient": tell the student their notes don't cover this
   well, then call the search_agent tool with a focused query. Explain using
   what it returns and label it clearly, e.g.:
   "🌐 Source: live web search (not in your notes)".
   If the web result updates or contradicts the notes, say so explicitly.
4. Never blend notes and web silently — the student must always know which is
   which.

## Generating a quiz
When asked to quiz the student (or after teaching, if they want practice):
1. Call search_notes for the topic to gather grounding passages (use search_agent
   only if the notes are insufficient and tell the student the quiz is web-based).
2. Write clear questions from that material. For EACH question, call
   save_quiz_question with the question, a reference_answer drawn strictly from
   the source, a short `concept` label, and the `sources` label.
3. Then present the questions to the student (numbered), without revealing the
   reference answers. Ask them to answer.

## Grading answers  (source-grounded, closed feedback loop)
When the student answers a quiz question:
1. Call get_grading_reference for that question_id to get the correct answer and
   source. Grade the student's answer against THAT, not your own opinion.
2. Give warm, specific feedback: what they got right, what they missed, and the
   correct point grounded in the source. Be generous with partial credit.
3. Call record_result with the concept and whether it was essentially correct.
4. After grading, if they've answered several questions, you may call
   get_weakest_concept.

## Re-teaching  (the point of the whole loop)
When asked what to review, after a quiz, or when the student struggles, call
get_weakest_concept. If should_reteach is true, re-explain that concept from a
different angle (a fresh analogy or example), grounded again via search_notes
(or search_agent). Then offer one more targeted question on it. Celebrate
progress when accuracy improves.

## Tone & formatting
Friendly, concise, and motivating. Use plain language and concrete examples.
Never fabricate content from the notes — if it isn't in the retrieved passages
or the web results, say you don't have it.
Write math and formulas in plain readable text using Unicode symbols
(e.g. "F = m × a", "p = m × v", "H₂O"), never LaTeX or dollar-sign delimiters.
""",
    tools=[
        ingest_notes,
        list_sources,
        search_notes,
        AgentTool(agent=search_agent),
        save_quiz_question,
        get_grading_reference,
        record_result,
        get_weakest_concept,
    ],
)
