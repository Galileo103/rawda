import { useEffect, useState } from 'react'
import { audio } from '../services/audio/AudioService'
import s from './Mascot.module.css'

export type MascotMood = 'idle' | 'happy' | 'cheer' | 'think' | 'sleep'

/**
 * Hala (هالة), the little teacher owl — original artwork. Moods are always kind:
 * there is deliberately no "sad" or "disappointed" state.
 * The beak animates automatically while narration is playing.
 */
export function Mascot({ mood = 'idle', size = 160, label }: { mood?: MascotMood; size?: number; label?: string }) {
  label ??= typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'Hala' : 'هالة'
  const speaking = useSpeaking()
  const closedEyes = mood === 'happy' || mood === 'cheer' || mood === 'sleep'
  const classes = [s.wrap, s[mood], speaking ? s.talk : ''].filter(Boolean).join(' ')
  return (
    <span className={classes} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true">
        <ellipse cx="120" cy="226" rx="62" ry="9" fill="rgba(51,38,74,.12)" />
        <g className={s.body}>
          {/* wings */}
          <path className={s.wingL} d="M58 112c-22 12-28 48-14 72 12-4 26-22 30-44z" fill="#6a4cc4" />
          <path className={s.wingR} d="M182 112c22 12 28 48 14 72-12-4-26-22-30-44z" fill="#6a4cc4" />
          {/* body */}
          <path d="M120 38c-46 0-74 34-74 84 0 58 32 98 74 98s74-40 74-98c0-50-28-84-74-84z" fill="#8a6de0" />
          {/* ear tufts */}
          <path d="M62 64 54 26l36 22z" fill="#8a6de0" />
          <path d="M178 64l8-38-36 22z" fill="#8a6de0" />
          {/* belly */}
          <path d="M120 120c-30 0-46 24-46 52 0 26 20 44 46 44s46-18 46-44c0-28-16-52-46-52z" fill="#ffe7c2" />
          <path d="M100 160q6 6 12 0M128 160q6 6 12 0M114 184q6 6 12 0" stroke="#e8b979" strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* face disc */}
          <circle cx="90" cy="96" r="34" fill="#fff8ec" />
          <circle cx="150" cy="96" r="34" fill="#fff8ec" />
          {/* eyes */}
          {closedEyes ? (
            <g stroke="#33264a" strokeWidth="6" fill="none" strokeLinecap="round">
              {mood === 'sleep' ? (
                <>
                  <path d="M76 100q14 8 28 0" />
                  <path d="M136 100q14 8 28 0" />
                </>
              ) : (
                <>
                  <path d="M76 102q14-16 28 0" />
                  <path d="M136 102q14-16 28 0" />
                </>
              )}
            </g>
          ) : (
            <g className={s.eyes}>
              <circle cx="90" cy="96" r="16" fill="#33264a" />
              <circle cx="150" cy="96" r="16" fill="#33264a" />
              <circle cx={mood === 'think' ? 94 : 96} cy={mood === 'think' ? 88 : 90} r="6" fill="#fff" />
              <circle cx={mood === 'think' ? 154 : 156} cy={mood === 'think' ? 88 : 90} r="6" fill="#fff" />
            </g>
          )}
          {/* cheeks */}
          <circle cx="66" cy="120" r="9" fill="#ff9fb8" opacity=".7" />
          <circle cx="174" cy="120" r="9" fill="#ff9fb8" opacity=".7" />
          {/* beak */}
          <path className={s.beak} d="M108 114h24l-12 18z" fill="#ffb02e" stroke="#e8902a" strokeWidth="2" strokeLinejoin="round" />
          {/* feet */}
          <path d="M98 216v10M106 216v10M134 216v10M142 216v10" stroke="#ffb02e" strokeWidth="6" strokeLinecap="round" />
          {mood === 'sleep' && (
            <text x="186" y="52" fontSize="30" fontWeight="800" fill="#7a5cd6">
              z
            </text>
          )}
        </g>
      </svg>
    </span>
  )
}

function useSpeaking(): boolean {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => audio.onSpeakingChange(setSpeaking), [])
  return speaking
}
