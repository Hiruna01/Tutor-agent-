import { useEffect, useRef, useState, useCallback } from 'react'
import {
  ROOT_AUTHOR,
  createSession,
  fileToPart,
  getSession,
  getUserId,
  runSSE,
} from './api.js'
import { labelForTool, TOOL_SOURCE } from './activity.js'
import MaterialsRail from './components/MaterialsRail.jsx'
import Message from './components/Message.jsx'
import Composer from './components/Composer.jsx'
import EmptyState from './components/EmptyState.jsx'

let msgSeq = 0
const nextId = () => `m${++msgSeq}`

// Infer provenance from the tutor's own source labels + the tools it ran.
function inferSource(text, steps) {
  if (/🌐|live web|web search/i.test(text)) return 'web'
  if (/📓|your notes|from your notes/i.test(text)) return 'notes'
  if (steps.some((s) => s.tool === 'search_agent')) return 'web'
  if (steps.some((s) => s.tool === 'search_notes')) return 'notes'
  return null
}

// Derive the rail's live view (sources + concept mastery) from session state.
function railFromState(state = {}) {
  const chunks = state.notes_chunks || []
  const counts = {}
  for (const c of chunks) counts[c.source] = (counts[c.source] || 0) + 1
  const sources = Object.entries(counts)
    .map(([source, n]) => ({ source, chunks: n }))
    .sort((a, b) => a.source.localeCompare(b.source))

  const scores = state.scores || {}
  const concepts = Object.entries(scores)
    .map(([concept, s]) => ({
      concept,
      correct: s.correct,
      total: s.total,
      accuracy: s.total ? s.correct / s.total : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)

  return { sources, concepts }
}

export default function App() {
  const userId = useRef(getUserId()).current
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [rail, setRail] = useState({ sources: [], concepts: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const scrollRef = useRef(null)

  // Bootstrap a session on load.
  useEffect(() => {
    createSession(userId)
      .then(setSessionId)
      .catch((e) => setError(e.message))
  }, [userId])

  // Keep the transcript pinned to the latest turn.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const patchLast = useCallback((patch) => {
    setMessages((prev) => {
      const copy = prev.slice()
      const last = copy[copy.length - 1]
      copy[copy.length - 1] = { ...last, ...patch(last) }
      return copy
    })
  }, [])

  const send = useCallback(
    async (text, files = []) => {
      if (busy || !sessionId) return
      const trimmed = text.trim()
      if (!trimmed && files.length === 0) return

      setError(null)
      setBusy(true)

      const parts = []
      const attachments = []
      for (const f of files) {
        parts.push(await fileToPart(f))
        attachments.push({ name: f.name, type: f.type })
      }
      if (trimmed) parts.push({ text: trimmed })

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'user', text: trimmed, attachments },
        { id: nextId(), role: 'tutor', text: '', steps: [], streaming: true },
      ])

      let acc = ''
      const seenTools = new Set()

      try {
        await runSSE({
          userId,
          sessionId,
          parts,
          onEvent: (ev) => {
            const content = ev.content
            if (!content?.parts) return
            for (const part of content.parts) {
              if (part.functionCall) {
                const name = part.functionCall.name
                if (!seenTools.has(name + acc.length)) {
                  seenTools.add(name + acc.length)
                  patchLast((m) => ({
                    steps: [
                      ...m.steps,
                      {
                        tool: name,
                        label: labelForTool(name),
                        source: TOOL_SOURCE[name] || null,
                      },
                    ],
                  }))
                }
              }
              if (typeof part.text === 'string' && ev.author === ROOT_AUTHOR) {
                if (ev.partial) {
                  // Handle both delta and cumulative streaming shapes.
                  acc = part.text.startsWith(acc) ? part.text : acc + part.text
                } else if (part.text) {
                  // Non-partial events carry the full aggregated text — but the
                  // tool-call turns emit an empty final text part, which must
                  // never wipe the answer we've accumulated.
                  acc = part.text
                }
                if (acc) patchLast(() => ({ text: acc }))
              }
            }
          },
        })
      } catch (e) {
        setError(e.message)
        acc = acc || '⚠️ ' + e.message
      }

      patchLast((m) => ({
        text: acc,
        streaming: false,
        source: inferSource(acc, m.steps),
      }))
      setBusy(false)

      // Refresh the live rail from authoritative session state.
      try {
        const s = await getSession(userId, sessionId)
        setRail(railFromState(s.state))
      } catch {
        /* rail is best-effort */
      }
    },
    [busy, sessionId, userId, patchLast]
  )

  const started = messages.length > 0

  return (
    <div className="desk">
      <MaterialsRail rail={rail} ready={!!sessionId} />

      <main className="stage">
        <header className="stage-head">
          <div className="wordmark">
            Tutor<span>Agent</span>
          </div>
          <p className="tagline">Learns from your notes. Cites its sources.</p>
        </header>

        <div className="transcript" ref={scrollRef}>
          {!started && <EmptyState onPrompt={send} disabled={busy || !sessionId} />}
          {messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
        </div>

        {error && <div className="banner" role="alert">{error}</div>}

        <Composer onSend={send} busy={busy} ready={!!sessionId} compact={started} />
      </main>
    </div>
  )
}
