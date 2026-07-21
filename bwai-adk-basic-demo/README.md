# TutorAgent

TutorAgent is a study companion built on the [Google Agent Development Kit (ADK)](https://google.github.io/adk-docs/) that turns a student's own materials into an interactive tutor. Upload your notes and it explains concepts **grounded in your content**, falling back to **live Google Search** only when the notes fall short or go stale — and always labeling which is which.

Beyond explaining, it generates quiz questions from your material, grades your answers against the source, and re-teaches the concept you're weakest on. It's built as a **multi-agent system** (a tutor orchestrator that delegates web research to a dedicated search agent) and demonstrates RAG, tool use, source-grounded transparency, and a closed feedback loop — a genuine learning tool rather than another Q&A chatbot.

## What it demonstrates

| Capability | How |
| --- | --- |
| **RAG (retrieval-augmented generation)** | Your notes are chunked and retrieved with a TF-IDF-style relevance score before every answer ([`retrieval.py`](tutor_agent/retrieval.py)). |
| **Source-grounded transparency** | Every explanation is labeled `📓 your notes` or `🌐 live web search`; the two are never blended silently. |
| **Multi-agent delegation** | A `tutor_agent` orchestrator calls a dedicated `search_agent` (which owns the built-in `google_search` tool) via an `AgentTool`. |
| **Tool use** | Deterministic function tools handle memory and facts (ingest, retrieve, quiz, grade); the model handles wording. |
| **Closed feedback loop** | Answers are graded against the source, scored per concept, and the weakest concept is re-taught. |

## Architecture

```text
                        ┌─────────────────────────────────────────────┐
   student ──▶──────────│  tutor_agent  (root / orchestrator)          │
                        │                                              │
                        │  function tools:                             │
                        │   • ingest_notes / list_sources              │
                        │   • search_notes        ◀── RAG over notes   │
                        │   • save_quiz_question                       │
                        │   • get_grading_reference                    │
                        │   • record_result / get_weakest_concept      │
                        │                                              │
                        │   • search_agent (AgentTool) ────────────┐   │
                        └──────────────────────────────────────────┼───┘
                                                                   ▼
                                          ┌─────────────────────────────────┐
                                          │  search_agent                   │
                                          │   tool: google_search (live web)│
                                          └─────────────────────────────────┘
```

The built-in `google_search` tool cannot be combined with other tools in the same agent, so it lives in its own `search_agent`. This also gives a clean separation of concerns: the tutor decides *when* the notes fall short; the search agent handles *how* to query the live web.

## Project structure

```text
.
├── tutor_agent/
│   ├── __init__.py
│   ├── agent.py        # search_agent + tutor root_agent, prompts, wiring
│   ├── tools.py        # function tools over ADK session state
│   └── retrieval.py    # dependency-free RAG: chunking + TF-IDF ranking
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt
```

The retrieval layer has **no external dependencies** (no vector DB, no embedding model) so the demo runs anywhere ADK runs. For production you would swap [`retrieval.py`](tutor_agent/retrieval.py) for a real vector store (Vertex AI Search, pgvector, Chroma, …) without touching the agent or tools.

## Prerequisites

- **Python 3.10+** — ADK is a Python framework. Check with `python --version`.
- **An OpenRouter API key** — powers the tutor agent. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). Routing the tutor through OpenRouter avoids the Google free tier's 5-requests-per-minute limit.
- **A Google AI Studio API key** — powers the live web-search sub-agent, because the built-in `google_search` grounding tool only works on the native Google API. Get one at [aistudio.google.com](https://aistudio.google.com/).
- **Git**.

> **Why two keys?** This is a hybrid setup. The tutor (most of the requests) runs on OpenRouter's `google/gemini-3.5-flash`; the web-search sub-agent stays on the native Gemini API so `google_search` keeps working. Both are set in the model section of [`tutor_agent/agent.py`](tutor_agent/agent.py).

## Setup

1. Create and activate a virtual environment.

   Windows PowerShell:

   ```powershell
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

   macOS/Linux:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

2. Install dependencies.

   ```bash
   python -m pip install -r requirements.txt
   ```

3. Create your local environment file and add your credentials.

   Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   macOS/Linux:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and set both `OPENROUTER_API_KEY` and `GOOGLE_API_KEY`. `.env` is git-ignored — never commit it.

## Run the agent

From the repository root, with the virtual environment active:

```bash
adk web
```

This starts a local web server and a browser chat UI. Open the printed URL (e.g. `http://localhost:8000`) and select **`tutor_agent`**. Stop the server anytime with `Ctrl+C`.

## Custom web UI

Beyond the stock `adk web` dev UI, this repo ships a hand-built React front end in
[`frontend/`](frontend/) — a "study desk" interface where color is semantic
(ochre = your notes, teal = live web), every tutor reply carries a source margin,
and a live rail shows your filed materials and concept-mastery meters read from
session state. It talks to the ADK API server over `/run_sse`. See
[frontend/README.md](frontend/README.md) for the two-server run guide (note the
required `--allow_origins` flag).

## Try it

Paste some notes, then walk the full loop:

1. **Upload material**
   > "Here are my notes: *Photosynthesis converts light energy into chemical energy in the chloroplasts. The light-dependent reactions occur in the thylakoid membranes and produce ATP and NADPH. The Calvin cycle happens in the stroma and fixes CO₂ into glucose.*"

2. **Learn (grounded in your notes)**
   > "Explain the Calvin cycle." → answered from your notes, labeled `📓 your notes`.

3. **Watch the transparent web fallback**
   > "What's the latest research on artificial photosynthesis efficiency?" → not in your notes, so the tutor delegates to `search_agent` and labels it `🌐 live web search`.

4. **Quiz**
   > "Quiz me on this chapter." → generates questions from your notes and asks you to answer.

5. **Get graded against the source**
   > Answer a question → the tutor grades it against the reference drawn from your notes, gives partial credit, and records the result.

6. **Close the loop**
   > "What should I review?" → finds the concept you scored lowest on and re-teaches it from a fresh angle.

## How it works

- [`retrieval.py`](tutor_agent/retrieval.py) — `chunk_text` splits notes on paragraph boundaries into ~110-word chunks; `rank_chunks` scores them against a query using idf-weighted term overlap. A `COVERAGE_THRESHOLD` decides when the notes are too thin and the agent should go to the web.
- [`tools.py`](tutor_agent/tools.py) — function tools over ADK session state: `ingest_notes`, `list_sources`, `search_notes` (returns passages **and** a `coverage` verdict), `save_quiz_question`, `get_grading_reference`, `record_result`, and `get_weakest_concept` (the feedback loop).
- [`agent.py`](tutor_agent/agent.py) — the `search_agent` (owns `google_search`) and the `tutor_agent` orchestrator, whose instruction enforces: retrieve before answering, label every source, quiz and grade against the source, and re-teach the weakest concept.

## Extension ideas

- Swap `retrieval.py` for a real vector store with embeddings for semantic retrieval.
- Persist quiz history and scores across sessions with an ADK session/memory service.
- Support file uploads (PDF/DOCX) by extracting text before `ingest_notes`.
- Add a spaced-repetition scheduler that resurfaces weak concepts over time.
- Add a third specialist agent (e.g. a diagram or flashcard generator).

## Security

Keep API keys and cloud credentials only in your local `.env` file or a secure secret manager. If a secret is ever committed, revoke or rotate it before removing it from Git history.
