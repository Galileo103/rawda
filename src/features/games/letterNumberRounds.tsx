import { type CSSProperties, useRef, useState } from 'react'
import { PROP_HEX, countPrompt, letterPool, numberName } from '../../content/games'
import { OpenMoji } from '../../design/Visual'
import { type Rng, pickOne, shuffle } from '../../domain/rng'
import { fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { useDrag } from '../activities/templates/useDrag'
import { Ghost } from './drawings'
import { type RoundProps, cx, range, useLatest, useMount } from './engine'
import s from './games.module.css'

const others = <T,>(pool: readonly T[], target: T, n: number, rng: Rng): T[] => shuffle(pool.filter((x) => x !== target), rng).slice(0, Math.max(0, n))

/** Hungry Frog — Hala names a letter; feed the frog the fly that carries it (tap or drag). */
export function FrogRound({ lang, d, stage, choices, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const pool = letterPool(lang, stage)
    const target = pickOne(pool, rng)
    return { target, opts: shuffle([target, ...others(pool, target, choices - 1, rng)], rng) }
  })
  const frog = useRef<HTMLDivElement>(null)
  const flies = useRef(new Map<string, HTMLButtonElement>())
  const [eaten, setEaten] = useState(false)

  useMount(() => {
    ctl.prompt(fmt(d.games.say.frog, { letter: r.target.name }))
    ctl.hint(() => flies.current.get(r.target.glyph))
  })

  const feed = (glyph: string) => {
    if (locked) return
    if (glyph === r.target.glyph) {
      setEaten(true)
      ctl.correct(frog.current)
    } else ctl.wrong(flies.current.get(glyph))
  }
  const { drag, bind } = useDrag<string>({ disabled: locked, onTap: feed, onDrop: (g, target) => target === 'frog' && feed(g) })

  return (
    <>
      <div className={s.flies}>
        {r.opts.map((l, i) => {
          const b = bind(l.glyph)
          return (
            <button
              key={l.glyph}
              ref={(el) => {
                if (el) flies.current.set(l.glyph, el)
              }}
              type="button"
              lang={lang}
              className={cx(s.fly, eaten && l === r.target && s.eaten, drag?.payload === l.glyph && s.lifted)}
              aria-label={l.name}
              data-testid={l === r.target ? 'game-answer' : undefined}
              {...b}
              style={{ ...b.style, animationDelay: `${i * 0.35}s` }}
            >
              <span className={s.flyBug}>
                <OpenMoji hex={PROP_HEX.fly} alt="" size={34} />
              </span>
              <span className={s.flyLetter}>{l.glyph}</span>
            </button>
          )
        })}
      </div>
      <div className={s.pond}>
        <div ref={frog} data-drop="frog" className={cx(s.frog, eaten && s.gulp, drag?.over === 'frog' && s.over)}>
          <OpenMoji hex={PROP_HEX.frog} alt="" size={130} />
        </div>
      </div>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <span className={s.fly}>
            <span className={s.flyLetter}>{drag.payload}</span>
          </span>
        </Ghost>
      )}
    </>
  )
}

const BALLOON_COLORS = ['#e8613a', '#2f8fdb', '#7a5cd6', '#13897f', '#d94a86', '#f28a1c']

/** Balloon Pop — balloons float up slowly (and come round again); pop the named letter or number. */
export function BalloonsRound({ lang, d, stage, choices, maxN, round, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const cols = shuffle(BALLOON_COLORS, rng)
    const slow = maxN <= 5 ? 4 : 0
    const motion = (i: number) => ({ color: cols[i % cols.length] ?? '#e8613a', dur: 8 + slow + Math.floor(rng() * 4), delay: i * 2.3 + rng() * 2, rest: 18 + Math.floor(rng() * 40) })
    if (round % 2 === 1) {
      const pool = range(1, Math.min(maxN, [5, 9, 10][stage - 1] ?? 10))
      const target = pickOne(pool, rng)
      const items = shuffle([target, ...others(pool, target, choices - 1, rng)], rng)
      return {
        prompt: fmt(d.games.say.balloonNumber, { number: numberName(target, d) }),
        items: items.map((v, i) => ({ key: String(v), label: numeral(v, lang), name: numberName(v, d), hit: v === target, ...motion(i) })),
      }
    }
    const pool = letterPool(lang, stage)
    const target = pickOne(pool, rng)
    const items = shuffle([target, ...others(pool, target, choices - 1, rng)], rng)
    return {
      prompt: fmt(d.games.say.balloonLetter, { letter: target.name }),
      items: items.map((l, i) => ({ key: l.glyph, label: l.glyph, name: l.name, hit: l === target, ...motion(i) })),
    }
  })
  const bodies = useRef(new Map<string, HTMLElement>())
  const [popped, setPopped] = useState<string | null>(null)

  useMount(() => {
    ctl.prompt(r.prompt)
    ctl.hint(() => bodies.current.get(r.items.find((i) => i.hit)?.key ?? ''))
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
export function CountRound({ lang, d, stage, maxN, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const top = Math.min(maxN, [3, 5, 10][stage - 1] ?? 10)
    const n = 1 + Math.floor(rng() * top)
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
export function TrainRound({ lang, d, stage, maxN, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    let len = [3, 4, 5][stage - 1] ?? 3
    if (maxN <= 5) len = Math.min(len, 4)
    const top = Math.min(maxN, 10)
    const start = stage === 1 ? 1 : 1 + Math.floor(rng() * Math.max(1, top - len + 1))
    const seq = range(start, start + len - 1)
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
