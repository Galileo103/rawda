import { useEffect, useRef, useState } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import { ageProfile } from '../../../domain/ageProfile'
import type { CountItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji } from '../../../design/Visual'
import { numeral } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { numberWord, voice } from '../../common'
import s from '../activities.module.css'
import { numberChoices, optionsToHide } from '../choices'
import type { TemplateProps } from './types'

/** Count objects (tap each one to count aloud), then pick the number. */
export function CountTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, rng }: TemplateProps<CountItem>) {
  const entry = content.lexicon.get(item.object)
  const age = useOptionalApp()?.age ?? ageProfile(undefined)
  const [options] = useState(() => numberChoices(item.count, item.difficulty, rng, 10, age.maxChoices))
  const [order, setOrder] = useState<number[]>([]) // object indexes in the order they were counted
  const [tried, setTried] = useState<Set<number>>(new Set())
  const [solved, setSolved] = useState(false)
  const demoDone = useRef(false)

  // Hint level 1: Hala counts them all together with the child.
  useEffect(() => {
    if (hintLevel < 1 || demoDone.current) return
    demoDone.current = true
    let cancelled = false
    void (async () => {
      setOrder([])
      await audio.speak(voice(lang).countTogether, lang)
      for (let i = 0; i < item.count && !cancelled; i++) {
        setOrder((o) => [...o, i])
        audio.sfx('pop')
        await audio.speak(numberWord(i + 1, lang), lang)
        await new Promise((r) => setTimeout(r, 250))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [hintLevel, item.count, lang])

  const countObject = (i: number) => {
    if (order.includes(i) || solved) return
    const n = order.length + 1
    setOrder([...order, i])
    audio.sfx('pop')
    void audio.speak(numberWord(n, lang), lang)
  }

  const answer = (n: number) => {
    if (locked || solved || tried.has(n)) return
    audio.sfx('tap')
    if (n === item.count) {
      setSolved(true)
      onCorrect(numberWord(n, lang))
    } else {
      setTried(new Set(tried).add(n))
      onWrong()
    }
  }

  const keys = options.map(String)
  const hidden = optionsToHide(keys, String(item.count), new Set([...tried].map(String)), hintLevel)
  const size = item.count > 6 ? 76 : 96

  return (
    <div className={s.stage}>
      <div className={s.objects} role="group">
        {Array.from({ length: item.count }, (_, i) => {
          const pos = order.indexOf(i)
          return (
            <button key={i} type="button" className={[s.obj, pos >= 0 ? s.objCounted : ''].join(' ')} onClick={() => countObject(i)} aria-label={entry?.[lang] ?? ''}>
              {entry && <OpenMoji hex={entry.image} alt="" size={size} />}
              {pos >= 0 && <span className={s.num}>{numeral(pos + 1, lang)}</span>}
            </button>
          )
        })}
      </div>
      <div className={s.choices} role="group">
        {options.map((n) => {
          if (hidden.has(String(n))) return null
          const isAnswer = n === item.count
          return (
            <button
              key={n}
              type="button"
              className={[s.choice, tried.has(n) ? s.wrong : '', solved && isAnswer ? s.correct : '', !solved && isAnswer && hintLevel >= 3 ? s.demo : ''].join(' ')}
              onClick={() => answer(n)}
              aria-label={numberWord(n, lang)}
              data-testid={isAnswer ? 'choice-answer' : 'choice-other'}
              style={{ minWidth: 120, minHeight: 120 }}
            >
              <span style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1 }}>{numeral(n, lang)}</span>
              {solved && isAnswer && (
                <span className={s.checkBadge}>
                  <Icon name="check" size={28} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
