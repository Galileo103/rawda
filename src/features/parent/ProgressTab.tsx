import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useApp } from '../../app/AppState'
import { gameTitle } from '../../content/games'
import { activityById, content, pick } from '../../content/loader'
import { Button, Panel } from '../../design/ui'
import { visualText } from '../../design/Visual'
import type { MasteryRecord } from '../../domain/engine/mastery'
import { REMEMBER_ACTIVITY } from '../../domain/remember'
import { recommendNext } from '../../domain/recommend'
import type { Lang } from '../../domain/types'
import { db } from '../../services/db'
import { extendToday } from '../../services/repos/progress'
import { forRecommend, playableActivities } from '../common'
import { type Bucket, computeStats, skillAreas } from './progressStats'
import { PillarDashboard } from './PillarDashboard'
import s from './parent.module.css'

/** Human label for a skill id, derived from content (e.g. "Find the letter: ب"). */
function skillLabel(skill: string, lang: Lang, uiLang: Lang): string {
  for (const a of content.activities) {
    for (const item of a.items as { skill: string; answer?: unknown }[]) {
      if (item.skill !== skill) continue
      const ans = a.template === 'choice' && 'answer' in item ? visualText((item as { answer: Parameters<typeof visualText>[0] }).answer, lang) : ''
      return `${pick(a.title, uiLang)}${ans ? ` · ${ans}` : ''}`
    }
  }
  return skill
}

export function ProgressTab() {
  const { settings, t, usage, langs } = useApp()
  const [extended, setExtended] = useState(false)
  const ui = settings.uiLang
  const data = useLiveQuery(async () => ({
    completions: await db.completions.orderBy('ts').reverse().toArray(),
    mastery: await db.mastery.toArray(),
  }))
  if (!data) return null

  const stats = computeStats(data.completions, data.mastery, skillAreas(content.activities))
  const masteryMap = new Map(data.mastery.map((m) => [m.key, m]))
  const next = recommendNext(forRecommend(playableActivities({ disabledAreas: settings.disabledAreas, langs }), settings.practiceLang), new Set(data.completions.map((c) => c.activityId)), masteryMap)
  const fmtDate = new Intl.DateTimeFormat(ui === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const bar = (label: string, b: Bucket | undefined, key: string) => (
    <div key={key} className={s.bar}>
      <span>{label}</span>
      <span className={s.track} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((b?.avg ?? 0) * 100)} aria-label={label}>
        <span className={s.fill} style={{ display: 'block', width: `${Math.round((b?.avg ?? 0) * 100)}%` }} />
      </span>
      <span>
        {b ? `${b.mastered}/${b.practiced}` : '—'}
      </span>
    </div>
  )

  const conceptList = (recs: MasteryRecord[]) =>
    recs.length === 0 ? (
      <p style={{ margin: 0 }}>{t.parent.noData}</p>
    ) : (
      <ul className={s.list}>
        {recs.map((r) => (
          <li key={r.key} dir="auto">
            {skillLabel(r.skillId, r.lang, ui)} <small>({r.lang === 'ar' ? 'ع' : 'EN'})</small>
          </li>
        ))}
      </ul>
    )

  return (
    <div className={s.section}>
      <p className={s.note}>{t.parent.disclaimer}</p>
      <PillarDashboard />
      <div className={s.tiles}>
        <div className={s.tile}>
          <span className={s.tileNum}>{stats.activitiesDone}</span>
          <span className={s.tileLabel}>{t.parent.activitiesDone}</span>
        </div>
        <div className={s.tile}>
          <span className={s.tileNum}>{stats.conceptsPracticed}</span>
          <span className={s.tileLabel}>{t.parent.conceptsPracticed}</span>
        </div>
        <div className={s.tile}>
          <span className={s.tileNum}>{stats.stars}</span>
          <span className={s.tileLabel}>{t.parent.starsEarned}</span>
        </div>
        <div className={s.tile}>
          <span className={s.tileNum}>{Math.round(usage.secondsToday / 60)}</span>
          <span className={s.tileLabel}>{t.parent.minutesToday}</span>
        </div>
      </div>
      {settings.dailyLimitMin > 0 && (
        <div className={s.row}>
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => {
              void extendToday(15 * 60)
              setExtended(true)
            }}
          >
            {t.parent.extendToday}
          </Button>
          {extended && <span className={s.ok}>{t.parent.extended}</span>}
        </div>
      )}
      <div className={s.grid2}>
        <Panel>
          <div className={s.section}>
            <h2>{t.parent.byArea}</h2>
            <div className={s.bars}>{content.areas.filter((a) => a.route !== 'studio').map((a) => bar(a.title[ui], stats.byArea.get(a.id), a.id))}</div>
          </div>
        </Panel>
        <Panel>
          <div className={s.section}>
            <h2>{t.parent.byLang}</h2>
            <div className={s.bars}>
              {bar(t.common.arabic, stats.byLang.get('ar'), 'ar')}
              {bar(t.common.english, stats.byLang.get('en'), 'en')}
            </div>
            <h2>{t.parent.suggested}</h2>
            <p style={{ margin: 0 }}>{next ? pick(next.activity.title, ui) : '—'}</p>
          </div>
        </Panel>
        <Panel>
          <div className={s.section}>
            <h2>{t.parent.recent}</h2>
            {conceptList(stats.recent)}
          </div>
        </Panel>
        <Panel>
          <div className={s.section}>
            <h2>{t.parent.practiceMore}</h2>
            {conceptList(stats.practiceMore)}
          </div>
        </Panel>
      </div>
      <Panel>
        <div className={s.section}>
          <h2>{t.parent.history}</h2>
          {data.completions.length === 0 ? (
            <p style={{ margin: 0 }}>{t.parent.noData}</p>
          ) : (
            <table className={s.table}>
              <tbody>
                {data.completions.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate.format(c.ts)}</td>
                    <td dir="auto">{pick(activityById(c.activityId)?.title, ui) || gameTitle(c.activityId, t) || (c.activityId === REMEMBER_ACTIVITY ? t.games.remember : c.activityId)}</td>
                    <td>{c.lang === 'ar' ? 'العربية' : 'English'}</td>
                    <td>★ {c.stars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  )
}
