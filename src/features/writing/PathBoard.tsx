import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { WRITE_FADE_ACTIVITY, WRITE_PATH_ACTIVITY, type WriteEntry, entriesOf } from '../../content/writing'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { IconButton, Screen, SpeechBubble } from '../../design/ui'
import { dict } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { recordItemResult } from '../../services/repos/progress'
import { BOARD, type HelpLevel, PathCanvas } from './PathCanvas'
import { letterStrokes } from './paths'
import s from './writing.module.css'

/** Between fade-away rounds: the finished letter shines this long before the next round. */
const ROUND_PAUSE_MS = 1800

/**
 * The Writing room's writing steps for one letter.
 * "path": write it along the dotted path (Hala's pen shows it first).
 * "fade": write it three times with less and less help — all the dots, a few dots, then
 *         only the green start dots — until she writes it by herself.
 */
export function PathBoard({ entry, modes, mode }: { entry: WriteEntry; modes: ReactNode; mode: 'path' | 'fade' }) {
  const { t, settings, langs } = useApp()
  const navigate = useNavigate()
  const lang = entry.lang
  const w = dict(lang).writing.say
  const strokes = useMemo(() => letterStrokes(entry.id, BOARD), [entry.id])
  const fade = mode === 'fade'

  const [bubble, setBubble] = useState(fade ? w.fadeStart : w.watch)
  const [round, setRound] = useState<HelpLevel>(1)
  const [attempt, setAttempt] = useState(0)
  const [won, setWon] = useState(false)
  const misses = useRef(0)
  const startedAt = useRef(Date.now())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const say = (text: string) => {
    setBubble(text)
    void audio.speak(text, lang)
  }

  useEffect(() => {
    void audio.speak(fade ? w.fadeStart : w.watch, lang)
    return () => {
      clearTimeout(timer.current)
      audio.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onWon = (m: number) => {
    misses.current += m
    if (fade && round < 3) {
      // One round done: a moment to shine, then the same letter with less help.
      say(round === 1 ? w.fadeFewer : w.fadeLast)
      timer.current = setTimeout(() => setRound((r) => (r + 1) as HelpLevel), ROUND_PAUSE_MS)
      return
    }
    setWon(true)
    say(w.wrote)
    void recordItemResult({
      activityId: fade ? WRITE_FADE_ACTIVITY : WRITE_PATH_ACTIVITY,
      itemId: entry.id,
      skill: entry.skill,
      areaId: entry.areaId,
      lang,
      firstTry: misses.current === 0,
      misses: misses.current,
      hintsUsed: 0,
      durationMs: Date.now() - startedAt.current,
      quality: 1 / (1 + misses.current * 0.25),
    }).catch((err) => console.error('[rawda] could not save writing result', err))
  }

  const restart = () => {
    audio.sfx('tap')
    clearTimeout(timer.current)
    misses.current = 0
    startedAt.current = Date.now()
    setWon(false)
    setRound(1)
    setAttempt((a) => a + 1)
    say(fade ? w.fadeStart : w.watch)
  }

  const list = entriesOf(entry.set, langs)
  const next = list[(list.findIndex((e) => e.id === entry.id) + 1) % list.length]
  const back = () => navigate(`/write?set=${entry.set}`)
  const ui = t.writing

  return (
    <Screen className={s.board}>
      <div className={s.bar}>
        <IconButton icon="close" label={ui.all} onClick={back} />
        <div className={s.barHala}>
          <Mascot mood={won ? 'cheer' : 'happy'} size={64} />
          <SpeechBubble text={bubble} lang={lang} readAloud={!settings.narration} />
        </div>
        <IconButton icon="speaker" label={t.player.listen} onClick={() => say(bubble)} />
      </div>

      <div className={s.stage}>
        <div className={s.side}>
          {modes}
          {fade && (
            // Three rounds, each with less help: a dot fills in for each one done.
            <div className={s.rounds} aria-label={`${round} / 3`} data-testid="fade-rounds">
              {[1, 2, 3].map((r) => (
                <span key={r} className={r < round || won ? s.roundDone : r === round ? s.roundNow : ''}>
                  {(r < round || won) && <Icon name="check" size={18} />}
                </span>
              ))}
            </div>
          )}
          {won && (
            <>
              <IconButton icon="again" label={ui.again} showLabel onClick={restart} />
              <IconButton icon="map" label={ui.all} showLabel onClick={back} />
            </>
          )}
        </div>

        <PathCanvas
          key={`${attempt}-${round}`}
          strokes={strokes}
          label={entry.glyph}
          lang={lang}
          level={fade ? round : 1}
          demo={!fade}
          say={say}
          onWon={onWon}
        />

        <div className={s.side}>
          {won && !fade ? (
            // Written along the dots: now the same letter with less and less help.
            <>
              <button type="button" className={s.nextBtn} onClick={() => navigate(`/write/${entry.id}?mode=fade`)} data-testid="write-next-step" aria-label={ui.modes.fade}>
                <Icon name="hand" size={48} />
                <span className={s.nextLabel}>{ui.modes.fade}</span>
              </button>
              {next && <IconButton icon="next" label={`${ui.nextLetter} ${next.glyph}`} showLabel onClick={() => navigate(`/write/${next.id}`)} data-testid="write-next" />}
            </>
          ) : won && next ? (
            <button type="button" className={s.nextBtn} onClick={() => navigate(`/write/${next.id}`)} data-testid="write-next" aria-label={`${ui.nextLetter} ${next.glyph}`}>
              <span lang={next.lang}>{next.glyph}</span>
              <span className={s.nextArrow} aria-hidden="true">
                <Icon name="next" size={40} />
              </span>
            </button>
          ) : (
            <IconButton icon="again" label={ui.restart} onClick={restart} />
          )}
        </div>
      </div>
    </Screen>
  )
}
