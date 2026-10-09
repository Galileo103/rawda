import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { activityAvailable, activityById, activityLang, content } from '../../content/loader'
import type { Activity, AnyItem, ChoiceItem, CountItem, MatchItem, LessonItem, MemoryItem, MovementBreak, Reward, SequenceItem, SortItem, SpeakItem, TraceItem } from '../../content/schemas'
import { Mascot, type MascotMood } from '../../design/Mascot'
import { Button, IconButton, Screen, SpeechBubble } from '../../design/ui'
import { Visual } from '../../design/Visual'
import { effectiveLevel } from '../../domain/engine/difficulty'
import { pickLessonItems, pickSessionItems } from '../../domain/engine/scheduler'
import { recommendNext } from '../../domain/recommend'
import { defaultRng, pickOne } from '../../domain/rng'
import { Icon } from '../../design/Icon'
import { countFinishedActivity, isBreakDue } from './sessionStats'
import type { Lang } from '../../domain/types'
import { fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { getLevelState, getMasteryMap, recordCompletion, recordItemResult, takenLessonItems } from '../../services/repos/progress'
import { forRecommend, iconFor, introducedSkills, journeyCompleted, lessonActivities, pick, playableActivities, randomLine, voice } from '../common'
import s from './activities.module.css'
import { VoiceToggle } from '../VoiceToggle'
import { CompletionView } from './CompletionView'
import { ChoiceTemplate } from './templates/ChoiceTemplate'
import { CountTemplate } from './templates/CountTemplate'
import { MatchTemplate } from './templates/MatchTemplate'
import { MemoryTemplate } from './templates/MemoryTemplate'
import { SequenceTemplate } from './templates/SequenceTemplate'
import { LessonTemplate } from './templates/LessonTemplate'
import { TraceTemplate } from './templates/TraceTemplate'
import { SortTemplate } from './templates/SortTemplate'
import { SpeakTemplate } from './templates/SpeakTemplate'

export function ActivityPlayer() {
  const { activityId } = useParams()
  const { settings, t, langs } = useApp()
  const navigate = useNavigate()
  const [run, setRun] = useState(0)
  const [params] = useSearchParams()
  /** A specific lesson chosen on the Discover board (e.g. ?item=ba). */
  const chosenItem = params.get('item') ?? undefined
  const activity = activityId ? activityById(activityId) : undefined

  if (!activity || settings.disabledAreas.includes(activity.areaId) || !activityAvailable(activity, langs)) {
    return (
      <Screen>
        <div className={s.center}>
          <Mascot mood="think" size={150} />
          <p className={s.title}>{t.player.notFound}</p>
          <Button variant="teal" icon="home" onClick={() => navigate('/home')}>
            {t.common.home}
          </Button>
        </div>
      </Screen>
    )
  }
  return <Session key={`${activity.id}-${run}-${chosenItem ?? ''}`} activity={activity} chosenItem={chosenItem} onAgain={() => setRun((r) => r + 1)} />
}

type Phase = 'loading' | 'intro' | 'play' | 'done'

interface DoneInfo {
  stars: number
  newRewards: Reward[]
  nextId?: string
  movementBreak?: MovementBreak
}

/**
 * One play-through: intro → tasks (one at a time) → celebration.
 * Each finished task is saved immediately, so leaving early never loses progress.
 */
function Session({ activity, chosenItem, onAgain }: { activity: Activity; chosenItem?: string; onAgain: () => void }) {
  const { settings, t, langs, usage, age } = useApp()
  const navigate = useNavigate()
  const lang: Lang = activityLang(activity, settings.practiceLang)
  const v = voice(lang)
  // Voice off: a grown-up reads every line aloud, so the text is always shown (and larger).
  const parentReads = !settings.narration
  const showText = settings.captions || parentReads
  const [confirmExit, setConfirmExit] = useState(false)
  const [nudging, setNudging] = useState(false)
  const [burst, setBurst] = useState(0)
  const [bigBurst, setBigBurst] = useState(false)
  const streak = useRef(0)
  const lastActive = useRef(Date.now())
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  /** A star that flies from where the child answered to her stone on the path. */
  const [fly, setFly] = useState<{ key: number; x: number; y: number; dx: number; dy: number } | null>(null)
  const flyStar = useCallback((stoneIndex: number) => {
    const stone = document.querySelector(`[data-stone="${stoneIndex}"]`)?.getBoundingClientRect()
    if (!stone) return
    const from = lastPoint.current ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.6 }
    const to = { x: stone.left + stone.width / 2, y: stone.top + stone.height / 2 }
    setFly({ key: Date.now(), x: from.x, y: from.y, dx: to.x - from.x, dy: to.y - from.y })
  }, [])

  const [phase, setPhase] = useState<Phase>('loading')
  const [items, setItems] = useState<AnyItem[]>([])
  const [index, setIndex] = useState(0)
  const [misses, setMisses] = useState(0)
  const [helps, setHelps] = useState(0)
  const [locked, setLocked] = useState(false)
  const [mood, setMood] = useState<MascotMood>('idle')
  const [bubble, setBubble] = useState('')
  const [done, setDone] = useState<DoneInfo | null>(null)
  const startedAt = useRef(Date.now())
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      audio.stop()
    }
  }, [])

  // Build the session from the item bank using the adaptive engine.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const lessons = lessonActivities({ disabledAreas: settings.disabledAreas, langs }, activity.areaId)
      const [mastery, levelState, taken] = await Promise.all([getMasteryMap(), getLevelState(activity.areaId, lang), takenLessonItems(lessons.map((l) => l.id))])
      const level = effectiveLevel(levelState, settings.areaDifficulty[activity.areaId] ?? 'auto')
      const chosen = chosenItem ? activity.items.find((i) => i.id === chosenItem) : undefined
      const picked = chosen
        ? [chosen as AnyItem]
        : activity.template === 'lesson'
          ? // Discover: the next new concept, in curriculum order.
            pickLessonItems<AnyItem>(activity.items, taken.get(activity.id) ?? new Set(), activity.sessionLength)
          : // Practice: focus on what Discover lessons already introduced.
            pickSessionItems<AnyItem>(activity.items, { lang, level, mastery, now: Date.now(), count: Math.min(activity.sessionLength, age.sessionCap), rng: defaultRng, focusSkills: introducedSkills(taken) })
      if (cancelled) return
      setItems(picked)
      setPhase('intro')
      const intro = pick(activity.intro, lang)
      setBubble(intro)
      void audio.speak(intro, lang)
    })().catch(() => {
      if (!cancelled) {
        setItems(activity.items.slice(0, activity.sessionLength))
        setPhase('intro')
      }
    })
    return () => {
      cancelled = true
    }
    // Session is built once per mount; settings changes mid-activity don't reshuffle it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const item = items[index]
  // Templates with several steps (Discover lessons) can update the current instruction.
  const [stepInstruction, setStepInstruction] = useState<string | null>(null)
  const instruction = stepInstruction ?? (item ? pick(item.say, lang) : '')
  const hintLevel = Math.min(3, misses + helps)
  const selfNarrating = activity.template === 'lesson'

  // Speak the instruction whenever a new task appears (lessons narrate their own steps).
  useEffect(() => {
    if (phase !== 'play' || !item) return
    startedAt.current = Date.now()
    setMood('idle')
    // Self-narrating templates (lessons) set their own caption per step; their effects run first.
    if (selfNarrating) return
    setStepInstruction(null)
    setBubble(pick(item.say, lang))
    void audio.speak(pick(item.say, lang), lang)
  }, [phase, index, item, lang, selfNarrating])

  // Gentle idle helper: if the child goes quiet, Hala repeats the question and the options
  // wiggle. Never counted as a mistake; younger children get it sooner (age profile).
  useEffect(() => audio.onSpeakingChange(() => (lastActive.current = Date.now())), [])
  useEffect(() => {
    if (phase !== 'play') return
    lastActive.current = Date.now()
    const id = setInterval(() => {
      if (locked || confirmExit || Date.now() - lastActive.current < age.idleMs) return
      lastActive.current = Date.now()
      setMood('think')
      setNudging(true)
      setTimeout(() => setNudging(false), 1400)
      setBubble(instruction)
      void audio.speak(instruction, lang)
    }, 1000)
    return () => clearInterval(id)
  }, [phase, locked, confirmExit, instruction, lang, age.idleMs])
  const touch = (e?: { clientX?: number; clientY?: number }) => {
    lastActive.current = Date.now()
    if (e?.clientX !== undefined && e.clientY !== undefined) lastPoint.current = { x: e.clientX, y: e.clientY }
  }

  const onInstruction = useCallback((text: string) => {
    setStepInstruction(text)
    setBubble(text)
  }, [])

  const pool = useMemo(() => (activity.template === 'choice' ? activity.items.map((i) => i.answer) : []), [activity])

  const finish = useCallback(async () => {
    setPhase('done')
    setMood('cheer')
    audio.sfx('complete')
    let info: DoneInfo = { stars: items.length, newRewards: [] }
    try {
      const r = await recordCompletion({ activityId: activity.id, areaId: activity.areaId, lang, items: items.length }, content.rewards)
      const [completed, mastery] = await Promise.all([journeyCompleted({ disabledAreas: settings.disabledAreas, langs }), getMasteryMap()])
      const next = recommendNext(forRecommend(playableActivities({ disabledAreas: settings.disabledAreas, langs }), settings.practiceLang), completed, mastery, activity.id)
      info = { stars: r.stars, newRewards: r.newRewards, nextId: next?.id }
    } catch (e) {
      console.error('[rawda] could not save completion', e)
    }
    // Every few activities: a short movement or calm break (natural stopping point).
    if (isBreakDue(countFinishedActivity(), age.breakEvery) && content.breaks.length > 0) info.movementBreak = pickOne(content.breaks)
    if (!alive.current) return
    setDone(info)
    const lines = [usage.limitReached ? v.rest : v.complete]
    if (settings.rewardsEnabled && info.newRewards.length > 0) lines.push(v.sticker)
    if (info.movementBreak) lines.push(info.movementBreak.say[lang])
    void audio.speakAll(lines.map((text) => ({ text, lang })))
  }, [activity, items.length, lang, langs, settings.disabledAreas, settings.practiceLang, settings.rewardsEnabled, usage.limitReached, v, age.breakEvery])

  const onCorrect = useCallback(
    (say?: string, quality?: number) => {
      if (!item || locked) return
      setLocked(true)
      setMood('cheer')
      const firstTry = misses === 0 && helps === 0
      // Streak: every 3 first-try answers in a row earn a bigger celebration (never a penalty for breaking it).
      streak.current = firstTry ? streak.current + 1 : 0
      const big = streak.current > 0 && streak.current % 3 === 0
      setBurst((b) => b + 1)
      setBigBurst(big)
      flyStar(index)
      audio.sfx(big ? 'sparkle' : 'correct')
      const praise = big ? v.streak : randomLine(v.praise)
      // Voice off: the grown-up needs the "that's …" line on screen too, and a moment to read it.
      setBubble(parentReads && say ? `${say} ${praise}` : praise)
      void recordItemResult({
        quality,
        activityId: activity.id,
        itemId: item.id,
        skill: item.skill,
        areaId: activity.areaId,
        lang,
        firstTry,
        misses,
        hintsUsed: helps,
        durationMs: Date.now() - startedAt.current,
      }).catch((e) => console.error('[rawda] could not save result', e))
      const minDelay = new Promise((r) => setTimeout(r, parentReads ? 2200 : 1100))
      const speech = audio.speakAll([...(say ? [{ text: say, lang }] : []), { text: praise, lang }])
      void Promise.all([minDelay, speech]).then(() => {
        if (!alive.current) return
        setMisses(0)
        setHelps(0)
        setLocked(false)
        if (index + 1 < items.length) setIndex(index + 1)
        else void finish()
      })
    },
    [item, locked, misses, helps, activity, lang, v, index, items.length, finish, parentReads, flyStar],
  )

  const onWrong = useCallback(() => {
    audio.sfx('try')
    setMood('think')
    const line = randomLine(v.tryAgain)
    setBubble(parentReads ? `${line} ${instruction}` : line)
    setMisses((m) => m + 1)
    void audio.speakAll([
      { text: line, lang },
      { text: instruction, lang },
    ])
  }, [v, instruction, lang, parentReads])

  const onHelp = () => {
    audio.sfx('tap')
    setHelps((h) => h + 1)
    setMood('think')
    setBubble(parentReads ? `${v.hint} ${instruction}` : v.hint)
    void audio.speakAll([
      { text: v.hint, lang },
      { text: instruction, lang },
    ])
  }

  const exit = () => {
    audio.stop()
    navigate(`/map/${activity.areaId}`)
  }
  // Accidental taps are common at 3–4: during play, ✕ asks first (two big picture buttons).
  const askExit = () => {
    if (phase !== 'play') return exit()
    audio.sfx('tap')
    setConfirmExit(true)
    void audio.speak(v.exitAsk, lang)
  }

  if (phase === 'done' && done) {
    return (
      <Screen>
        <CompletionView
          t={t}
          uiLang={settings.uiLang}
          practiced={pick(activity.title, lang)}
          stars={done.stars}
          newRewards={done.newRewards}
          showRewards={settings.rewardsEnabled}
          movementBreak={done.movementBreak}
          lang={lang}
          resting={usage.limitReached}
          hasNext={!!done.nextId}
          onAgain={onAgain}
          onNext={() => done.nextId && navigate(`/play/${done.nextId}`)}
          onHome={() => navigate('/home')}
        />
      </Screen>
    )
  }

  const props = { lang, hintLevel, locked, onCorrect, onWrong, onInstruction, rng: defaultRng }

  return (
    <Screen>
      <div className={s.bar}>
        <IconButton icon="close" label={t.player.exit} onClick={askExit} />
        {/* A path of stepping stones to a star: progress a young child can see. */}
        <div className={s.trail} role="progressbar" aria-valuemin={1} aria-valuemax={items.length || 1} aria-valuenow={index + 1} aria-label={fmt(t.player.progress, { n: index + 1, total: items.length })}>
          {phase === 'play' && (
            <>
              {items.map((_, i) => (
                <span key={i} data-stone={i} className={[s.stone, i < index ? s.stoneDone : '', i === index ? s.stoneNow : ''].join(' ')}>
                  {i < index && <Icon name="star" size={18} />}
                </span>
              ))}
              <Icon name="star" size={34} className={s.goal} />
            </>
          )}
        </div>
        {phase === 'play' && (
          <>
            {parentReads ? <VoiceToggle /> : <IconButton icon="speaker" label={t.player.listen} onClick={() => void audio.speak(instruction, lang)} />}
            <IconButton icon="help" label={t.player.help} onClick={onHelp} disabled={locked} />
          </>
        )}
      </div>

      {phase === 'play' && (
        <div className={s.guide}>
          <Mascot mood={mood} size={96} />
          {showText && <SpeechBubble text={bubble} lang={lang} readAloud={parentReads} />}
        </div>
      )}

      {phase === 'loading' && <div className={s.center} aria-busy="true" />}

      {phase === 'intro' && (
        <div className={[s.center, s.intro].join(' ')}>
          <div className={s.prompt}>
            <Visual v={iconFor(activity, lang)} lang={lang} size={110} />
          </div>
          <h1 className={s.title} lang={lang} dir="auto">
            {pick(activity.title, lang)}
          </h1>
          <div className={s.guide}>
            <Mascot mood="happy" size={110} />
            {showText && <SpeechBubble text={bubble} lang={lang} readAloud={parentReads} />}
          </div>
          <Button
            size="lg"
            icon="play"
            autoFocus
            onClick={() => {
              audio.sfx('tap')
              setPhase('play')
            }}
          >
            {t.player.start}
          </Button>
        </div>
      )}

      {phase === 'play' && item && (
        <div className={[s.taskArea, nudging ? s.nudging : ''].join(' ')} onPointerDownCapture={touch} onKeyDownCapture={() => touch()}>
          <TaskView key={`${index}-${item.id}`} activity={activity} item={item} pool={pool} {...props} />
        </div>
      )}

      {burst > 0 && (
        <div key={burst} className={[s.burst, bigBurst ? s.burstBig : ''].join(' ')} aria-hidden="true">
          {Array.from({ length: bigBurst ? 18 : 10 }, (_, i) => (
            <i key={i} style={{ '--a': `${(i * 360) / (bigBurst ? 18 : 10)}deg` } as CSSProperties} />
          ))}
        </div>
      )}
      {fly && (
        <span
          key={fly.key}
          className={s.flyStar}
          style={{ left: fly.x, top: fly.y, '--dx': `${fly.dx}px`, '--dy': `${fly.dy}px` } as CSSProperties}
          onAnimationEnd={() => setFly(null)}
          aria-hidden="true"
        >
          <Icon name="star" size={44} />
        </span>
      )}

      {confirmExit && (
        <div className={s.exitAsk} role="dialog" aria-modal="true" aria-label={t.player.exitAsk}>
          <Mascot mood="think" size={130} />
          <p className={s.title}>{t.player.exitAsk}</p>
          <div className={s.actions}>
            <IconButton icon="play" label={t.player.keepPlaying} showLabel size={44} onClick={() => setConfirmExit(false)} autoFocus />
            <IconButton icon="home" label={t.player.stop} showLabel size={44} onClick={exit} />
          </div>
        </div>
      )}
    </Screen>
  )
}

function TaskView({ activity, item, pool, ...props }: { activity: Activity; item: AnyItem; pool: ChoiceItem['answer'][] } & Omit<Parameters<typeof ChoiceTemplate>[0], 'item' | 'pool'>) {
  switch (activity.template) {
    case 'choice':
      return <ChoiceTemplate item={item as ChoiceItem} pool={pool} {...props} />
    case 'count':
      return <CountTemplate item={item as CountItem} {...props} />
    case 'match':
      return <MatchTemplate item={item as MatchItem} {...props} />
    case 'memory':
      return <MemoryTemplate item={item as MemoryItem} {...props} />
    case 'sequence':
      return <SequenceTemplate item={item as SequenceItem} {...props} />
    case 'trace':
      return <TraceTemplate item={item as TraceItem} {...props} />
    case 'lesson':
      return <LessonTemplate item={item as LessonItem} {...props} />
    case 'sort':
      return <SortTemplate item={item as SortItem} {...props} />
    case 'speak':
      return <SpeakTemplate item={item as SpeakItem} {...props} />
  }
}
