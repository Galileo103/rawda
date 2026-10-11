import type { CSSProperties } from 'react'
import { useApp } from '../../app/AppState'
import { PILLARS, type Pillar } from '../../content/schemas'
import { Icon, type IconName } from '../../design/Icon'
import { fmt } from '../../i18n'
import s from './parent.module.css'
import type { PillarDashboard, PillarStat } from './pillarStats'

const LOOK: Record<Pillar, { color: string; icon: IconName }> = {
  speech: { color: 'var(--coral)', icon: 'mic' },
  logic: { color: 'var(--grape)', icon: 'shapes' },
  motor: { color: 'var(--teal)', icon: 'hand' },
  creativity: { color: 'var(--sun)', icon: 'brush' },
}
const OTHER = 'var(--sky)'

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
        <Icon name={icon} size={26} />
        <b>{pct}%</b>
      </span>
    </div>
  )
}

/** The four pillar cards (speaking, logic, fine motor, creativity). */
export function PillarCards({ dash }: { dash: PillarDashboard }) {
  const { t } = useApp()
  const P = t.pillars
  const caption = (st: PillarStat): string => {
    if (st.total === 0) return P.notStarted
    switch (st.pillar) {
      case 'speech':
        return fmt(P.saidAloud, { n: st.total })
      case 'motor':
        return fmt(P.coverage, { p: Math.round(st.detail * 100) })
      case 'logic':
        return fmt(P.firstTry, { p: Math.round(st.detail * 100) })
      case 'creativity':
        return fmt(P.drawings, { n: st.total })
    }
  }
  return (
    <section className={s.section} aria-label={P.title} data-testid="pillar-dashboard">
      <p className={s.muted}>{P.scope}</p>
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
    </section>
  )
}

/** 14-day stacked bar chart: the four pillars plus "other learning", so every day with learning shows. */
export function ActivityChart({ dash }: { dash: PillarDashboard }) {
  const { t, settings } = useApp()
  const P = t.pillars
  const W = 420
  const H = 130
  const barW = 20
  const gap = (W - 14 * barW) / 14
  const totalOf = (d: PillarDashboard['days'][number]) => PILLARS.reduce((n, p) => n + d.counts[p], 0) + d.other
  const max = Math.max(1, ...dash.days.map(totalOf))
  const any = dash.days.some((d) => totalOf(d) > 0)
  const dayFmt = new Intl.DateTimeFormat(settings.uiLang === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric' })
  if (!any) return <p className={s.muted}>{P.chartEmpty}</p>
  const series: { key: string; color: string; label: string; value: (d: PillarDashboard['days'][number]) => number }[] = [
    ...PILLARS.map((p) => ({ key: p, color: LOOK[p].color, label: P.names[p], value: (d: PillarDashboard['days'][number]) => d.counts[p] })),
    { key: 'other', color: OTHER, label: P.other, value: (d) => d.other },
  ]
  return (
    <div className={s.section} data-testid="activity-chart">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className={s.chart} role="img" aria-label={P.chart}>
        {dash.days.map((d, i) => {
          const x = gap / 2 + i * (barW + gap)
          let y = H
          return (
            <g key={d.day}>
              <rect x={x} y={0} width={barW} height={H} rx={6} className={s.chartTrack} />
              {series.map((se) => {
                const h = (se.value(d) / max) * (H - 6)
                if (h <= 0) return null
                y -= h
                return <rect key={se.key} x={x} y={y} width={barW} height={h} rx={4} style={{ fill: se.color }} />
              })}
              <text x={x + barW / 2} y={H + 17} className={s.chartLabel}>
                {dayFmt.format(new Date(`${d.day}T12:00:00`))}
              </text>
            </g>
          )
        })}
      </svg>
      <div className={s.legend}>
        {series.map((se) => (
          <span key={se.key}>
            <i style={{ background: se.color }} />
            {se.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function Milestones({ dash }: { dash: PillarDashboard }) {
  const { t } = useApp()
  return (
    <ul className={s.milestones}>
      {dash.milestones.map((m) => (
        <li key={m.id} className={m.done ? s.msDone : ''}>
          <span className={s.msBadge} aria-hidden="true">
            <Icon name={m.done ? 'check' : 'star'} size={20} />
          </span>
          {t.pillars.milestone[m.id]}
        </li>
      ))}
    </ul>
  )
}
