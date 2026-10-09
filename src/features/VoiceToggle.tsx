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
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const start = () => {
    clearTimeout(timer.current)
    setHolding(true)
    timer.current = setTimeout(() => {
      setHolding(false)
      audio.sfx('pop')
      if (on) audio.stop()
      void update({ narration: !on })
    }, HOLD_MS)
  }
  const cancel = () => {
    clearTimeout(timer.current)
    setHolding(false)
  }

  const label = `${on ? t.readAloud.turnOff : t.readAloud.turnOn} (${t.readAloud.holdHint})`
  return (
    <button
      type="button"
      className={[s.btn, on ? '' : s.off, holding ? s.holding : ''].join(' ')}
      style={{ '--hold': `${HOLD_MS}ms` } as CSSProperties}
      aria-label={label}
      title={label}
      aria-pressed={!on}
      data-testid="voice-toggle"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && start()}
      onKeyUp={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className={s.ring} aria-hidden="true" />
      <Icon name={on ? 'speaker' : 'mute'} size={size} />
    </button>
  )
}
