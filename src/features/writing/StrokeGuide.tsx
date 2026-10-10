import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { STROKES } from '../../content/strokes'
import { WRITE_ENTRIES } from '../../content/writing'
import { IconButton, Screen } from '../../design/ui'
import { type Stroke, letterStrokes } from './paths'
import s from './writing.module.css'

const CELL = 200

/**
 * Every letter's strokes on one page: numbered start dots and arrows in writing order.
 * For a grown-up to check the stroke order against what school teaches (and for us to
 * review the shapes); reached from the Writing room at #/write/guide.
 */
export function StrokeGuide() {
  const { t } = useApp()
  const navigate = useNavigate()
  const entries = WRITE_ENTRIES.filter((e) => STROKES[e.id])
  return (
    <Screen>
      <div className={s.bar}>
        <IconButton icon="close" label={t.writing.title} onClick={() => navigate('/write')} />
        <h1 className={s.title}>{t.writing.guide}</h1>
        <span style={{ width: 'var(--touch)' }} />
      </div>
      <div className={s.guideGrid}>
        {entries.map((e) => (
          <figure key={e.id} className={s.guideCell} data-testid={`guide-${e.id}`}>
            <StrokeDiagram strokes={letterStrokes(e.id, CELL, 0.72)} size={CELL} />
            <figcaption lang={e.lang}>{e.glyph}</figcaption>
          </figure>
        ))}
      </div>
    </Screen>
  )
}

/** Strokes with a numbered green start dot each and an arrow showing the direction. */
function StrokeDiagram({ strokes, size }: { strokes: Stroke[]; size: number }) {
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" aria-hidden="true">
      {strokes.map((st, i) =>
        st.dot ? null : <path key={`p${i}`} d={st.d} fill="none" stroke="#ddd2f5" strokeWidth={size * 0.07} strokeLinecap="round" strokeLinejoin="round" />,
      )}
      {strokes.map((st, i) => {
        const a = st.pts[0]
        if (!a) return null
        if (st.dot) {
          return (
            <g key={`n${i}`}>
              <circle cx={a.x} cy={a.y} r={size * 0.045} fill="#7a5cd6" />
              <Badge x={a.x + size * 0.06} y={a.y - size * 0.06} n={i + 1} size={size} />
            </g>
          )
        }
        const k = Math.floor(st.pts.length * 0.5)
        const m = st.pts[k]
        const m2 = st.pts[Math.min(st.pts.length - 1, k + 3)]
        const ang = m && m2 ? (Math.atan2(m2.y - m.y, m2.x - m.x) * 180) / Math.PI : 0
        return (
          <g key={`n${i}`}>
            <path d={st.d} fill="none" stroke="#7a5cd6" strokeWidth={size * 0.012} strokeDasharray={`${size * 0.02} ${size * 0.025}`} strokeLinecap="round" />
            {m && <path d="M-7 -6 L5 0 L-7 6 Z" fill="#e8613a" transform={`translate(${m.x} ${m.y}) rotate(${ang}) scale(${size / 200})`} />}
            <Badge x={a.x} y={a.y} n={i + 1} size={size} />
          </g>
        )
      })}
    </svg>
  )
}

function Badge({ x, y, n, size }: { x: number; y: number; n: number; size: number }) {
  const r = size * 0.05
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#3f9d33" stroke="#fff" strokeWidth={size * 0.01} />
      <text x={x} y={y} fill="#fff" fontSize={r * 1.3} fontWeight={800} textAnchor="middle" dominantBaseline="central">
        {n}
      </text>
    </g>
  )
}
