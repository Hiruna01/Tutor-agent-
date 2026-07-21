// A single turn. Tutor turns carry the signature "source margin": a colored
// rule + mono tag encoding whether the answer came from notes or the web.

const SOURCE_TAG = {
  notes: 'Your notes',
  web: 'Live web',
}

// Safety net for stray LaTeX: the tutor is told to write plain-text math, but
// if any slips through we strip delimiters and map common commands to Unicode
// so the reader never sees raw "$...$" markup.
function demath(text) {
  return text
    .replace(/\\\((.+?)\\\)/g, '$1')
    .replace(/\\\[(.+?)\\\]/g, '$1')
    .replace(/\$([^$\n]+)\$/g, '$1')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
}

// Minimal, safe inline formatting — no dangerouslySetInnerHTML, no deps.
// Renders **bold**, *italic*, `code`, and paragraph/line breaks.
function renderRich(raw) {
  const text = demath(raw)
  const blocks = text.split(/\n{2,}/)
  return blocks.map((block, bi) => {
    const lines = block.split('\n')
    return (
      <p key={bi}>
        {lines.map((line, li) => (
          <span key={li}>
            {renderInline(line)}
            {li < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    )
  })
}

function renderInline(line) {
  const tokens = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return tokens.map((t, i) => {
    if (/^\*\*[^*]+\*\*$/.test(t)) return <strong key={i}>{t.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(t)) return <em key={i}>{t.slice(1, -1)}</em>
    if (/^`[^`]+`$/.test(t)) return <code key={i}>{t.slice(1, -1)}</code>
    return t
  })
}

export default function Message({ m }) {
  if (m.role === 'user') {
    return (
      <div className="turn turn-user">
        <div className="bubble">
          {m.attachments?.length > 0 && (
            <div className="attach-row">
              {m.attachments.map((a, i) => (
                <span className="attach-chip" key={i}>
                  <span className="paperclip" aria-hidden="true">◧</span>
                  {a.name}
                </span>
              ))}
            </div>
          )}
          {m.text && <div className="user-text">{m.text}</div>}
        </div>
      </div>
    )
  }

  const src = m.source
  return (
    <div className={`turn turn-tutor${src ? ' src-' + src : ''}`}>
      <div className="margin-rule" aria-hidden="true" />
      <div className="tutor-body">
        <div className="turn-meta">
          <span className="who">Tutor</span>
          {src && (
            <span className={`source-tag source-${src}`}>
              {src === 'web' ? '🌐' : '📓'} {SOURCE_TAG[src]}
            </span>
          )}
        </div>

        {m.steps?.length > 0 && (
          <ul className="steps">
            {m.steps.map((s, i) => (
              <li key={i} className={s.source ? 'step src-' + s.source : 'step'}>
                <span className="step-dot" aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        )}

        <div className="prose">
          {m.text ? (
            renderRich(m.text)
          ) : m.streaming ? (
            <span className="thinking">
              <span></span><span></span><span></span>
            </span>
          ) : null}
          {m.streaming && m.text && <span className="caret" aria-hidden="true" />}
        </div>
      </div>
    </div>
  )
}
