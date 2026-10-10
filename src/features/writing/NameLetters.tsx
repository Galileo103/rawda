import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { WRITE_NAME_ACTIVITY, type WriteEntry } from '../../content/writing'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { IconButton, Screen, SpeechBubble } from '../../design/ui'
import { dict } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { saveDrawing } from '../../services/repos/drawings'
import { grantEarnedRewards, recordItemResult } from '../../services/repos/progress'
import { layoutGlyph } from '../studio/canvasTools'
import { galleryPicture } from './brushes'
import { BOARD, PathCanvas } from './PathCanvas'
import { letterStrokes } from './paths'
import s from './writing.module.css'

/** After each letter, a moment to see it shine before the next one. */
const LETTER_PAUSE_MS = 1200

/**
 * Write her English name, one letter at a time on the dotted-path board (capital first
 * letter, then small letters, as she typed it in). The name across the top fills in as she
 * goes; at the end Hala says her name and an "I wrote my name!" picture goes to My drawings.
 */
export function NameLetters({ entry }: { entry: WriteEntry }) {
  const { t, settings } = useApp()
  const navigate = useNavigate()
  const lang = entry.lang
  const w = dict(lang).writing.say
  const letters = useMemo(() => [...entry.glyph], [entry.glyph])
  const [i, setI] = useState(0)
  const [round, setRound] = useState(0)
  const [won, setWon] = useState(false)
  const [bubble, setBubble] = useState(w.nameStart)
  const misses = useRef(0)
  const startedAt = useRef(Date.now())
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const letter = letters[i] ?? ''
  const strokes = useMemo(() => letterStrokes(`en-${letter}`, BOARD), [letter])

  const say = (text: string) => {
    setBubble(text)
    void audio.speak(text, lang)
  }

  useEffect(() => {
    void audio.speak(w.nameStart, lang)
    return () => {
      clearTimeout(timer.current)
      audio.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const finish = async () => {
    setWon(true)
    say(w.nameDone)
    void recordItemResult({
      activityId: WRITE_NAME_ACTIVITY,
      itemId: entry.id,
      skill: entry.skill,
      areaId: entry.areaId,
      lang,
      firstTry: misses.current === 0,
      misses: misses.current,
      hintsUsed: 0,
      durationMs: Date.now() - startedAt.current,
      quality: 1 / (1 + misses.current * 0.15),
    }).catch((err) => console.error('[rawda] could not save writing result', err))
    // "I wrote my name!": her name, big and golden, for My drawings.
    try {
      const png = galleryPicture(
        (o) => {
          const { x, y } = layoutGlyph(o, entry.glyph, BOARD, 220, 0.78, true)
          o.fillStyle = '#ffc83d'
          o.strokeStyle = '#e8613a'
          o.lineWidth = 10
          o.lineJoin = 'round'
          o.strokeText(entry.glyph, x, y)
          o.fillText(entry.glyph, x, y)
        },
        { title: t.writing.certificate, rtl: settings.uiLang === 'ar' },
      )
      if (!png) return
      await saveDrawing({ pngDataUrl: png, layerDataUrl: png })
      await grantEarnedRewards(content.rewards).catch(() => [])
    } catch (err) {
      console.error('[rawda] could not save the name picture', err)
    }
  }

  const onWon = (m: number) => {
    misses.current += m
    if (i + 1 < letters.length) {
      timer.current = setTimeout(() => {
        setI(i + 1)
        setBubble(w.nameStart)
      }, LETTER_PAUSE_MS)
      return
    }
    void finish()
  }

  const restart = () => {
    audio.sfx('tap')
    clearTimeout(timer.current)
    misses.current = 0
    startedAt.current = Date.now()
    setWon(false)
    setI(0)
    setRound((r) => r + 1)
    say(w.nameStart)
  }

  const back = () => navigate('/write?set=name')

  return (
    <Screen className={s.board}>
      <div className={s.bar}>
        <IconButton icon="close" label={t.writing.all} onClick={back} />
        <div className={s.barHala}>
          <Mascot mood={won ? 'cheer' : 'happy'} size={64} />
          <SpeechBubble text={bubble} lang={lang} readAloud={!settings.narration} />
        </div>
        <IconButton icon="speaker" label={t.player.listen} onClick={() => say(bubble)} />
      </div>

      {/* Her name, filling in letter by letter. */}
      <div className={s.nameRow} lang={lang} dir="ltr" data-testid="name-progress">
        {letters.map((c, k) => (
          <span key={k} className={won || k < i ? s.nameDone : k === i ? s.nameNow : ''}>
            {c}
          </span>
        ))}
      </div>

      <div className={s.stage}>
        <div className={s.side}>{won && <IconButton icon="again" label={t.writing.again} showLabel onClick={restart} />}</div>
        {won ? (
          // Done: the whole name, big and golden, with stars around it.
          <div className={[s.box, s.boxCompact, s.boxWin, s.nameCard].join(' ')} data-testid="name-card">
            <span lang={lang}>{entry.glyph}</span>
            <div className={s.winStars} aria-hidden="true">
              {Array.from({ length: 8 }, (_, k) => (
                <Icon key={k} name="star" size={44} style={{ '--a': `${k * 45}deg`, animationDelay: `${(k % 4) * 0.12}s` } as CSSProperties} />
              ))}
            </div>
          </div>
        ) : (
        <PathCanvas
          key={`${round}-${i}`}
          compact
          strokes={strokes}
          label={letter}
          lang={lang}
          // Hala shows every letter; "your turn" only the first time.
          say={(text) => (text === w.yourTurn && i > 0 ? undefined : say(text))}
          onWon={onWon}
        />
        )}
        <div className={s.side}>
          {won ? (
            <>
              <IconButton icon="map" label={t.writing.all} showLabel onClick={back} data-testid="write-next" />
              <p className={s.saved} role="status">
                <Icon name="gallery" size={22} /> {t.writing.savedToGallery}
              </p>
            </>
          ) : (
            <IconButton icon="again" label={t.writing.restart} onClick={restart} />
          )}
        </div>
      </div>
    </Screen>
  )
}
