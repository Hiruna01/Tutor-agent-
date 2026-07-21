import { useRef, useState } from 'react'

// The opening thesis of the product: bring your own material, and every answer
// is grounded and cited. The drop zone is the most characteristic first action.
export default function EmptyState({ onPrompt, disabled }) {
  const [drag, setDrag] = useState(false)
  const fileRef = useRef(null)

  const sendFiles = (list) => {
    const files = Array.from(list || [])
    if (files.length) onPrompt('Here are my notes — please file them.', files)
  }

  return (
    <div className="empty">
      <p className="eyebrow">A study companion, not a chatbot</p>
      <h1 className="hero">
        Learn from <em>your own</em> notes.
        <br />
        Every answer says <span className="hl-notes">where it came from</span>.
      </h1>
      <p className="hero-sub">
        Upload your material and TutorAgent teaches from it — quizzing you,
        grading against the source, and re-teaching what you find hardest. When
        your notes fall short, it searches the web and tells you plainly.
      </p>

      <div
        className={`dropzone${drag ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          if (!disabled) sendFiles(e.dataTransfer.files)
        }}
        onClick={() => !disabled && fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            fileRef.current?.click()
          }
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,.csv,text/*,application/pdf"
          hidden
          onChange={(e) => {
            sendFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="drop-icon" aria-hidden="true">◧</div>
        <div className="drop-title">Drop your notes here</div>
        <div className="drop-hint">PDF, text, or Markdown — or click to browse</div>
      </div>

      <div className="starter-row">
        <span className="starter-label">or start with</span>
        <button className="chip" disabled={disabled} onClick={() => onPrompt('Explain a concept you can teach me, and show me how sources work.', [])}>
          A quick demo
        </button>
        <button className="chip" disabled={disabled} onClick={() => onPrompt('What can you do? Walk me through how to study with you.', [])}>
          How it works
        </button>
      </div>
    </div>
  )
}
