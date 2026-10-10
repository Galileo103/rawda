import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { content } from '../../../content/loader'
import type { MemoryItem } from '../../../content/schemas'
import { OpenMoji } from '../../../design/Visual'
import { shuffle } from '../../../domain/rng'
import { audio } from '../../../services/audio/AudioService'
import s from '../activities.module.css'
import type { TemplateProps } from './types'

/** Memory cards. Mismatches are part of the game (not counted as mistakes); help = a short peek at all cards. */
export function MemoryTemplate({ item, lang, hintLevel, locked, onCorrect, rng }: TemplateProps<MemoryItem>) {
  const [deck] = useState(() => shuffle([...item.cards, ...item.cards], rng))
  const [open, setOpen] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [peek, setPeek] = useState(false)
  const busy = useRef(false)
  const lastHint = useRef(hintLevel)

  useEffect(() => {
    if (hintLevel <= lastHint.current) return
    lastHint.current = hintLevel
    setPeek(true)
    const t = setTimeout(() => setPeek(false), 1600)
    return () => clearTimeout(t)
  }, [hintLevel])

  const flip = (i: number) => {
    const id = deck[i]
    if (!id || locked || busy.current || open.includes(i) || matched.has(id)) return
    audio.sfx('flip')
    const word = content.lexicon.get(id)?.[lang]
    if (word) void audio.speak(word, lang)
    const next = [...open, i]
    setOpen(next)
    if (next.length < 2) return
    const [x, y] = next as [number, number]
    if (deck[x] === deck[y]) {
      const m = new Set(matched).add(id)
      setMatched(m)
      setOpen([])
      audio.sfx('pop')
      if (m.size === item.cards.length) onCorrect(word)
    } else {
      busy.current = true
      setTimeout(() => {
        setOpen([])
        busy.current = false
      }, 1000)
    }
  }

  const cols = deck.length >= 12 ? 4 : deck.length >= 6 ? (deck.length === 8 ? 4 : 3) : 2

  return (
    <div className={s.stage}>
      <div className={s.memGrid} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, '--cols': cols, '--rows': Math.ceil(deck.length / cols) } as CSSProperties}>
        {deck.map((id, i) => {
          const e = content.lexicon.get(id)
          const isMatched = matched.has(id)
          const isOpen = peek || isMatched || open.includes(i)
          return (
            <button
              key={i}
              type="button"
              className={[s.memCard, isOpen ? s.memOpen : '', isMatched ? s.memMatched : ''].join(' ')}
              onClick={() => flip(i)}
              aria-label={isOpen ? (e?.[lang] ?? id) : `${i + 1}`}
              aria-pressed={isOpen}
            >
              <span className={s.memInner}>
                <span className={s.memBack} />
                <span className={s.memFace}>{e && <OpenMoji hex={e.image} alt="" size={86} />}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
