import { useEffect, useRef, useState } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { SpeakItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji } from '../../../design/Visual'
import { audio } from '../../../services/audio/AudioService'
import { voice } from '../../common'
import { type Listening, listen, micSupported, playRecording } from '../../speech/speechService'
import { SPEECH_QUALITY, speechMatches } from '../../speech/speechMatch'
import s from '../activities.module.css'
import type { TemplateProps } from './types'

type Phase = 'ready' | 'listening' | 'review'

/**
 * "Say it!": listen → say → hear yourself → compare.
 * - With the microphone on (parent opt-in), the child taps the big mic and says the word. Her
 *   recording is played back, then Hala says it again so she can compare. On-device recognition,
 *   when the browser has it, can only *celebrate* ("I heard you!"); it never marks her wrong.
 * - With the microphone off, the child says it aloud (a grown-up listens) and taps "I said it!".
 */
export function SpeakTemplate({ item, lang, locked, onCorrect }: TemplateProps<SpeakItem>) {
  const app = useOptionalApp()
  const t = app?.t
  const micOn = !!app?.settings.micEnabled && micSupported()
  const entry = content.lexicon.get(item.word)
  const word = entry?.[lang] ?? ''
  const v = voice(lang)
  const [phase, setPhase] = useState<Phase>('ready')
  const [tries, setTries] = useState(0)
  const [heard, setHeard] = useState(false)
  const current = useRef<Listening | null>(null)
  const url = useRef<string | undefined>(undefined)
  const done = useRef(false)

  useEffect(
    () => () => {
      current.current?.stop()
      if (url.current) URL.revokeObjectURL(url.current)
    },
    [],
  )

  const finish = (quality: number) => {
    if (done.current || locked) return
    done.current = true
    onCorrect(word || undefined, quality)
  }

  const hearWord = () => {
    audio.sfx('tap')
    void audio.speak(word, lang)
  }

  const startListening = async () => {
    if (locked || phase === 'listening') return
    audio.sfx('pop')
    setPhase('listening')
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = undefined
    const l = listen(lang)
    current.current = l
    const r = await l.result
    current.current = null
    url.current = r.recordingUrl
    setTries((n) => n + 1)
    if (r.recognized && speechMatches(r.heard, word, lang)) {
      setHeard(true)
      setPhase('review')
      await audio.speak(v.heardYou, lang)
      finish(SPEECH_QUALITY.heard)
      return
    }
    setPhase('review')
    // Hear yourself, then Hala again: the child compares the two.
    if (r.recordingUrl) {
      await audio.speak(v.listenToYou, lang)
      await playRecording(r.recordingUrl)
    }
    await audio.speak(word, lang)
  }

  const stopListening = () => current.current?.stop()

  return (
    <div className={s.stage}>
      <button type="button" className={s.speakCard} onClick={hearWord} aria-label={word} data-testid="speak-word">
        {entry && <OpenMoji hex={entry.image} alt="" size={170} />}
        <span className={s.speakWord} lang={lang} dir="auto">
          {word}
        </span>
      </button>

      <div className={s.actions}>
        {micOn && (
          <button
            type="button"
            className={[s.micBtn, phase === 'listening' ? s.micLive : ''].join(' ')}
            onClick={() => (phase === 'listening' ? stopListening() : void startListening())}
            disabled={locked}
            aria-label={phase === 'listening' ? (t?.speak.listening ?? '') : (t?.speak.tapToTalk ?? '')}
            data-testid="speak-mic"
          >
            <Icon name="mic" size={64} />
            <span className={s.micLabel}>{phase === 'listening' ? t?.speak.listening : tries > 0 ? t?.speak.again : t?.speak.tapToTalk}</span>
          </button>
        )}
        {/* "I said it!": always there without a mic; with a mic, after the first try. */}
        {(!micOn || (phase === 'review' && !heard)) && (
          <button
            type="button"
            className={[s.choice, s.saidIt].join(' ')}
            onClick={() => finish(micOn ? SPEECH_QUALITY.selfCheckedRecording : SPEECH_QUALITY.saidAloud)}
            disabled={locked}
            data-testid="choice-answer"
          >
            <Icon name="check" size={48} />
            <span>{t?.speak.saidIt}</span>
          </button>
        )}
      </div>
    </div>
  )
}
