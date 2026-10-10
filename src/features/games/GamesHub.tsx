import { useLiveQuery } from 'dexie-react-hooks'
import { type CSSProperties, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { GAMES, GARDEN, type GameDef, type NeedKey, type Readiness, gameReadiness } from '../../content/games'
import { Mascot } from '../../design/Mascot'
import { Button, Screen, SpeechBubble, StarCount, TopBar } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import { gameStage, gardenUnlocked, STARS_PER_PLANT, starsToNextPlant } from '../../domain/garden'
import type { Lang } from '../../domain/types'
import { type Dict, dict, fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { gamePlays, totalStars } from '../../services/repos/progress'
import { useSpeakOnMount } from '../common'
import { cx } from './engine'
import s from './games.module.css'
import { useLearnedPools } from './useLearned'

/** Games whose card can say how many learned things they play with. */
const COUNTED: ReadonlySet<NeedKey> = new Set(['letters', 'numbers', 'run', 'colors', 'shapes'])

function toNextText(n: number, t: Dict, lang: Lang): string {
  if (n <= 0) return t.games.gardenFull
  if (n === 1) return t.games.toNextOne
  if (n === 2) return t.games.toNextTwo
  return fmt(t.games.toNext, { n: numeral(n, lang) })
}

/** Play World: every game, grouped, with its stage — plus a peek at Hala's garden. */
export function GamesHub() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang
  const ui = settings.uiLang
  const d = dict(lang)
  const plays = useLiveQuery(gamePlays, [], new Map<string, number>())
  const stars = useLiveQuery(totalStars, [], 0)
  const learned = useLearnedPools()
  useSpeakOnMount(d.games.hubHello, lang)

  const games = GAMES.filter((g) => !settings.disabledAreas.includes(g.areaId))
  const out = gardenUnlocked(stars, GARDEN.length)

  const open = (g: GameDef) => {
    audio.sfx('tap')
    void audio.speak(d.games.titles[g.id], lang)
    navigate(`/games/${g.id}`)
  }
  /** Not enough discovered yet: Hala takes the child to the lesson that teaches it. */
  const discoverFirst = (r: Readiness) => {
    audio.sfx('tap')
    void audio.speak(d.games.say.discoverFirst, lang)
    navigate(`/discover/${r.lessonId}`)
  }

  const section = (key: 'ln' | 'csl', title: string) => {
    const list = games.filter((g) => g.section === key)
    if (!list.length) return null
    return (
      <section className={s.hubSection}>
        <h2 className={s.sectionTitle}>{title}</h2>
        <div className={s.cards}>
          {list.map((g, i) => {
            const stage = gameStage(plays.get(g.id) ?? 0)
            const r = learned ? gameReadiness(g.id, learned, lang) : undefined
            const waiting = r && !r.ready
            const counts = r?.ready && COUNTED.has(r.need)
            return (
              <button
                key={g.id}
                type="button"
                className={cx(s.card, waiting && s.cardWaiting)}
                style={{ '--c': g.color, animationDelay: `${i * 50}ms` } as CSSProperties}
                onClick={() => r && (r.ready ? open(g) : discoverFirst(r))}
                data-testid={`game-${g.id}`}
                data-ready={r ? String(r.ready) : undefined}
              >
                <span className={s.cardIcon}>
                  <OpenMoji hex={g.hex} alt="" size={56} />
                </span>
                <span className={s.cardTitle} lang={lang}>
                  {d.games.titles[g.id]}
                </span>
                {waiting ? (
                  <>
                    <span className={s.discoverTag}>🔭 {t.games.discoverFirst}</span>
                    <span className={s.cardGoal}>{t.games.need[r.need]}</span>
                  </>
                ) : (
                  <>
                    <span className={s.cardGoal}>{counts ? fmt(t.games.learnedWith, { n: numeral(r.learned, ui) }) : t.games.goals[g.id]}</span>
                    <span className={s.dots} aria-label={fmt(t.games.stage, { n: numeral(stage, ui) })}>
                      {[1, 2, 3].map((k) => (
                        <i key={k} className={cx(k <= stage && s.dotOn)} />
                      ))}
                      <span>{fmt(t.games.stage, { n: numeral(stage, ui) })}</span>
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <Screen className={s.screen}>
      <TopBar
        title={t.games.playWorld}
        backTo="/home"
        backLabel={t.common.home}
        end={
          settings.rewardsEnabled && (
            <button type="button" className={s.starPill} onClick={() => navigate('/garden')} aria-label={`${t.games.garden} · ${t.rewards.stars}: ${stars}`}>
              <StarCount n={stars} label={t.rewards.stars} />
            </button>
          )
        }
      />
      <div className={s.hubHello}>
        <Mascot mood="happy" size={96} />
        <SpeechBubble text={d.games.hubHello} lang={lang} readAloud={!settings.narration} />
      </div>
      {section('ln', t.games.secLN)}
      {section('csl', t.games.secCSL)}
      {settings.rewardsEnabled && (
        <button type="button" className={s.gardenTeaser} onClick={() => navigate('/garden')} data-testid="garden-teaser">
          <span className={s.teaserText}>
            <b>🌻 {t.games.garden}</b>
            <span>{toNextText(starsToNextPlant(stars, GARDEN.length), t, ui)}</span>
          </span>
          <span className={s.teaserRow} aria-hidden="true">
            {GARDEN.slice(0, out).map((it) => (
              <OpenMoji key={it.id} hex={it.hex} alt="" size={40} />
            ))}
          </span>
        </button>
      )}
    </Screen>
  )
}

/** Hala's garden: grows from the stars the child earned; tap anything to hear its name. */
export function GardenScreen() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const lang = settings.practiceLang
  const ui = settings.uiLang
  const d = dict(lang)
  const stars = useLiveQuery(totalStars)
  const [bounce, setBounce] = useState<string | null>(null)
  const from = (location.state as { from?: number } | null)?.from
  useSpeakOnMount(d.games.say.garden, lang, settings.rewardsEnabled)

  if (!settings.rewardsEnabled) return <Navigate to="/games" replace />
  if (stars === undefined) return null

  const out = gardenUnlocked(stars, GARDEN.length)
  const fresh = from === undefined ? out : gardenUnlocked(from, GARDEN.length)
  const toNext = starsToNextPlant(stars, GARDEN.length)

  return (
    <Screen className={s.screen}>
      <TopBar title={t.games.garden} backTo="/games" backLabel={t.common.back} end={<StarCount n={stars} label={t.rewards.stars} />} />
      <div className={s.garden} role="group" aria-label={t.games.garden}>
        <i className={s.gardenSun} />
        {GARDEN.slice(0, out).map((it, i) => (
          <button
            key={it.id}
            type="button"
            className={cx(s.gardenItem, s[`size_${it.size}`], i >= fresh && s.fresh, bounce === it.id && s.boing)}
            style={{ left: `${it.x}%`, top: `${it.y}%`, zIndex: Math.round(it.y), animationDelay: i >= fresh ? `${(i - fresh) * 0.35 + 0.3}s` : undefined }}
            aria-label={d.games.gardenItems[it.id]}
            onClick={() => {
              audio.sfx('pop')
              void audio.speak(d.games.gardenItems[it.id], lang)
              setBounce(null)
              requestAnimationFrame(() => setBounce(it.id))
            }}
          >
            <OpenMoji hex={it.hex} alt="" size={it.size === 'lg' ? 120 : it.size === 'md' ? 84 : 60} />
          </button>
        ))}
      </div>
      <div className={s.gardenBottom}>
        <div className={s.gardenTalk}>
          <Mascot mood="happy" size={72} />
          <SpeechBubble text={t.games.gardenTap} lang={ui} />
        </div>
        <div className={s.drops} aria-label={toNextText(toNext, t, ui)}>
          {toNext > 0 &&
            Array.from({ length: STARS_PER_PLANT }, (_, i) => (
              <span key={i} className={cx(s.drop, i < STARS_PER_PLANT - toNext && s.dropOn)}>
                💧
              </span>
            ))}
          <span>{toNextText(toNext, t, ui)}</span>
        </div>
        <Button size="lg" icon="play" onClick={() => navigate('/games')}>
          {t.games.allGames}
        </Button>
      </div>
    </Screen>
  )
}
