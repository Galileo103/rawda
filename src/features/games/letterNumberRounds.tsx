import { type CSSProperties, useRef, useState } from 'react'
import { PROP_HEX, countPrompt, longestRun, numberName } from '../../content/games'
import { OpenMoji } from '../../design/Visual'
import { type Rng, pickOne, shuffle } from '../../domain/rng'
import { fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { useDrag } from '../activities/templates/useDrag'
import { Ghost } from './drawings'
import { type RoundProps, cx, flash, range, useLatest, useMount } from './engine'
import s from './games.module.css'

const others = <T,>(pool: readonly T[], target: T, n: number, rng: Rng): T[] => shuffle(pool.filter((x) => x !== target), rng).slice(0, Math.max(0, n))

/** A lily pad with a notch, drawn once (Jumping Frog). */
function LilyPad() {
  return (
    <svg className={s.padSvg} viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 50 93 34A46 46 0 1 1 76 12z" fill="#4caf50" stroke="#2e7d32" strokeWidth="3" strokeLinejoin="round" />
      <path d="M50 50 12 42M50 50 24 82M50 50 60 94M50 50 90 70" stroke="#3d9a42" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="50" cy="54" r="22" fill="#eaf8dc" />
    </svg>
  )
}

/** Jumping Frog — Hala names a letter; the frog hops onto the lily pad that carries it (tap the pad, or drag the frog). */
export function FrogRound({ lang, d, choices, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    const pool = learned.letters
    const target = pickOne(pool, rng)
    return { target, opts: shuffle([target, ...others(pool, target, choices - 1, rng)], rng) }
  })
  const frog = useRef<HTMLButtonElement>(null)
  const pads = useRef(new Map<string, HTMLButtonElement>())
  const [landed, setLanded] = useState(false)

  useMount(() => {
    ctl.prompt(fmt(d.games.say.frog, { letter: r.target.name }))
    ctl.hint(() => pads.current.get(r.target.glyph))
    ctl.practise(`${lang}.letter.${r.target.id}`)
  })

  const hop = (glyph: string) => {
    if (locked || landed) return
    const pad = pads.current.get(glyph)
    if (glyph !== r.target.glyph) return ctl.wrong(pad)
    const f = frog.current
    if (f && pad && typeof f.animate === 'function') {
      const a = f.getBoundingClientRect()
      const b = pad.getBoundingClientRect()
      const dx = b.left + b.width / 2 - (a.left + a.width / 2)
      const dy = b.top + b.height / 2 - (a.top + a.height * 0.7)
      f.animate(
        [{ transform: 'translate(0, 0)' }, { transform: `translate(${dx / 2}px, ${dy / 2 - 90}px) scale(1.2)` }, { transform: `translate(${dx}px, ${dy}px)` }],
        { duration: 650, easing: 'ease-in-out', fill: 'forwards' },
      )
    }
    audio.sfx('hop')
    setLanded(true)
    window.setTimeout(() => audio.sfx('splash'), 600)
    ctl.correct(pad)
  }
  const { drag, bind } = useDrag<string>({ disabled: locked, onTap: () => flash(frog.current, s.wiggle, 600), onDrop: (_, target) => target.startsWith('pad:') && hop(target.slice(4)) })

  return (
    <div className={s.lilyPond}>
      <div className={s.pads}>
        {r.opts.map((l, i) => (
          <button
            key={l.glyph}
            ref={(el) => {
              if (el) pads.current.set(l.glyph, el)
            }}
            type="button"
            lang={lang}
            data-drop={`pad:${l.glyph}`}
            className={cx(s.pad, drag?.over === `pad:${l.glyph}` && s.over)}
            aria-label={l.name}
            data-testid={l === r.target ? 'game-answer' : undefined}
            style={{ animationDelay: `${-i * 0.8}s` }}
            onClick={() => hop(l.glyph)}
          >
            <LilyPad />
            <span className={s.padLetter}>{l.glyph}</span>
            {landed && l === r.target && <i className={s.splash} />}
          </button>
        ))}
      </div>
      <div className={s.rock} />
      <button ref={frog} type="button" className={cx(s.hopFrog, drag && s.lifted)} aria-label={d.games.titles.frog} {...bind('frog')}>
        <OpenMoji hex={PROP_HEX.frog} alt="" size={110} />
      </button>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <OpenMoji hex={PROP_HEX.frog} alt="" size={100} />
        </Ghost>
      )}
    </div>
  )
}

const BALLOON_COLORS = ['#e8613a', '#2f8fdb', '#7a5cd6', '#13897f', '#d94a86', '#f28a1c']

