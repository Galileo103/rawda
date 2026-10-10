import { useLiveQuery } from 'dexie-react-hooks'
import { type ComponentType, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { GARDEN, type GameDef, type GameId, type GardenItem, type LearnedPools, gameActivityId, gameById, gameReadiness } from '../../content/games'
import { content } from '../../content/loader'
import type { Reward } from '../../content/schemas'
import { Mascot, type MascotMood } from '../../design/Mascot'
import { Button, IconButton, Screen, TopBar } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import { gameRounds, gameStage, gardenUnlocked } from '../../domain/garden'
import { defaultRng } from '../../domain/rng'
import { dict, fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import type { AreaId } from '../../domain/types'
import { gamePlays, recordGameCompletion, recordItemResult } from '../../services/repos/progress'
import { pick, randomLine } from '../common'
import { ButterfliesRound, NextRound, OddRound, ShapesRound } from './colorLogicRounds'
import { type RoundCtl, type RoundProps, burst, cx, flash, flyStar } from './engine'
import s from './games.module.css'
import { BalloonsRound, CountRound, FrogRound, TrainRound } from './letterNumberRounds'
import { MonsterRound, SillyRound } from './sillyRounds'
import { DressRound, MixupRound } from './worldRounds'
import { useLearnedPools } from './useLearned'

const ROUNDS: Record<GameId, ComponentType<RoundProps>> = {
  frog: FrogRound,
  balloons: BalloonsRound,
  count: CountRound,
  train: TrainRound,
  butterflies: ButterfliesRound,
  shapes: ShapesRound,
  next: NextRound,
  odd: OddRound,
  silly: SillyRound,
  monster: MonsterRound,
  dress: DressRound,
  mixup: MixupRound,
}

/** The child's hero picture (Rawda's own boy and girl drawings; a boy when not set, like the stories). */
const HERO_ART = { m: 'E001', f: 'E002', n: 'E001' } as const

/** Which learning area a practised skill belongs to (`ar.letter.ba` → letters, `sci.food.cow` → science). */
function areaOfSkill(skill: string, fallback: AreaId): AreaId {
  if (/^(ar|en)\.(letter|sound|write)\./.test(skill)) return 'letters'
  if (skill.startsWith('num.')) return 'numbers'
  if (skill.startsWith('color.') || skill.startsWith('shape.')) return 'colors-shapes'
  if (skill.startsWith('sci.')) return 'science'
  if (skill.startsWith('logic.')) return 'logic'
  return fallback
}

const CONFETTI = ['#e8613a', '#ffc83d', '#13897f', '#7a5cd6', '#2f8fdb', '#d94a86']

export function GameScreen() {
  const { gameId } = useParams()
  const game = gameById(gameId)
  const plays = useLiveQuery(gamePlays)
  const learned = useLearnedPools()
  const { settings } = useApp()
  const [run, setRun] = useState(0)
  if (!game) return <Navigate to="/games" replace />
  if (!plays || !learned) return null
  // A game only opens once the child has discovered what it plays with (the hub shows "Discover first").
  if (!gameReadiness(game.id, learned, settings.practiceLang).ready) return <Navigate to="/games" replace />
  return <GameSession key={`${game.id}-${run}`} game={game} plays={plays.get(game.id) ?? 0} learned={learned} onAgain={() => setRun((r) => r + 1)} />
}

interface Result {
  stars: number
  bonus: number
  starsBefore: number
  newRewards: Reward[]
  newItems: GardenItem[]
  newStage: number
}

function GameSession({ game, plays, learned: learnedNow, onAgain }: { game: GameDef; plays: number; learned: LearnedPools; onAgain: () => void }) {
  const { settings, t, age, named, profile } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang
  const d = dict(lang)
  const [stage] = useState(() => gameStage(plays))
  // Fixed for the whole session, so a round never changes under the child's fingers.
  const [learned] = useState(learnedNow)
  const total = gameRounds(age.sessionCap)
  const choices = Math.max(2, age.maxChoices - (stage === 1 ? 1 : 0))
  const maxN = age.maxChoices <= 3 ? 5 : 10

  const [round, setRound] = useState(0)
  const [locked, setLocked] = useState(false)
  const [bubble, setBubble] = useState('')
  const [mood, setMood] = useState<MascotMood>('idle')
  const [lit, setLit] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const stones = useRef<HTMLDivElement>(null)
  const st = useRef({
    prompt: '',
    hint: null as (() => Element | null | undefined) | null,
    locked: false,
    idle: 0,
    timers: [] as number[],
    alive: true,
    /** What this round practises, and how it went so far (recorded when solved). */
    skill: '',
    misses: 0,
    started: 0,
  })

  const later = useCallback((fn: () => void, ms: number) => {
    st.current.timers.push(window.setTimeout(() => st.current.alive && fn(), ms))
  }, [])

  useEffect(() => {
    const cur = st.current
    cur.alive = true
    cur.started = Date.now()
    return () => {
      cur.alive = false
      cur.timers.forEach(clearTimeout)
      clearTimeout(cur.idle)
      audio.stop()
      audio.stopSound()
    }
  }, [])

  /** When the child goes quiet: repeat the instruction and gently glow the answer. */
  const armIdle = useCallback(() => {
    const cur = st.current
    clearTimeout(cur.idle)
    cur.idle = window.setTimeout(function nudge() {
      if (!cur.alive || cur.locked) return
      if (cur.prompt) {
        setBubble(cur.prompt)
        void audio.speak(cur.prompt, lang)
      }
      flash(cur.hint?.(), s.hinting, 3000)
      cur.idle = window.setTimeout(nudge, age.idleMs)
    }, age.idleMs)
  }, [age.idleMs, lang])

  const finish = useCallback(async () => {
    const res = await recordGameCompletion({ gameId: game.id, areaId: game.areaId, lang, rounds: total }, content.rewards)
    if (!st.current.alive) return
    const before = gardenUnlocked(res.starsBefore, GARDEN.length)
    const after = gardenUnlocked(res.starsBefore + res.stars, GARDEN.length)
    const nextStage = gameStage(plays + 1)
    const r: Result = { ...res, newItems: GARDEN.slice(before, after), newStage: nextStage > stage ? nextStage : 0 }
    setResult(r)
    audio.sfx('complete')
    void audio.speakAll([{ text: d.games.say.done, lang }, ...(settings.rewardsEnabled && r.newItems.length ? [{ text: d.games.say.grew, lang }] : [])])
  }, [d, game, lang, plays, settings.rewardsEnabled, stage, total])

  // One controller per round: anything a finished round still tries to report is ignored.
  const ctl = useMemo<RoundCtl>(() => {
    const cur = st.current
    const thisRound = { live: true }
    return {
      prompt(text) {
        cur.prompt = text
        setBubble(text)
        setMood('idle')
        void audio.speak(text, lang)
        armIdle()
      },
      mood(m) {
        if (thisRound.live) setMood(m)
      },
      practise(skill) {
        cur.skill = skill
      },
      hint(get) {
        cur.hint = get
      },
      say(text) {
        void audio.speak(text, lang)
      },
      step(el) {
        audio.sfx('pop')
        burst(el, false)
        armIdle()
      },
      correct(el, line) {
        if (!thisRound.live || cur.locked) return
        thisRound.live = false
        cur.locked = true
        setLocked(true)
        clearTimeout(cur.idle)
        if (cur.skill) {
          void recordItemResult({
            activityId: gameActivityId(game.id),
            itemId: cur.skill,
            skill: cur.skill,
            areaId: areaOfSkill(cur.skill, game.areaId),
            lang,
            firstTry: cur.misses === 0,
            misses: cur.misses,
            hintsUsed: 0,
            durationMs: Date.now() - cur.started,
          })
        }
        cur.skill = ''
        cur.misses = 0
        audio.sfx((round + 1) % 3 === 0 ? 'sparkle' : 'correct')
        burst(el, true)
        setMood('cheer')
        const praise = randomLine(d.voice.praise)
        setBubble(line ? `${praise} ${line}` : praise)
        flyStar(el, stones.current?.children[round], () => setLit((n) => Math.max(n, round + 1)))
        const speech = audio.speakAll([{ text: praise, lang }, ...(line ? [{ text: line, lang }] : [])])
        const minWait = new Promise((ok) => setTimeout(ok, line ? 1600 : 1200))
        void Promise.all([speech, minWait]).then(() =>
          later(() => {
            setLit((n) => Math.max(n, round + 1))
            if (round + 1 >= total) void finish()
            else {
              cur.locked = false
              cur.hint = null
              cur.started = Date.now()
              setLocked(false)
              setMood('idle')
              setRound(round + 1)
            }
          }, 250),
        )
      },
      wrong(el, line) {
        if (!thisRound.live || cur.locked) return
        cur.misses++
        audio.sfx('try')
        flash(el, s.wiggle, 600)
        setMood('think')
        const text = line ?? randomLine(d.voice.tryAgain)
        setBubble(text)
        void audio.speak(text, lang)
        later(() => {
          if (thisRound.live && !cur.locked) {
            setBubble(cur.prompt)
            setMood('idle')
          }
        }, 2600)
        armIdle()
      },
    }
  }, [armIdle, d, finish, game, lang, later, round, total])

  const replay = () => {
    const p = st.current.prompt
    if (!p) return
    setBubble(p)
    void audio.speak(p, lang)
    armIdle()
  }

  const Round = ROUNDS[game.id]

  if (result) return <GameDone game={game} result={result} onAgain={onAgain} onGarden={() => navigate('/garden', { state: { from: result.starsBefore } })} onHub={() => navigate('/games')} />

  return (
    <Screen className={s.screen}>
      <TopBar
        title={
          <span lang={lang}>
            {d.games.titles[game.id]} <span className={s.stageTag}>· {fmt(t.games.stage, { n: numeral(stage, settings.uiLang) })}</span>
          </span>
        }
        backTo="/games"
        backLabel={t.common.back}
        end={
          <div ref={stones} className={s.stones} aria-label={`${lit} / ${total}`}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={cx(s.stone, i < lit && s.stoneOn)}>
                {i < lit ? '⭐' : ''}
              </span>
            ))}
          </div>
        }
      />
      <div className={s.talk}>
        <Mascot mood={mood} size={84} />
        <p className={s.bubble} lang={lang} dir="auto" aria-live="polite">
          {named(bubble, lang)}
        </p>
        <IconButton icon="speaker" label={t.games.replay} onClick={replay} />
      </div>
      <div className={cx(s.stage, s[`scene_${game.id}`])} onPointerDown={armIdle} data-testid="game-stage">
        <Round key={round} lang={lang} d={d} stage={stage} choices={choices} maxN={maxN} round={round} locked={locked} rng={defaultRng} ctl={ctl} learned={learned} hero={HERO_ART[profile.gender ?? 'n']} />
      </div>
    </Screen>
  )
}

