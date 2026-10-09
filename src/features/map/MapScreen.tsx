import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { Screen, TopBar } from '../../design/ui'
import { Visual } from '../../design/Visual'
import { recommendNext } from '../../domain/recommend'
import { db } from '../../services/db'
import { getMasteryMap } from '../../services/repos/progress'
import { forRecommend, iconFor, journeyCompleted, pick, playableActivities, useSpeakOnMount, visibleAreas } from '../common'
import s from './map.module.css'

/** Vertical distance between stops (px) and their horizontal swing (% of the road's width). */
const ROW = 178
const SWING = [50, 72, 50, 28]

/** Smooth S-curves through the centre of every stop's circle. */
function roadPath(n: number): string {
  const cy = (i: number) => i * ROW + 66
  let d = `M ${SWING[0]} ${cy(0)}`
  for (let i = 1; i < n; i++) {
    const x0 = SWING[(i - 1) % SWING.length]!
    const x1 = SWING[i % SWING.length]!
    const mid = (cy(i - 1) + cy(i)) / 2
    d += ` C ${x0} ${mid}, ${x1} ${mid}, ${x1} ${cy(i)}`
  }
  return d
}

/**
 * Learning map for one area: a winding road of stops, grouped by stage. Nothing is locked;
 * finished stops show a ✓, and Hala stands beside the suggested next one ("you are here").
 */
export function MapScreen() {
  const { areaId } = useParams()
  const { settings, t, langs } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang
  const vis = { disabledAreas: settings.disabledAreas, langs }
  const area = content.areas.find((a) => a.id === areaId)

  const counts = useLiveQuery(
    async () => {
      const m = new Map<string, number>()
      await db.completions.each((c) => m.set(c.activityId, (m.get(c.activityId) ?? 0) + 1))
      return m
    },
    [],
    new Map<string, number>(),
  )
  const mastery = useLiveQuery(getMasteryMap, [], new Map())
  const journey = useLiveQuery(() => journeyCompleted(vis), [settings.disabledAreas.join(), langs.join()], new Set<string>())

  useSpeakOnMount(area?.title[lang], lang)

  const visible = visibleAreas(vis)
  if (!area || !visible.some((a) => a.id === area.id)) return <Navigate to="/home" replace />

  const acts = playableActivities(vis, area.id)
  const recommended = recommendNext(forRecommend(acts, lang), journey, mastery)
  const levels = [...new Set(acts.map((a) => a.level))].sort()

  return (
    <Screen>
      <TopBar backTo="/home" backLabel={t.common.home} title={area.title[settings.uiLang]} />
      <nav className={s.filters} aria-label={t.map.title}>
        {visible
          .filter((a) => a.route === 'map')
          .map((a) => (
            <button key={a.id} type="button" className={s.chip} aria-current={a.id === area.id} onClick={() => navigate(`/map/${a.id}`, { replace: true })}>
              <Visual v={iconFor(a, lang)} lang={lang} size={40} />
              {a.title[settings.uiLang]}
            </button>
          ))}
      </nav>
      {area.id === 'islamic' && content.quran && (
        <button type="button" className={s.quranCard} onClick={() => navigate('/quran')}>
          <Visual v={{ kind: 'img', hex: '1F54C' }} lang={lang} size={72} />
          <span lang="ar" className={s.quranTitle}>
            {t.quran.title}
          </span>
        </button>
      )}
      {acts.length === 0 && !(area.id === 'islamic' && content.quran) && <p>{t.map.empty}</p>}
      {levels.map((level) => {
        const stops = acts.filter((a) => a.level === level)
        return (
          <section key={level} className={s.level}>
            <h2 className={s.levelTitle}>
              <Icon name="star" size={20} /> {t.map.levels[level - 1]}
            </h2>
            {/* A winding road: stops swing gently left and right, joined by a dotted path. */}
            <div className={s.road} style={{ height: stops.length * ROW + 10 }}>
              <svg className={s.roadLine} viewBox={`0 0 100 ${stops.length * ROW}`} preserveAspectRatio="none" aria-hidden="true">
                <path className={s.roadBand} d={roadPath(stops.length)} />
                <path className={s.roadDash} d={roadPath(stops.length)} />
              </svg>
              {stops.map((a, i) => {
                const done = counts.get(a.id) ?? 0
                const isNext = recommended?.id === a.id
                const aLang = a.langs === 'any' ? lang : a.langs
                const x = SWING[i % SWING.length]!
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={[s.node, done ? s.done : '', isNext ? s.recommended : ''].join(' ')}
                    style={{ left: `${x}%`, top: i * ROW }}
                    onClick={() => navigate(a.template === 'lesson' ? `/discover/${a.id}` : `/play/${a.id}`)}
                    aria-label={`${pick(a.title, aLang)}${done ? ` — ${t.map.done}` : ''}${isNext ? ` — ${t.map.next}` : ''}`}
                  >
                    <span className={s.circle}>
                      <Visual v={iconFor(a, aLang)} lang={aLang} size={68} />
                    </span>
                    {done > 0 && (
                      <span className={s.badge} aria-hidden="true">
                        <Icon name="check" size={16} />
                        {done > 1 && done}
                      </span>
                    )}
                    {isNext && (
                      <span className={[s.hala, x > 50 ? s.halaLeft : s.halaRight].join(' ')} aria-hidden="true">
                        <Mascot mood="happy" size={64} />
                      </span>
                    )}
                    <span className={s.name} lang={aLang} dir="auto">
                      {pick(a.title, aLang)}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </Screen>
  )
}
