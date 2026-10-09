import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { PILLARS, type Pillar } from '../../content/schemas'
import { Icon, type IconName } from '../../design/Icon'
import { Panel } from '../../design/ui'
import { fmt } from '../../i18n'
import { db } from '../../services/db'
import s from './parent.module.css'
import { computePillars, type PillarStat } from './pillarStats'

const LOOK: Record<Pillar, { color: string; icon: IconName }> = {
  speech: { color: 'var(--coral)', icon: 'mic' },
  logic: { color: 'var(--grape)', icon: 'shapes' },
  motor: { color: 'var(--teal)', icon: 'hand' },
  creativity: { color: 'var(--sun)', icon: 'brush' },
}

/** Progress ring (SVG, no chart library, works offline). */
function Ring({ value, color, icon, label }: { value: number; color: string; icon: IconName; label: string }) {
  const r = 42
  const c = 2 * Math.PI * r
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div className={s.ring} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className={s.ringTrack} />
        {pct > 0 && <circle cx="50" cy="50" r={r} className={s.ringFill} style={{ stroke: color, strokeDasharray: `${(c * pct) / 100} ${c}` }} />}
      </svg>
      <span className={s.ringCenter} style={{ color }}>
        <Icon name={icon} size={30} />
        <b>{pct}%</b>
      </span>
    </div>
  )
}

export function PillarDashboard() {
  const { t, settings } = useApp()
  const ui = settings.uiLang
  const data = useLiveQuery(async () => ({
    attempts: await db.attempts.toArray(),
    mastery: await db.mastery.toArray(),
    drawings: (await db.drawings.toArray()).map((d) => ({ createdAt: d.createdAt })),
  }))
  if (!data) return null
  const dash = computePillars({ ...data, activities: content.activities })
  const P = t.pillars

  const caption = (st: PillarStat): string => {
    if (st.total === 0) return P.notStarted
    switch (st.pillar) {
      case 'speech':
        return dash.wordsHeard > 0 ? `${fmt(P.saidAloud, { n: st.total })} · ${fmt(P.heard, { n: dash.wordsHeard })}` : fmt(P.saidAloud, { n: st.total })
      case 'motor':
        return fmt(P.coverage, { p: Math.round(st.detail * 100) })
      case 'logic':
        return fmt(P.firstTry, { p: Math.round(st.detail * 100) })
      case 'creativity':
        return fmt(P.drawings, { n: st.total })
    }
  }

  // 14-day stacked bar chart.
  const W = 420
  const H = 150
  const barW = 20
  const gap = (W - 14 * barW) / 14
  const max = Math.max(1, ...dash.days.map((d) => PILLARS.reduce((n, p) => n + d.counts[p], 0)))
  const anyDays = dash.days.some((d) => PILLARS.some((p) => d.counts[p] > 0))
  const dayFmt = new Intl.DateTimeFormat(ui === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric' })

  return (
    <section className={s.section} aria-labelledby="pillars-title" data-testid="pillar-dashboard">
      <div className={s.pillarHead}>
        <h2 id="pillars-title">{P.title}</h2>
        {dash.streakDays > 0 && (
          <span className={s.streakChip}>
            <Icon name="star" size={20} /> {fmt(P.streak, { n: dash.streakDays })}
          </span>
        )}
      </div>

      <div className={s.pillarGrid}>
        {PILLARS.map((p) => {
          const st = dash.pillars[p]
          const look = LOOK[p]
          return (
            <div key={p} className={s.pillarCard} style={{ '--pc': look.color } as CSSProperties} data-testid={`pillar-${p}`}>
              <Ring value={st.level} color={look.color} icon={look.icon} label={`${P.names[p]} · ${p === 'creativity' ? P.activity : P.level}`} />
              <div className={s.pillarText}>
                <h3>{P.names[p]}</h3>
                <p className={s.pillarAbout}>{P.about[p]}</p>
                <p className={s.pillarDetail}>{caption(st)}</p>
                <span className={s.weekChip}>{fmt(P.thisWeek, { n: st.week })}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className={s.grid2}>
        <Panel>
          <div className={s.section}>
            <h2>{P.chart}</h2>
            {anyDays ? (
              <>
                <svg viewBox={`0 0 ${W} ${H + 22}`} className={s.chart} role="img" aria-label={P.chart}>
                  {dash.days.map((d, i) => {
                    const x = gap / 2 + i * (barW + gap)
                    let y = H
                    return (
                      <g key={d.day}>
                        <rect x={x} y={0} width={barW} height={H} rx={6} className={s.chartTrack} />
                        {PILLARS.map((p) => {
                          const h = (d.counts[p] / max) * (H - 6)
                          if (h <= 0) return null
                          y -= h
                          return <rect key={p} x={x} y={y} width={barW} height={h} rx={4} style={{ fill: LOOK[p].color }} />
                        })}
                        <text x={x + barW / 2} y={H + 17} className={s.chartLabel}>
                          {dayFmt.format(new Date(`${d.day}T12:00:00`))}
                        </text>
                      </g>
                    )
                  })}
                </svg>
                <div className={s.legend}>
                  {PILLARS.map((p) => (
                    <span key={p}>
                      <i style={{ background: LOOK[p].color }} />
                      {P.names[p]}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ margin: 0 }}>{P.chartEmpty}</p>
            )}
          </div>
        </Panel>
        <Panel>
          <div className={s.section}>
            <h2>{P.milestones}</h2>
            <ul className={s.milestones}>
              {dash.milestones.map((m) => (
                <li key={m.id} className={m.done ? s.msDone : ''}>
                  <span className={s.msBadge} aria-hidden="true">
                    <Icon name={m.done ? 'check' : 'star'} size={20} />
                  </span>
                  {P.milestone[m.id]}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </section>
  )
}
