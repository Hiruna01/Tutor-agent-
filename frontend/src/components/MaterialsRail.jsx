// The left "study desk" rail: a live view of session state — the materials the
// tutor is grounded in, and the concept-mastery meters that make the feedback
// loop visible. Both are read straight from ADK session state.

function pct(n) {
  return Math.round(n * 100)
}

export default function MaterialsRail({ rail, ready }) {
  const { sources, concepts } = rail
  return (
    <aside className="rail">
      <div className="rail-top">
        <div className="mark" aria-hidden="true">◧</div>
        <div className="rail-status">
          <span className={`dot ${ready ? 'on' : ''}`} />
          {ready ? 'Session live' : 'Connecting…'}
        </div>
      </div>

      <section className="rail-block">
        <h2 className="rail-label">Your materials</h2>
        {sources.length === 0 ? (
          <p className="rail-empty">
            Nothing filed yet. Upload notes and they’ll appear here as sources
            the tutor can cite.
          </p>
        ) : (
          <ul className="source-list">
            {sources.map((s) => (
              <li key={s.source} className="source-card">
                <span className="source-name">{s.source}</span>
                <span className="source-count">
                  {s.chunks} {s.chunks === 1 ? 'passage' : 'passages'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rail-block">
        <h2 className="rail-label">Concept mastery</h2>
        {concepts.length === 0 ? (
          <p className="rail-empty">
            Take a quiz and your strongest and weakest concepts show up here.
          </p>
        ) : (
          <ul className="mastery-list">
            {concepts.map((c, i) => {
              const p = pct(c.accuracy)
              const weakest = i === 0 && c.accuracy < 1
              return (
                <li key={c.concept} className="mastery">
                  <div className="mastery-head">
                    <span className="mastery-name">{c.concept}</span>
                    <span className="mastery-score">
                      {c.correct}/{c.total}
                    </span>
                  </div>
                  <div className="meter" role="meter" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className={`meter-fill ${weakest ? 'weak' : ''}`}
                      style={{ width: `${p}%` }}
                    />
                  </div>
                  {weakest && <span className="reteach-flag">next to review</span>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="legend">
        <span className="legend-item"><span className="swatch notes" /> Your notes</span>
        <span className="legend-item"><span className="swatch web" /> Live web</span>
      </div>
    </aside>
  )
}