/** Balloon Pop — balloons float up slowly (and come round again); pop the named letter or number. */
export function BalloonsRound({ lang, d, choices, maxN, round, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    const cols = shuffle(BALLOON_COLORS, rng)
    const slow = maxN <= 5 ? 4 : 0
    const motion = (i: number) => ({ color: cols[i % cols.length] ?? '#e8613a', dur: 8 + slow + Math.floor(rng() * 4), delay: i * 2.3 + rng() * 2, rest: 18 + Math.floor(rng() * 40) })
    const capped = learned.numbers.filter((n) => n <= maxN)
    const numberPool = capped.length >= 2 ? capped : learned.numbers
    const canLetters = learned.letters.length >= 2
    // Letters and numbers take turns when both are learned; otherwise whichever is.
    if (numberPool.length >= 2 && (!canLetters || round % 2 === 1)) {
      const pool = numberPool
      const target = pickOne(pool, rng)
      const items = shuffle([target, ...others(pool, target, choices - 1, rng)], rng)
      return {
        prompt: fmt(d.games.say.balloonNumber, { number: numberName(target, d) }),
        skill: `num.count.${target}`,
        items: items.map((v, i) => ({ key: String(v), label: numeral(v, lang), name: numberName(v, d), hit: v === target, ...motion(i) })),
      }
    }
    const pool = learned.letters
    const target = pickOne(pool, rng)
    const items = shuffle([target, ...others(pool, target, choices - 1, rng)], rng)
    return {
      prompt: fmt(d.games.say.balloonLetter, { letter: target.name }),
      skill: `${lang}.letter.${target.id}`,
      items: items.map((l, i) => ({ key: l.glyph, label: l.glyph, name: l.name, hit: l === target, ...motion(i) })),
    }
  })
  const bodies = useRef(new Map<string, HTMLElement>())
  const [popped, setPopped] = useState<string | null>(null)

  useMount(() => {
    ctl.prompt(r.prompt)
    ctl.hint(() => bodies.current.get(r.items.find((i) => i.hit)?.key ?? ''))
    ctl.practise(r.skill)
  })

  return (
    <div className={s.sky}>
      {r.items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          lang={lang}
          className={cx(s.balloon, popped === it.key && s.popped)}
          style={{ '--x': `calc(${(((i + 0.5) / r.items.length) * 100).toFixed(1)}% - 50px)`, '--dur': `${it.dur}s`, '--delay': `-${it.delay.toFixed(2)}s`, '--c': it.color, '--rest': `${it.rest}%` } as CSSProperties}
          aria-label={it.name}
          data-testid={it.hit ? 'game-answer' : undefined}
          onClick={() => {
            if (locked) return
            const body = bodies.current.get(it.key)
            if (it.hit) {
              setPopped(it.key)
              audio.sfx('pop')
              ctl.correct(body)
            } else ctl.wrong(body)
          }}
        >
          <span
            ref={(el) => {
              if (el) bodies.current.set(it.key, el)
            }}
            className={s.balloonBody}
          >
            {it.label}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Count & Feed — put exactly N carrots in the bunny's basket (each one is counted aloud), then "I'm done". */
export function CountRound({ lang, d, maxN, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    // Only numbers the child has discovered (and not past what suits their age).
    const capped = learned.numbers.filter((x) => x <= maxN)
    const n = pickOne(capped.length ? capped : learned.numbers.length ? learned.numbers : [1], rng)
    return { n, pile: Math.min(10, n + 2 + Math.floor(rng() * 2)) }
  })
  const [inBasket, setInBasket] = useState<number[]>([])
  const [munch, setMunch] = useState(false)
  const basket = useRef<HTMLDivElement>(null)
  const pile = useRef<HTMLDivElement>(null)
  const doneBtn = useRef<HTMLButtonElement>(null)
  const k = inBasket.length
  const kNow = useLatest(k)

  useMount(() => {
    ctl.prompt(countPrompt(r.n, d))
    ctl.practise(`num.count.${r.n}`)
    ctl.hint(() => (kNow.current < r.n ? pile.current?.querySelector('button') : kNow.current === r.n ? doneBtn.current : basket.current?.querySelector('button')))
  })

  const move = (i: number, to?: 'basket' | 'pile') => {
    if (locked) return
    const isIn = inBasket.includes(i)
    if ((to === 'basket' && isIn) || (to === 'pile' && !isIn)) return
    audio.sfx('tap')
    if (isIn) setInBasket(inBasket.filter((x) => x !== i))
    else {
      setInBasket([...inBasket, i])
      ctl.say(numberName(k + 1, d))
    }
  }
  const { drag, bind } = useDrag<number>({ disabled: locked, onTap: (i) => move(i), onDrop: (i, t) => (t === 'basket' || t === 'pile') && move(i, t) })

  const finish = () => {
    if (locked) return
    if (k === r.n) {
      setMunch(true)
      ctl.correct(basket.current, fmt(d.games.say.countDone, { number: numberName(r.n, d) }))
    } else ctl.wrong(doneBtn.current, k < r.n ? d.games.say.countMore : d.games.say.countLess)
  }

  const carrot = (i: number, small: boolean) => {
    const b = bind(i)
    return (
      <button key={i} type="button" className={cx(s.carrot, small && s.carrotSmall, drag?.payload === i && s.lifted)} aria-label={d.games.carrot} {...b}>
        <OpenMoji hex={PROP_HEX.carrot} alt="" size={small ? 38 : 50} />
      </button>
    )
  }

  return (
    <>
      <div className={s.countWrap}>
        <div ref={pile} data-drop="pile" className={cx(s.pile, drag?.over === 'pile' && s.over)}>
          {range(0, r.pile - 1)
            .filter((i) => !inBasket.includes(i))
            .map((i) => carrot(i, false))}
        </div>
        <div className={s.bunnySide}>
          <div className={s.bunnyHead}>
            <span className={cx(s.bunny, munch && s.gulp)}>
              <OpenMoji hex={PROP_HEX.bunny} alt="" size={96} />
            </span>
            <span className={s.sign} aria-hidden="true">
              {numeral(r.n, lang)}
            </span>
          </div>
          <div ref={basket} data-drop="basket" className={cx(s.basket, drag?.over === 'basket' && s.over)} aria-label={d.games.basket}>
            <div className={s.basketItems}>{inBasket.map((i) => carrot(i, true))}</div>
            <span className={s.basketCount} aria-live="polite">
              {numeral(k, lang)}
            </span>
          </div>
        </div>
      </div>
      <div className={s.center}>
        <button ref={doneBtn} type="button" className={s.doneBtn} onClick={finish} data-testid="game-done">
          ✓ {d.games.done}
        </button>
      </div>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <OpenMoji hex={PROP_HEX.carrot} alt="" size={56} />
        </Ghost>
      )}
    </>
  )
}

