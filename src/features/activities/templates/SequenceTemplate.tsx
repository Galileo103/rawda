import { useState } from 'react'
import { visualKey } from '../../../content/parse'
import type { SequenceItem } from '../../../content/schemas'
import { Visual, visualText } from '../../../design/Visual'
import { shuffle } from '../../../domain/rng'
import { numeral } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { spokenText } from '../../common'
import s from '../activities.module.css'
import type { TemplateProps } from './types'
import { useDrag } from './useDrag'

/**
 * Put things in order (numbers 1→5, story events…): drag each tile into the next empty
 * slot. Tapping a tile still works for children who find dragging hard.
 */
export function SequenceTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, rng }: TemplateProps<SequenceItem>) {
  const [tiles] = useState(() => {
    const order = item.steps.map((_, i) => i)
    let mixed = shuffle(order, rng)
    // Never present the tiles already in the right order.
    for (let tries = 0; tries < 5 && mixed.every((v, i) => v === i); tries++) mixed = shuffle(order, rng)
    return mixed
  })
  const [placed, setPlaced] = useState(0)
  const [shake, setShake] = useState<number | null>(null)

  const place = (stepIdx: number) => {
    if (locked || stepIdx < placed) return
    const step = item.steps[stepIdx]
    const expected = item.steps[placed]
    if (!step || !expected) return
    if (visualKey(step) === visualKey(expected)) {
      const n = placed + 1
      setPlaced(n)
      audio.sfx('pop')
      const word = spokenText(step, lang)
      if (n === item.steps.length) onCorrect(word || undefined)
      else if (word) void audio.speak(word, lang)
    } else {
      setShake(stepIdx)
      setTimeout(() => setShake(null), 450)
      onWrong()
    }
  }

  const { drag, bind } = useDrag<number>({
    disabled: locked,
    onTap: (stepIdx) => {
      audio.sfx('tap')
      place(stepIdx)
    },
    onDrop: (stepIdx, target) => target === 'slots' && place(stepIdx),
  })
  const ghost = drag ? item.steps[drag.payload] : undefined

  return (
    <div className={s.stage}>
      <div className={[s.slots, drag?.over === 'slots' ? s.dropOver : ''].join(' ')} data-drop="slots" data-testid="drop-slots">
        {item.steps.map((step, i) => (
          <div key={i} className={[s.slot, i < placed ? s.slotFilled : '', i === placed && drag ? s.slotNext : ''].join(' ')} aria-label={i < placed ? visualText(step, lang) : numeral(i + 1, lang)}>
            {i < placed ? <Visual v={step} lang={lang} size={78} /> : numeral(i + 1, lang)}
          </div>
        ))}
      </div>
      <div className={s.choices} role="group">
        {tiles.map((stepIdx, i) => {
          const step = item.steps[stepIdx]
          if (!step || stepIdx < placed) return null
          const isNext = stepIdx === placed
          const b = bind(stepIdx)
          return (
            <button
              key={stepIdx}
              type="button"
              {...b}
              className={[s.choice, shake === stepIdx ? s.wrong : '', isNext && hintLevel >= 3 ? s.demo : '', drag?.payload === stepIdx ? s.lifted : ''].join(' ')}
              style={{ ...b.style, animationDelay: `${i * 60}ms`, minWidth: 120, minHeight: 120 }}
              aria-label={visualText(step, lang) || undefined}
              data-testid={isNext ? 'choice-answer' : 'choice-other'}
            >
              <Visual v={step} lang={lang} size={90} />
            </button>
          )
        })}
      </div>
      {drag && ghost && (
        <div className={s.ghost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <Visual v={ghost} lang={lang} size={90} />
        </div>
      )}
    </div>
  )
}
