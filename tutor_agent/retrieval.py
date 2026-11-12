"""Lightweight, dependency-free retrieval layer for TutorAgent.

This is the "R" in RAG. It has no external dependencies (no vector database,
no embedding model) so the demo runs anywhere `google-adk` runs. Notes are
split into overlapping-free chunks and retrieved with a TF-IDF-style overlap
score. For a real deployment you would swap this module for a vector store
(e.g. Vertex AI Search, pgvector, Chroma) without touching the agent or tools.
"""

from __future__ import annotations

import math
import re
from typing import Any

# A small English stop-word list. Removing these before scoring keeps the
# retrieval focused on meaningful terms instead of glue words.
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "but", "by",
    "can", "could", "did", "do", "does", "for", "from", "had", "has", "have",
    "how", "i", "if", "in", "into", "is", "it", "its", "may", "might", "must",
    "no", "not", "of", "on", "or", "our", "shall", "should", "so", "some",
    "such", "than", "that", "the", "their", "them", "then", "there", "these",
    "they", "this", "to", "was", "we", "were", "what", "when", "where", "which",
    "who", "why", "will", "with", "would", "you", "your",
}

# Retrieval below this normalised score means the notes do not really cover the
# question — the agent should fall back to live web search instead of forcing a
# weak answer out of unrelated material.
COVERAGE_THRESHOLD = 0.18


def tokenize(text: str) -> list[str]:
    """Lowercase, split on non-alphanumerics, and drop stop-words / single chars."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w for w in words if len(w) > 1 and w not in STOPWORDS]


def chunk_text(text: str, source: str, target_words: int = 110) -> list[dict[str, Any]]:
    """Split raw notes into retrieval chunks.

    Splits on blank lines first (respecting the author's paragraphs), then packs
    paragraphs together until a chunk reaches roughly ``target_words`` words so
    that no single chunk is too large to cite precisely.

    Args:
        text: The raw notes content.
        source: A human-readable label for where the notes came from.
        target_words: Approximate maximum words per chunk.

    Returns:
        A list of chunk dicts, each ``{"source", "text"}`` (ids are assigned by
        the caller once the chunk joins the global store).
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[dict[str, Any]] = []
    buffer: list[str] = []
    buffer_words = 0

    def flush() -> None:
        nonlocal buffer, buffer_words
        if buffer:
            chunks.append({"source": source, "text": "\n\n".join(buffer)})
            buffer = []
            buffer_words = 0

    for para in paragraphs:
        words = len(para.split())
        # A single oversized paragraph becomes its own chunk.
        if words >= target_words:
            flush()
            chunks.append({"source": source, "text": para})
            continue
        if buffer_words + words > target_words:
            flush()
        buffer.append(para)
        buffer_words += words
    flush()

    # Fallback: notes with no blank lines at all still yield one chunk.
    if not chunks and text.strip():
        chunks.append({"source": source, "text": text.strip()})
    return chunks


def _build_idf(chunks: list[dict[str, Any]]) -> dict[str, float]:
    """Compute inverse-document-frequency weights across all chunks."""
    n = len(chunks)
    doc_freq: dict[str, int] = {}
    for chunk in chunks:
        for term in set(tokenize(chunk["text"])):
            doc_freq[term] = doc_freq.get(term, 0) + 1
    # Smoothed idf so a term in every chunk still carries a little weight.
    return {term: math.log((n + 1) / (df + 0.5)) + 1.0 for term, df in doc_freq.items()}


def rank_chunks(
    query: str, chunks: list[dict[str, Any]], top_k: int = 4
) -> list[dict[str, Any]]:
    """Rank stored chunks against a query.

    Scores each chunk by the sum of idf weights of the query terms it contains,
    normalised by the query length so scores are comparable across queries.

    Returns:
        Up to ``top_k`` chunks, each augmented with a ``score`` in roughly
        ``[0, 1]``, sorted most-relevant first. Chunks with a zero score are
        omitted.
    """
    if not chunks:
        return []

    query_terms = tokenize(query)
    if not query_terms:
        return []

    idf = _build_idf(chunks)
    max_possible = sum(idf.get(term, 1.0) for term in set(query_terms)) or 1.0

    scored: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_terms = set(tokenize(chunk["text"]))
        raw = sum(idf.get(term, 0.0) for term in set(query_terms) if term in chunk_terms)
        if raw <= 0:
            continue
        scored.append({**chunk, "score": round(raw / max_possible, 4)})

    scored.sort(key=lambda c: c["score"], reverse=True)
    return scored[:top_k]
