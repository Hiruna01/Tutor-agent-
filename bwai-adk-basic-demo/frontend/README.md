# TutorAgent — Web UI

A custom React front end for the [TutorAgent](../README.md) ADK agent. It is a
hand-built "study desk" interface — not the stock `adk web` dev UI — designed
around the one thing that makes TutorAgent different from a chatbot:
**provenance**. Color is semantic (ochre = your notes, teal = live web), every
tutor reply carries a source margin, and a live rail reads real session state to
show your filed materials and concept-mastery meters.

## Design in one line

Type inverts the usual AI look — a serif (*Newsreader*) carries the tutor's
*teaching* voice, a grotesque (*Bricolage Grotesque*) the chrome, mono
(*Space Mono*) the marginalia. The signature element is the **source margin**: a
colored rule + tag on each answer, echoed by the mastery meters in the rail.

## Running it (two servers)

The UI talks to the ADK API server. You need both running.

**1 — Start the ADK API server** (from the repository root, venv active):

```bash
adk api_server --host 127.0.0.1 --port 8000 --allow_origins http://localhost:5173 .
```

`--allow_origins http://localhost:5173` is **required** — without it the browser's
`Origin` header makes ADK reject every request with `403 Forbidden`. (The Vite
dev server also proxies these routes, so the browser stays same-origin; the flag
covers the preflight/Origin check either way.)

**2 — Start the front end** (in this `frontend/` folder):

```bash
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`). If your API server runs
somewhere other than `http://127.0.0.1:8000`, set `ADK_URL` before `npm run dev`
(the Vite proxy reads it — see [vite.config.js](vite.config.js)).

## What you can do

- **Drop notes** (PDF, text, or Markdown) onto the empty state, or attach them
  with the ＋ button. PDFs are sent inline; Gemini reads them and the tutor files
  them into your materials.
- **Suggested actions** — Make a quiz · Explain a concept · What's my weak spot? ·
  Summarize my notes — map to the tutor's real capabilities.
- Watch the **activity steps** (searching your notes, searching the web, writing a
  question…) so the RAG + multi-agent process is visible, not hidden.
- The **rail** updates live from session state: filed sources and per-concept
  mastery meters (the weakest concept is flagged "next to review").

## A note on the free Gemini tier

The free tier allows only **5 model requests per minute**. A single quiz-and-grade
exchange makes several requests (one per tool round-trip), so you can hit a
`429 RESOURCE_EXHAUSTED` mid-turn. The UI surfaces this as a friendly message —
wait about a minute and continue, or enable billing on your Google AI Studio key
for smooth use.

## How it connects

- [`src/api.js`](src/api.js) — session creation, `POST /run_sse` with manual SSE
  parsing (streaming can't use `EventSource`, which is GET-only), and
  `File → genai part` conversion.
- [`src/App.jsx`](src/App.jsx) — turn state, incremental text accumulation
  (handles ADK's delta + empty-final-text streaming shape), tool-activity steps,
  in-stream error handling, and the live rail refresh from session state.
- [`src/components/`](src/components) — `MaterialsRail`, `Message` (the source
  margin), `Composer` (attach + suggestions), `EmptyState` (drop zone).
- [`src/styles.css`](src/styles.css) — the full "Ink & Highlighter" token system.