function GameDone({ game, result, onAgain, onGarden, onHub }: { game: GameDef; result: Result; onAgain: () => void; onGarden: () => void; onHub: () => void }) {
  const { settings, t } = useApp()
  const ui = settings.uiLang
  const rewards = settings.rewardsEnabled
  return (
    <Screen className={s.screen}>
      <div className={s.confetti} aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} style={{ '--x': `${(i * 37) % 100}%`, '--d': `${(i % 7) * 0.12}s`, '--c': CONFETTI[i % CONFETTI.length] } as CSSProperties} />
        ))}
      </div>
      <div className={s.done}>
        <Mascot mood="cheer" size={150} />
        <h1 className={s.doneTitle}>{t.games.wellDone}</h1>
        <p className={s.doneGame} lang={settings.practiceLang}>
          <OpenMoji hex={game.hex} alt="" size={36} /> {dict(settings.practiceLang).games.titles[game.id]}
        </p>
        {rewards && <div className={s.bigStars}>⭐ {fmt(t.games.earned, { n: numeral(result.stars, ui) })}</div>}
        {rewards && result.bonus > 0 && <div className={s.chip}>🎁 {t.games.bonus}</div>}
        {result.newStage > 0 && <div className={s.chip}>🔓 {fmt(t.games.stageUp, { n: numeral(result.newStage, ui) })}</div>}
        {rewards && result.newItems.length > 0 && (
          <>
            <div className={s.chip}>{t.games.grew}</div>
            <div className={s.newItems}>
              {result.newItems.map((it, i) => (
                <figure key={it.id} style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
                  <OpenMoji hex={it.hex} alt="" size={60} />
                  <figcaption>{t.games.gardenItems[it.id]}</figcaption>
                </figure>
              ))}
            </div>
          </>
        )}
        {rewards && result.newRewards.length > 0 && (
          <div className={s.newItems}>
            {result.newRewards.map((r, i) => (
              <figure key={r.id} style={{ animationDelay: `${0.5 + i * 0.2}s` }}>
                <OpenMoji hex={r.hex} alt="" size={60} />
                <figcaption>{pick(r.name, ui)}</figcaption>
              </figure>
            ))}
          </div>
        )}
        <div className={s.actions}>
          <Button size="lg" icon="again" onClick={onAgain}>
            {t.games.again}
          </Button>
          {rewards && (
            <Button size="lg" variant="teal" onClick={onGarden}>
              🌻 {t.games.toGarden}
            </Button>
          )}
          <Button size="lg" variant="secondary" onClick={onHub}>
            {t.games.allGames}
          </Button>
        </div>
      </div>
    </Screen>
  )
}
