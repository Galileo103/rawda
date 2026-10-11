import { useLiveQuery } from 'dexie-react-hooks'
import { type CSSProperties, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { gameTitle } from '../../content/games'
import { activityById, content, pick } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Button, Panel } from '../../design/ui'
import { Visual, visualText } from '../../design/Visual'
import type { MasteryRecord } from '../../domain/engine/mastery'
import { REMEMBER_ACTIVITY } from '../../domain/remember'
import { recommendNext } from '../../domain/recommend'
import type { Lang } from '../../domain/types'
import { fmt } from '../../i18n'
import { db, localDay } from '../../services/db'
import { extendToday } from '../../services/repos/progress'
import { forRecommend, iconFor, playableActivities } from '../common'
import { Fold } from './Fold'
import { lockParentArea } from './ParentArea'
import { ActivityChart, Milestones, PillarCards } from './PillarDashboard'
import { computePillars } from './pillarStats'
import { type Bucket, computeStats, practiceToday, skillAreas } from './progressStats'
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
  const { settings, profile, t, usage, langs } = useApp()
  const navigate = useNavigate()
  const [extended, setExtended] = useState(false)
  const ui = settings.uiLang
  const data = useLiveQuery(async () => ({
    completions: await db.completions.orderBy('ts').reverse().toArray(),
    mastery: await db.mastery.toArray(),
    attempts: await db.attempts.toArray(),
    drawings: (await db.drawings.toArray()).map((d) => ({ createdAt: d.createdAt })),
  }))
  if (!data) return null

  const stats = computeStats(data.completions, data.mastery, skillAreas(content.activities))
  const dash = computePillars({ attempts: data.attempts, mastery: data.mastery, drawings: data.drawings, activities: content.activities })
  const today = practiceToday(data.attempts)
  const conceptsToday = today.reduce((n, a) => n + a.concepts, 0)
  const doneToday = data.completions.filter((c) => localDay(c.ts) === localDay())
  const starsToday = doneToday.reduce((n, c) => n + c.stars, 0)
  const masteryMap = new Map(data.mastery.map((m) => [m.key, m]))
  const next = recommendNext(forRecommend(playableActivities({ disabledAreas: settings.disabledAreas, langs }), settings.practiceLang), new Set(data.completions.map((c) => c.activityId)), masteryMap)
  const fmtDate = new Intl.DateTimeFormat(ui === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const name = (ui === 'ar' ? profile.nameAr : profile.nameEn) ?? profile.nameAr ?? profile.nameEn ?? ''
  const areaOf = (id: string) => content.areas.find((a) => a.id === id)
  const anyMastery = data.mastery.length > 0

  const bar = (label: string, b: Bucket | undefined, key: string) => (
    <div key={key} className={s.bar}>
      <span>{label}</span>
      <span className={s.track} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((b?.avg ?? 0) * 100)} aria-label={label}>
        <span className={s.fill} style={{ width: `${Math.round((b?.avg ?? 0) * 100)}%` }} />
      </span>
      <span className={s.barNum}>{b ? `${b.mastered}/${b.practiced}` : '—'}</span>
    </div>
  )

  const conceptList = (recs: MasteryRecord[], empty: string) =>
    recs.length === 0 ? (
      <p className={s.muted}>{empty}</p>
    ) : (
      <ul className={s.list}>
        {recs.map((r) => (
          <li key={r.key} dir="auto">
            {skillLabel(r.skillId, r.lang, ui)} <span className={s.langTag}>{r.lang === 'ar' ? t.common.arabic : t.common.english}</span>
          </li>
        ))}
      </ul>
    )

  return (
    <div className={s.stack}>
      {/* What happened today: the first thing a parent wants to know. */}
      <section className={s.todayCard} data-testid="today-card" aria-labelledby="today-title">
        <h2 id="today-title">{name ? fmt(t.parent.today, { name }) : t.parent.tabs.progress}</h2>
        {conceptsToday > 0 ? (
          <>
            <p className={s.todayBig}>
              <b>{conceptsToday}</b> <span>{t.parent.todayConcepts}</span>
            </p>
            <ul className={s.areaChips}>
              {today.map(({ area, concepts }) => {
                const a = areaOf(area)
                return (
                  <li key={area} style={{ '--ac': a?.color ?? 'var(--teal)' } as CSSProperties}>
                    {a ? a.title[ui] : area} · <b>{concepts}</b>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className={s.todayNone}>{t.parent.todayNone}</p>
        )}
        <ul className={s.statChips}>
          <li>
            <Icon name="check" size={20} /> <b>{doneToday.length}</b> {t.parent.activitiesToday}
          </li>
          <li>
            <Icon name="star" size={20} /> <b>{starsToday}</b> {t.parent.starsToday}
          </li>
          <li>
            <Icon name="clock" size={20} /> {fmt(t.parent.minutes, { n: Math.round(usage.secondsToday / 60) })}
          </li>
          {dash.streakDays > 0 && (
            <li>
              <Icon name="again" size={20} /> {fmt(t.parent.streakDays, { n: dash.streakDays })}
            </li>
          )}
        </ul>
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
      </section>

      {next && (
        <section className={s.nextCard} aria-labelledby="next-title">
          <span className={s.nextIcon}>
            <Visual v={iconFor(next.activity, next.lang)} lang={next.lang} size={56} />
          </span>
          <div className={s.nextText}>
            <h2 id="next-title">{t.parent.upNext}</h2>
            <p className={s.nextTitle} lang={next.lang} dir="auto">
              {pick(next.activity.title, next.lang)}
            </p>
            <p className={s.muted}>{t.parent.upNextHint}</p>
          </div>
          <Button
            icon="play"
            onClick={() => {
              lockParentArea()
              navigate(`/play/${next.id}`)
            }}
          >
            {t.parent.startNow}
          </Button>
        </section>
      )}

      <Panel>
        <div className={s.section}>
          <h2>{t.pillars.chart}</h2>
          <ActivityChart dash={dash} />
        </div>
      </Panel>

      <Fold id="pillars" title={t.parent.secProgress} defaultOpen>
        <PillarCards dash={dash} />
      </Fold>

      <Fold id="subjects" title={t.parent.secSubjects}>
        <p className={s.muted}>{t.parent.barLegend}</p>
        <div className={s.grid2}>
          <div className={s.section}>
            <h3>{t.parent.byArea}</h3>
            <div className={s.bars}>{content.areas.filter((a) => a.route !== 'studio').map((a) => bar(a.title[ui], stats.byArea.get(a.id), a.id))}</div>
          </div>
          <div className={s.section}>
            <h3>{t.parent.byLang}</h3>
            <div className={s.bars}>
              {bar(t.common.arabic, stats.byLang.get('ar'), 'ar')}
              {bar(t.common.english, stats.byLang.get('en'), 'en')}
            </div>
          </div>
          <div className={s.section}>
            <h3>{t.parent.practisedLately}</h3>
            {conceptList(stats.practisedLately, t.parent.noData)}
          </div>
          <div className={s.section}>
            <h3>{t.parent.mastered}</h3>
            {conceptList(stats.recent, anyMastery ? t.parent.masteryBuilding : t.parent.noData)}
          </div>
          <div className={s.section}>
            <h3>{t.parent.practiceMore}</h3>
            {conceptList(stats.practiceMore, anyMastery ? t.parent.noExtraPractice : t.parent.noData)}
          </div>
        </div>
      </Fold>

      <Fold id="milestones" title={t.parent.secMilestones}>
        <Milestones dash={dash} />
      </Fold>

      <Fold id="history" title={t.parent.secHistory}>
        {data.completions.length === 0 ? (
          <p className={s.muted}>{t.parent.noCompletions}</p>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">{t.parent.colWhen}</th>
                  <th scope="col">{t.parent.colActivity}</th>
                  <th scope="col">{t.parent.colLang}</th>
                  <th scope="col">{t.parent.colStars}</th>
                </tr>
              </thead>
              <tbody>
                {data.completions.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td>{fmtDate.format(c.ts)}</td>
                    <td dir="auto">{pick(activityById(c.activityId)?.title, ui) || gameTitle(c.activityId, t) || (c.activityId === REMEMBER_ACTIVITY ? t.games.remember : c.activityId)}</td>
                    <td>{c.lang === 'ar' ? t.common.arabic : t.common.english}</td>
                    <td>
                      <Icon name="star" size={16} className={s.starIcon} /> {c.stars}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Fold>

      <p className={s.disclaimer}>{t.parent.disclaimer}</p>
    </div>
  )
}
