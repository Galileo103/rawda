import { useMemo, useState } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { visualKey } from '../../../content/parse'
import { ageProfile } from '../../../domain/ageProfile'
import type { ChoiceItem, Visual as VisualT } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { Visual, visualText } from '../../../design/Visual'
import { audio } from '../../../services/audio/AudioService'
import { spokenText } from '../../common'
import s from '../activities.module.css'
import { buildChoices, optionsToHide } from '../choices'
import type { TemplateProps } from './types'

/** "Tap the right one": find the letter, which picture starts with…, colours, shapes, more/fewer, odd one out. */
export function ChoiceTemplate({ item, pool, lang, hintLevel, locked, onCorrect, onWrong, rng }: TemplateProps<ChoiceItem> & { pool: readonly VisualT[] }) {
  // Options are fixed for the lifetime of this task (the player re-mounts per task).
  const age = useOptionalApp()?.age ?? ageProfile(undefined)
  const [options] = useState(() => buildChoices(item, pool, rng, { maxChoices: age.maxChoices, preferConfusables: age.preferConfusables, lang }))
  const [tried, setTried] = useState<Set<string>>(new Set())
  const [solved, setSolved] = useState(false)
  const answerKey = visualKey(item.answer)
  const keys = useMemo(() => options.map(visualKey), [options])
  const hidden = optionsToHide(keys, answerKey, tried, hintLevel)
  const showLabels = options.every((o) => o.kind === 'color')

  const choose = (v: VisualT) => {
    const k = visualKey(v)
    if (locked || solved || tried.has(k)) return
    audio.sfx('tap')
    if (k === answerKey) {
      setSolved(true)
      onCorrect(item.sayAfter?.[lang] ?? spokenText(item.answer, lang))
    } else {
      setTried(new Set(tried).add(k))
      onWrong()
    }
  }

  return (
    <div className={s.stage}>
      {item.show && (
        <div className={s.prompt}>
          <Visual v={item.show} lang={lang} size={150} />
        </div>
      )}
      <div className={s.choices} role="group">
        {options.map((v, i) => {
          const k = keys[i] as string
          if (hidden.has(k)) return null
          const isAnswer = k === answerKey
          const cls = [s.choice, tried.has(k) ? s.wrong : '', solved && isAnswer ? s.correct : '', !solved && isAnswer && hintLevel >= 3 ? s.demo : ''].join(' ')
          const text = visualText(v, lang)
          return (
            <button
              key={k}
              type="button"
              className={cls}
              style={{ animationDelay: `${i * 70}ms` }}
              onClick={() => choose(v)}
              aria-label={text || undefined}
              aria-disabled={tried.has(k) || solved}
              data-testid={isAnswer ? 'choice-answer' : 'choice-other'}
            >
              <Visual v={v} lang={lang} size={item.choices ? 96 : 120} label={showLabels || (solved && isAnswer && v.kind === 'lex')} />
              {solved && isAnswer && (
                <span className={s.checkBadge}>
                  <Icon name="check" size={28} />
                </span>
              )}
              {!solved && isAnswer && hintLevel >= 3 && <Icon name="hand" size={44} className={s.hand} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
