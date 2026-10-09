import { useMemo, useState } from 'react'
import type { SortItem } from '../../../content/schemas'
import { Visual, visualText } from '../../../design/Visual'
import { shuffle } from '../../../domain/rng'
import { audio } from '../../../services/audio/AudioService'
import { spokenText } from '../../common'
import s from '../activities.module.css'
import type { TemplateProps } from './types'
import { useDrag } from './useDrag'

/**
 * Sort into baskets (classification: by colour, shape, where it lives…).
 * Drag a picture into its basket — or tap the picture, then tap the basket.
 * A wrong basket wobbles and the picture simply goes back; nothing is lost.
 */
export function SortTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, rng }: TemplateProps<SortItem>) {
  const order = useMemo(() => shuffle(item.things.map((_, i) => i), rng), [item, rng])
  const [placed, setPlaced] = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [shakeBin, setShakeBin] = useState<string | null>(null)

  const put = (thing: number, bin: string) => {
    const th = item.things[thing]
    if (locked || !th || placed.includes(thing)) return
    setSelected(null)
    if (th.bin === bin) {
      const next = [...placed, thing]
      setPlaced(next)
      audio.sfx('pop')
      const word = spokenText(th.v, lang)
      if (next.length === item.things.length) onCorrect()
      else if (word) void audio.speak(word, lang)
    } else {
      setShakeBin(bin)
      setTimeout(() => setShakeBin(null), 450)
      onWrong()
    }
  }

  const { drag, bind } = useDrag<number>({
    disabled: locked,
    onTap: (thing) => {
      audio.sfx('tap')
      setSelected((cur) => (cur === thing ? null : thing))
    },
    onDrop: (thing, target) => put(thing, target),
  })

  const remaining = order.filter((i) => !placed.includes(i))
  // Hint 3: the basket for the selected (or next) picture glows.
  const focusThing = selected ?? remaining[0]
  const hintBin = hintLevel >= 3 && focusThing !== undefined ? item.things[focusThing]?.bin : undefined
  const ghost = drag ? item.things[drag.payload] : undefined

  return (
    <div className={s.stage}>
      <div className={s.bins}>
        {item.bins.map((b) => {
          const inside = placed.filter((i) => item.things[i]?.bin === b.id)
          return (
            <button
              key={b.id}
              type="button"
              data-drop={b.id}
              data-testid={`bin-${b.id}`}
              className={[s.bin, drag?.over === b.id ? s.dropOver : '', shakeBin === b.id ? s.wrong : '', hintBin === b.id ? s.demo : '', selected !== null ? s.binReady : ''].join(' ')}
              onClick={() => selected !== null && put(selected, b.id)}
              aria-label={visualText(b.label, lang) || b.id}
            >
              <span className={s.binLabel}>
                <Visual v={b.label} lang={lang} size={64} />
              </span>
              <span className={s.binInside}>
                {inside.map((i) => {
                  const th = item.things[i]
                  return th ? <Visual key={i} v={th.v} lang={lang} size={40} /> : null
                })}
              </span>
            </button>
          )
        })}
      </div>
      <div className={s.choices} role="group">
        {remaining.map((i, n) => {
          const th = item.things[i]
          if (!th) return null
          const b = bind(i)
          return (
            <button
              key={i}
              type="button"
              {...b}
              className={[s.choice, s.sortThing, selected === i ? s.selected : '', drag?.payload === i ? s.lifted : ''].join(' ')}
              style={{ ...b.style, animationDelay: `${n * 60}ms` }}
              aria-pressed={selected === i}
              aria-label={visualText(th.v, lang) || undefined}
              data-testid={`thing-${th.bin}`}
            >
              <Visual v={th.v} lang={lang} size={80} />
            </button>
          )
        })}
      </div>
      {drag && ghost && (
        <div className={s.ghost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <Visual v={ghost.v} lang={lang} size={80} />
        </div>
      )}
    </div>
  )
}
