import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import type { Activity } from '../../content/schemas'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { IconButton, Screen } from '../../design/ui'
import { Visual } from '../../design/Visual'
import { recommendNext } from '../../domain/recommend'
import { audio } from '../../services/audio/AudioService'
import { db } from '../../services/db'
import { getMasteryMap } from '../../services/repos/progress'
import { forRecommend, iconFor, journeyCompleted, pick, playableActivities, useSpeakOnMount, visibleAreas } from '../common'
import s from './map.module.css'

/** Heights of the road's rows (px) and the stops' horizontal swing (% of the road's width). */
const STOP_H = 178
const SIGN_H = 64
const GOAL_H = 150
const SWING = [50, 72, 50, 28]
/** Scenery along the road (lexicon ids, so the pictures are always bundled). */
const SCENERY = ['tree', 'flower', 'butterfly', 'sunflower', 'bird', 'ladybug']

type Row =
  | { kind: 'sign'; level: number; y: number }
  | { kind: 'stop'; activity: Activity; i: number; x: number; y: number }
  | { kind: 'goal'; x: number; y: number }

/** Lay the whole area out as ONE road: a signpost when a new stage starts, then its stops, then the goal. */
function layout(acts: Activity[]): { rows: Row[]; height: number } {
  const rows: Row[] = []
  let y = 0
  let level = -1
  acts.forEach((a, i) => {
    if (a.level !== level) {
      level = a.level
      rows.push({ kind: 'sign', level, y })
      y += SIGN_H
    }
    rows.push({ kind: 'stop', activity: a, i, x: SWING[i % SWING.length]!, y })
    y += STOP_H
  })
  rows.push({ kind: 'goal', x: 50, y })
  return { rows, height: y + GOAL_H }
}

/** Smooth S-curves through the centre of every stop (and on to the goal). */
function roadPath(rows: Row[]): string {
  const pts = rows.filter((r): r is Extract<Row, { x: number }> => r.kind !== 'sign').map((r) => [r.x, r.y + 66] as const)
  if (pts.length === 0) return ''
  let d = `M ${pts[0]![0]} ${pts[0]![1]}`
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1]!
    const [x1, y1] = pts[k]!
    const mid = (y0 + y1) / 2
    d += ` C ${x0} ${mid}, ${x1} ${mid}, ${x1} ${y1}`
  }
  return d
}

/**
 * Learning map for one area: a single winding road from the first stop to a gold medal.
 * Stage names are signposts on the way; nothing is locked. Finished stops turn green with a
 * gold ✓, and Hala stands beside the suggested next stop ("you are here").
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

  const acts = [...playableActivities(vis, area.id)].sort((a, b) => a.level - b.level || a.order - b.order)
  const recommended = recommendNext(forRecommend(acts, lang), journey, mastery)
  const doneCount = acts.filter((a) => (counts.get(a.id) ?? 0) > 0).length
  const allDone = acts.length > 0 && doneCount === acts.length
  const { rows, height } = layout(acts)
  const road = roadPath(rows)
  const lit = acts.length ? Math.round((doneCount / acts.length) * 5) : 0

  return (
    <Screen className={s.mapScreen}>
      {/* Area banner in the area's colour: icon, name and progress stars. */}
      <header className={s.hero} style={{ '--accent': area.color } as CSSProperties}>
        <IconButton icon="home" label={t.common.home} onClick={() => navigate('/home')} />
        <span className={s.heroIcon}>
          <Visual v={iconFor(area, lang)} lang={lang} size={iconFor(area, lang).kind === 'glyph' ? 48 : 64} />
        </span>
        <span className={s.heroText}>
          <h1 className={s.heroTitle}>{area.title[settings.uiLang]}</h1>
          {acts.length > 0 && (
            <span className={s.heroStars} role="img" aria-label={`${doneCount} / ${acts.length}`}>
              {Array.from({ length: 5 }, (_, k) => (
                <Icon key={k} name="star" size={22} className={k < lit ? s.starOn : s.starOff} />
              ))}
            </span>
          )}
        </span>
      </header>

      <nav className={s.filters} aria-label={t.map.title}>
        {visible
          .filter((a) => a.route === 'map')
          .map((a) => (
            <button
              key={a.id}
              type="button"
              className={s.chip}
              style={{ '--accent': a.color } as CSSProperties}
              aria-current={a.id === area.id}
              onClick={() => {
                if (a.id === area.id) return
                audio.sfx('tap')
                navigate(`/map/${a.id}`, { replace: true })
              }}
            >
              <span className={s.chipIcon}>
                <Visual v={iconFor(a, lang)} lang={lang} size={iconFor(a, lang).kind === 'glyph' ? 26 : 38} />
              </span>
              <span className={s.chipLabel}>{a.title[settings.uiLang]}</span>
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

      {acts.length > 0 && (
        <div className={s.road} style={{ height }}>
          <svg className={s.roadLine} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
            <path className={s.roadEdge} d={road} />
            <path className={s.roadBand} d={road} />
            <path className={s.roadDash} d={road} />
          </svg>

          {rows.map((r) => {
            if (r.kind === 'sign') {
              return (
                <h2 key={`sign-${r.level}`} className={s.sign} style={{ top: r.y + 8 }}>
                  <Icon name="star" size={18} /> {t.map.levels[r.level - 1]}
                </h2>
              )
            }
            if (r.kind === 'goal') {
              return (
                <div key="goal" className={[s.goal, allDone ? s.goalDone : ''].join(' ')} style={{ left: `${r.x}%`, top: r.y }} aria-label={allDone ? t.map.done : undefined} role={allDone ? 'img' : undefined}>
                  <span className={s.medal} aria-hidden="true">
                    <Icon name="star" size={58} />
                  </span>
                </div>
              )
            }
            const a = r.activity
            const done = counts.get(a.id) ?? 0
            const isNext = recommended?.id === a.id
            const aLang = a.langs === 'any' ? lang : a.langs
            // Scenery sits outside the road's box, so it can alternate sides freely.
            const decoSide = r.i % 2 === 0 ? 'left' : 'right'
            return (
              <div key={a.id}>
                {/* A bit of scenery beside the road (wide screens only). */}
                <span className={[s.deco, decoSide === 'left' ? s.decoLeft : s.decoRight].join(' ')} style={{ top: r.y + 40, animationDelay: `${(r.i % 4) * 0.4}s` }} aria-hidden="true">
                  <Visual v={{ kind: 'lex', id: SCENERY[r.i % SCENERY.length]! }} lang={lang} size={54} />
                </span>
                <button
                  type="button"
                  className={[s.node, done ? s.done : '', isNext ? s.recommended : ''].join(' ')}
                  style={{ left: `${r.x}%`, top: r.y, animationDelay: `${r.i * 60}ms` }}
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
                    <span className={[s.hala, r.x > 50 ? s.halaLeft : s.halaRight].join(' ')} aria-hidden="true">
                      <Mascot mood="happy" size={64} />
                    </span>
                  )}
                  <span className={s.name} lang={aLang} dir="auto">
                    {pick(a.title, aLang)}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </Screen>
  )
}