const WAGON_COLORS = ['#e8613a', '#2f8fdb', '#13897f', '#7a5cd6', '#d94a86', '#f28a1c']
const wagonColor = (v: number) => WAGON_COLORS[(v - 1) % WAGON_COLORS.length] ?? '#2f8fdb'

/** Number Train — the first car is in place; add the others in order, then the train sets off. */
export function TrainRound({ lang, d, stage, maxN, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    // A stretch of consecutive numbers the child has discovered (e.g. 1, 2, 3).
    const run = longestRun(learned.numbers)
    const known = run.length >= 3 ? run : range(1, 3)
    let len = Math.min([3, 4, 5][stage - 1] ?? 3, known.length)
    if (maxN <= 5) len = Math.min(len, 4)
    const from = stage === 1 ? 0 : Math.floor(rng() * (known.length - len + 1))
    const seq = known.slice(from, from + len)
    return { seq, yard: shuffle(seq.slice(1), rng) }
  })
  const [placed, setPlaced] = useState<number[]>(() => r.seq.slice(0, 1))
  const [go, setGo] = useState(false)
  const slots = useRef(new Map<number, HTMLDivElement>())
  const wagons = useRef(new Map<number, HTMLButtonElement>())
  const placedNow = useLatest(placed)
  const next = r.seq.find((x) => !placed.includes(x))

  useMount(() => {
    ctl.prompt(d.games.say.train)
    ctl.hint(() => {
      const n = r.seq.find((v) => !placedNow.current.includes(v))
      return n === undefined ? null : wagons.current.get(n)
    })
  })

  const place = (v: number, slot?: number) => {
    if (locked || placed.includes(v)) return
    if ((slot ?? next) !== v) {
      ctl.wrong(wagons.current.get(v))
      return
    }
    const now = [...placed, v]
    setPlaced(now)
    if (now.length === r.seq.length) {
      setTimeout(() => setGo(true), 500)
      ctl.correct(slots.current.get(v), d.games.say.trainDone)
    } else {
      ctl.say(numberName(v, d))
      ctl.step(slots.current.get(v))
    }
  }
  const { drag, bind } = useDrag<number>({ disabled: locked, onTap: (v) => place(v), onDrop: (v, t) => t.startsWith('slot-') && place(v, Number(t.slice(5))) })

  return (
    <>
      <div className={s.railWrap}>
        <div className={cx(s.track, go && s.trainGo)}>
          <span className={s.engine}>
            <OpenMoji hex={PROP_HEX.engine} alt="" size={84} />
          </span>
          {r.seq.map((v) => {
            const full = placed.includes(v)
            return (
              <div
                key={v}
                ref={(el) => {
                  if (el) slots.current.set(v, el)
                }}
                data-drop={full ? undefined : `slot-${v}`}
                className={cx(s.wagonSlot, full && s.wagonSlotFull, drag?.over === `slot-${v}` && s.over)}
              >
                {full && (
                  <span className={s.wagon} style={{ '--c': wagonColor(v) } as CSSProperties}>
                    {numeral(v, lang)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className={s.yard}>
        {r.yard
          .filter((v) => !placed.includes(v))
          .map((v) => {
            const b = bind(v)
            return (
              <button
                key={v}
                ref={(el) => {
                  if (el) wagons.current.set(v, el)
                }}
                type="button"
                className={cx(s.wagon, drag?.payload === v && s.lifted)}
                aria-label={numberName(v, d)}
                data-testid={v === next ? 'game-answer' : undefined}
                {...b}
                style={{ ...b.style, '--c': wagonColor(v) } as CSSProperties}
              >
                {numeral(v, lang)}
              </button>
            )
          })}
      </div>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <span className={s.wagon} style={{ '--c': wagonColor(drag.payload) } as CSSProperties}>
            {numeral(drag.payload, lang)}
          </span>
        </Ghost>
      )}
    </>
  )
}
