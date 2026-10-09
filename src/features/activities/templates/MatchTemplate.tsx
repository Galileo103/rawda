import { type PointerEvent, useState } from 'react'
import type { MatchItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { Visual, visualText } from '../../../design/Visual'
import { audio } from '../../../services/audio/AudioService'
import { shuffle } from '../../../domain/rng'
import s from '../activities.module.css'
import type { TemplateProps } from './types'

// Pairs are marked with a colour AND a symbol, so colour is never the only cue.
const MARKS = [
  { c: '#2F7DE1', m: '●' },
  { c: '#E5383B', m: '▲' },
  { c: '#2FAE4E', m: '■' },
  { c: '#8E44D9', m: '★' },
  { c: '#FF8C1A', m: '◆' },
]

type Side = 'a' | 'b'

/**
 * Match pairs (e.g. uppercase ↔ lowercase). Two ways to play:
 * tap one, then its partner — or drag from one to the other.
 */
export function MatchTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, rng }: TemplateProps<MatchItem>) {
  const [rightOrder] = useState(() => shuffle(item.pairs.map((_, i) => i), rng))
  const [selected, setSelected] = useState<{ side: Side; idx: number } | null>(null)
  const [matched, setMatched] = useState<number[]>([])
  const [shake, setShake] = useState<string | null>(null)

  const attempt = (first: { side: Side; idx: number }, side: Side, idx: number) => {
    if (first.side === side) {
      setSelected({ side, idx })
      return
    }
    setSelected(null)
    if (first.idx === idx) {
      const next = [...matched, idx]
      setMatched(next)
      audio.sfx('pop')
      if (next.length === item.pairs.length) onCorrect()
    } else {
      setShake(`${side}${idx}`)
      setTimeout(() => setShake(null), 450)
      onWrong()
    }
  }

  const tap = (side: Side, idx: number) => {
    if (locked || matched.includes(idx)) return
    audio.sfx('tap')
    if (!selected) setSelected({ side, idx })
    else if (selected.side === side && selected.idx === idx) setSelected(null)
    else attempt(selected, side, idx)
  }

  // Drag support: press on one card, release over a card in the other column.
  const onPointerUp = (e: PointerEvent) => {
    if (!selected) return
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-side]')
    if (!el) return
    const side = el.dataset.side as Side
    const idx = Number(el.dataset.idx)
    if (side !== selected.side && !matched.includes(idx)) attempt(selected, side, idx)
  }

  // Hint 3: show which card belongs with the selected one (or the first unmatched pair).
  const hintIdx = hintLevel >= 3 ? (selected?.idx ?? item.pairs.findIndex((_, i) => !matched.includes(i))) : -1

  const card = (side: Side, idx: number) => {
    const pair = item.pairs[idx]
    if (!pair) return null
    const v = side === 'a' ? pair.a : pair.b
    const done = matched.includes(idx)
    const mark = MARKS[matched.indexOf(idx) % MARKS.length]
    const isSel = selected?.side === side && selected.idx === idx
    return (
      <button
        key={`${side}${idx}`}
        type="button"
        data-side={side}
        data-idx={idx}
        className={[s.matchItem, isSel ? s.selected : '', done ? s.correct : '', shake === `${side}${idx}` ? s.wrong : '', !done && hintIdx === idx ? s.demo : ''].join(' ')}
        style={done && mark ? { borderColor: mark.c } : undefined}
        onPointerDown={() => {
          // Start a drag/selection only when nothing from the other column is waiting for a partner.
          if (!locked && !done && (!selected || selected.side === side)) {
            if (!selected) audio.sfx('tap')
            setSelected({ side, idx })
          }
        }}
        onPointerUp={onPointerUp}
        onClick={(e) => {
          // Keyboard activation (detail 0) goes through the tap-tap flow; pointer taps were handled above.
          if (e.detail === 0) tap(side, idx)
        }}
        aria-pressed={isSel}
        aria-label={visualText(v, lang) || undefined}
      >
        <Visual v={v} lang={lang} size={84} />
        {done && mark && (
          <span className={s.pairMark} style={{ color: mark.c }} aria-hidden="true">
            {mark.m}
          </span>
        )}
        {done && (
          <span className={s.checkBadge}>
            <Icon name="check" size={22} />
          </span>
        )}
      </button>
    )
  }

  return (
    <div className={s.stage}>
      <div className={s.matchBoard}>
        <div className={s.matchCol}>{item.pairs.map((_, i) => card('a', i))}</div>
        <div className={s.matchCol}>{rightOrder.map((i) => card('b', i))}</div>
      </div>
    </div>
  )
}
