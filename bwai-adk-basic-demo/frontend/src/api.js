// Thin client for the Google ADK API server (`adk api_server`).
// Endpoints and camelCase body shape verified against google-adk 2.5.0.

// Base URL of the hosted ADK backend. In local dev this stays empty and the
// Vite proxy (see vite.config.js) forwards relative paths to localhost:8000.
// In production set VITE_ADK_URL to your deployed backend, e.g.
// https://tutor-agent-backend.onrender.com  (no trailing slash).
const BASE = (import.meta.env.VITE_ADK_URL || '').replace(/\/$/, '')

export const APP_NAME = 'tutor_agent'

// The root agent's name — only text authored by it becomes message body;
// sub-agent (search_agent) chatter surfaces as activity steps instead.
export const ROOT_AUTHOR = 'tutor_agent'

// Stable per-browser user id so sessions can be resumed across reloads.
export function getUserId() {
  let id = localStorage.getItem('tutor_user_id')
  if (!id) {
    id = 'u_' + Math.random().toString(36).slice(2, 10)
    localStorage.setItem('tutor_user_id', id)
  }
  return id
}

export async function createSession(userId) {
  const res = await fetch(`${BASE}/apps/${APP_NAME}/users/${userId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!res.ok) throw new Error(`Could not start a session (${res.status})`)
  const data = await res.json()
  return data.id
}

export async function getSession(userId, sessionId) {
  const res = await fetch(
    `${BASE}/apps/${APP_NAME}/users/${userId}/sessions/${sessionId}`
  )
  if (!res.ok) throw new Error(`Could not load session (${res.status})`)
  return res.json()
}

// Convert a File to a genai Content part. PDFs/images ride along as inline
// bytes (Gemini reads them natively); text-like files become a labeled text
// part so the tutor can ingest them verbatim.
export async function fileToPart(file) {
  const isText =
    file.type.startsWith('text/') ||
    /\.(txt|md|markdown|csv)$/i.test(file.name)
  if (isText) {
    const text = await file.text()
    return { text: `[Attached notes: ${file.name}]\n\n${text}` }
  }
  const buf = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  return {
    inlineData: {
      mimeType: file.type || 'application/pdf',
      data: base64,
    },
  }
}

// POST /run_sse and parse the Server-Sent-Events stream. `onEvent` receives
// each decoded ADK Event object as it arrives.
export async function runSSE({ userId, sessionId, parts, onEvent, signal }) {
  const res = await fetch(`${BASE}/run_sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      appName: APP_NAME,
      userId,
      sessionId,
      streaming: true,
      newMessage: { role: 'user', parts },
    }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`The tutor could not be reached (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line.
    let sep
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      for (const line of frame.split('\n')) {
        const trimmed = line.trimStart()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        try {
          onEvent(JSON.parse(payload))
        } catch {
          /* ignore keep-alive / non-JSON frames */
        }
      }
    }
  }
}
