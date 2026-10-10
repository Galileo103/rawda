import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppState'
import { Icon } from '../design/Icon'
import { audio } from '../services/audio/AudioService'
import s from './voiceToggle.module.css'

const HOLD_MS = 1200

/**
 * Voice on/off for the grown-up sitting with the child. Off = Hala stays silent and every
 * instruction is shown in large text for the parent to read aloud. Press-and-hold, so a
 * curious tap from the child does not change it.
 */
export function VoiceToggle({ size = 30 }: { size?: number }) {
  const { settings, t, update } = useApp()
  const on = settings.narration
  const [holding, setHolding] = useState(false)
  /** Phones have no hover tooltip: a short tap shows this hint bubble instead. */
  const [hint, setHint] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      clearTimeout(hintTimer.current)
    },
    [],
  )

  const start = () => {
    clearTimeout(timer.current)
    setHolding(true)
    setHint(false)
    timer.current = setTimeout(() => {
      timer.current = undefined
      setHolding(false)
      audio.sfx('pop')
      if (on) audio.stop()
      void update({ narration: !on })
    }, HOLD_MS)
  }
  /** `released`: the finger/key was let go (not slid off). Released early → explain how it works. */
  const cancel = (released = false) => {
    const early = timer.current !== undefined
    clearTimeout(timer.current)
    timer.current = undefined
    setHolding(false)
    if (released && early) {
      setHint(true)
      clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setHint(false), 2800)
    }
  }

  const action = on ? t.readAloud.turnOff : t.readAloud.turnOn
  const label = `${action} (${t.readAloud.holdHint})`
  return (
    <span className={s.wrap}>
      {hint && (
        <span className={s.hint} role="status">
          <b>{t.readAloud.holdHint}</b>
          {action}
        </span>
      )}
      <button
      type="button"
      className={[s.btn, on ? '' : s.off, holding ? s.holding : ''].join(' ')}
      style={{ '--hold': `${HOLD_MS}ms` } as CSSProperties}
      aria-label={label}
      title={label}
      aria-pressed={!on}
      data-testid="voice-toggle"
      onPointerDown={start}
      onPointerUp={() => cancel(true)}
      onPointerLeave={() => cancel()}
      onPointerCancel={() => cancel()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && start()}
      onKeyUp={() => cancel(true)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={s.ring} aria-hidden="true" />
      <Icon name={on ? 'speaker' : 'mute'} size={size} />
    </button>
    </span>
  )
}
