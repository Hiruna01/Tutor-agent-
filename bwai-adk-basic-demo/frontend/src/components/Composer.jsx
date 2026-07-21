import { useRef, useState } from 'react'

// Pre-suggested actions that map to the tutor's real capabilities.
const SUGGESTIONS = [
  { label: 'Make a quiz', prompt: 'Quiz me on the material I uploaded.' },
  { label: 'Explain a concept', prompt: 'Explain the most important concept in my notes, grounded in them.' },
  { label: "What's my weak spot?", prompt: 'What concept am I weakest on, and re-teach it.' },
  { label: 'Summarize my notes', prompt: 'Give me a concise summary of my notes, and tell me which parts are covered.' },
]

export default function Composer({ onSend, busy, ready, compact }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const fileRef = useRef(null)

  const submit = () => {
    if (busy || !ready) return
    if (!text.trim() && files.length === 0) return
    onSend(text, files)
    setText('')
    setFiles([])
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const addFiles = (list) => {
    const incoming = Array.from(list || [])
    if (incoming.length) setFiles((prev) => [...prev, ...incoming])
  }

  return (
    <div className="composer-wrap">
      {compact && (
        <div className="chip-row">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              className="chip"
              disabled={busy || !ready}
              onClick={() => onSend(s.prompt, [])}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="staged-files">
          {files.map((f, i) => (
            <span className="attach-chip staged" key={i}>
              <span className="paperclip" aria-hidden="true">◧</span>
              {f.name}
              <button
                className="x"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="composer">
        <button
          className="attach-btn"
          aria-label="Attach notes (PDF or text)"
          title="Attach notes (PDF or text)"
          disabled={busy || !ready}
          onClick={() => fileRef.current?.click()}
        >
          ＋
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,text/*,application/pdf"
          hidden
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <textarea
          className="input"
          rows={1}
          placeholder={
            ready ? 'Ask, paste notes, or attach a file…' : 'Connecting to the tutor…'
          }
          value={text}
          disabled={!ready}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
        />
        <button
          className="send"
          disabled={busy || !ready || (!text.trim() && files.length === 0)}
          onClick={submit}
        >
          {busy ? 'Teaching…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
