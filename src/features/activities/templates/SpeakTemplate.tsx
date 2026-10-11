import { useRef } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { SpeakItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji } from '../../../design/Visual'
import { audio } from '../../../services/audio/AudioService'
import s from '../activities.module.css'
import type { TemplateProps } from './types'

/** Saying a word aloud is practice, not proof of mastery: it counts at half weight. */
const SAID_ALOUD = 0.5

/**
 * "Say it!": the child hears the word (tap the picture), says it aloud while a grown-up
 * listens, and taps "I said it!".
 */
export function SpeakTemplate({ item, lang, locked, onCorrect }: TemplateProps<SpeakItem>) {
  const t = useOptionalApp()?.t
  const entry = content.lexicon.get(item.word)
  const word = entry?.[lang] ?? ''
  const done = useRef(false)

  const finish = () => {
    if (done.current || locked) return
    done.current = true
    onCorrect(word || undefined, SAID_ALOUD)
  }

  const hearWord = () => {
    audio.sfx('tap')
    void audio.speak(word, lang)
  }

  return (
    <div className={s.stage}>
      <button type="button" className={s.speakCard} onClick={hearWord} aria-label={word} data-testid="speak-word">
        {entry && <OpenMoji hex={entry.image} alt="" size={170} />}
        <span className={s.speakWord} lang={lang} dir="auto">
          {word}
        </span>
      </button>

      <div className={s.actions}>
        <button type="button" className={[s.choice, s.saidIt].join(' ')} onClick={finish} disabled={locked} data-testid="choice-answer">
          <Icon name="check" size={48} />
          <span>{t?.speak.saidIt}</span>
        </button>
      </div>
    </div>
  )
}
