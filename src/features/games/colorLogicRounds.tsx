import { type CSSProperties, useRef, useState } from 'react'
import { BUILD_SHAPES, CATEGORIES, CATEGORY_IDS, type CategoryId, GAME_COLORS, ODD_SHAPES, PATTERN_KINDS, PATTERN_SETS, PUZZLES, PUZZLES_BY_STAGE } from '../../content/games'
import type { ColorKey, ShapeKey } from '../../content/schemas'
import { COLOR_HEX, OpenMoji, ShapeSvg } from '../../design/Visual'
import { pickOne, shuffle } from '../../domain/rng'
import { fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { useDrag } from '../activities/templates/useDrag'
import { Butterfly, Flower, Ghost, ShapeFill } from './drawings'
import { type RoundProps, cx, useLatest, useMount } from './engine'
import s from './games.module.css'

/** Color Butterflies — take each butterfly to the flower of its colour (drag, or tap then tap). */
export function ButterfliesRound({ d, stage, choices, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const pairs = Math.min([2, 3, 4][stage - 1] ?? 2, stage === 1 ? 2 : choices)
    const cols = shuffle(GAME_COLORS, rng).slice(0, pairs)
    return { flowers: shuffle(cols, rng), flies: shuffle(cols, rng) }
  })
  const [landed, setLanded] = useState<ColorKey[]>([])
  const [sel, setSel] = useState<ColorKey | null>(null)
  const flyEls = useRef(new Map<ColorKey, HTMLButtonElement>())
  const flowerEls = useRef(new Map<ColorKey, HTMLButtonElement>())
  const landedNow = useLatest(landed)

  useMount(() => {
    ctl.prompt(d.games.say.butterflies)
    ctl.hint(() => {
      const c = r.flies.find((x) => !landedNow.current.includes(x))
      return c ? flyEls.current.get(c) : null
    })
  })

  const land = (c: ColorKey, flower: ColorKey) => {
    if (locked || landed.includes(c)) return
    setSel(null)
    if (c !== flower) {
      ctl.wrong(flyEls.current.get(c))
      return
    }
    const now = [...landed, c]
    setLanded(now)
    if (now.length === r.flies.length) ctl.correct(flowerEls.current.get(flower), d.games.say.butterfliesDone)
    else {
      ctl.say(d.colors[c])
      ctl.step(flowerEls.current.get(flower))
    }
  }
  const { drag, bind } = useDrag<ColorKey>({
    disabled: locked,
    onTap: (c) => {
      audio.sfx('tap')
      setSel((cur) => (cur === c ? null : c))
      ctl.say(d.colors[c])
    },
    onDrop: (c, t) => t.startsWith('flower-') && land(c, t.slice(7) as ColorKey),
  })

  return (
    <>
      <div className={s.butterflies}>
        {r.flies
          .filter((c) => !landed.includes(c))
          .map((c, i) => {
            const b = bind(c)
            return (
              <button
                key={c}
                ref={(el) => {
                  if (el) flyEls.current.set(c, el)
                }}
                type="button"
                className={cx(s.butterfly, sel === c && s.selected, drag?.payload === c && s.lifted)}
                aria-label={d.colors[c]}
                aria-pressed={sel === c}
                {...b}
                style={{ ...b.style, animationDelay: `${i * 0.4}s` }}
              >
                <Butterfly color={COLOR_HEX[c]} />
              </button>
            )
          })}
      </div>
      <div className={s.flowers}>
        {r.flowers.map((c) => (
          <button
            key={c}
            ref={(el) => {
              if (el) flowerEls.current.set(c, el)
            }}
            type="button"
            data-drop={landed.includes(c) ? undefined : `flower-${c}`}
            className={cx(s.flower, drag?.over === `flower-${c}` && s.over, sel && !landed.includes(c) && s.ready)}
            aria-label={d.colors[c]}
            onClick={() => sel && land(sel, c)}
          >
            <Flower color={COLOR_HEX[c]} />
            {landed.includes(c) && (
              <span className={s.perch}>
                <Butterfly color={COLOR_HEX[c]} />
              </span>
            )}
          </button>
        ))}
      </div>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <span className={s.butterfly}>
            <Butterfly color={COLOR_HEX[drag.payload]} />
          </span>
        </Ghost>
      )}
    </>
  )
}

/** Shape Builder — fill the dotted outline of a picture with the matching shapes. */
export function ShapesRound({ d, stage, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const id = pickOne(PUZZLES_BY_STAGE[stage], rng)
    const slots = PUZZLES[id]
    const pieces = slots.map((sl, i) => ({ key: `p${i}`, shape: sl.shape, fill: sl.fill }))
    if (stage >= 2) {
      const used = new Set(slots.map((x) => x.shape))
      pieces.push({ key: 'extra', shape: pickOne(BUILD_SHAPES.filter((x) => !used.has(x)), rng), fill: COLOR_HEX[pickOne(GAME_COLORS, rng)] })
    }
    return { id, slots, pieces: shuffle(pieces, rng) }
  })
  const [filled, setFilled] = useState<number[]>([])
  const [used, setUsed] = useState<string[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const board = useRef<HTMLDivElement>(null)
  const slotEls = useRef(new Map<number, HTMLButtonElement>())
  const pieceEls = useRef(new Map<string, HTMLButtonElement>())
  const now = useLatest({ filled, used })

  useMount(() => {
    ctl.prompt(d.games.say.shapes)
    ctl.hint(() => {
      const slot = r.slots.findIndex((_, i) => !now.current.filled.includes(i))
      const want = r.slots[slot]?.shape
      const piece = r.pieces.find((p) => p.shape === want && !now.current.used.includes(p.key))
      return piece ? pieceEls.current.get(piece.key) : null
    })
  })

  const put = (pieceKey: string, slotIdx: number) => {
    const piece = r.pieces.find((p) => p.key === pieceKey)
    const slot = r.slots[slotIdx]
    if (locked || !piece || !slot || used.includes(pieceKey)) return
    setSel(null)
    if (filled.includes(slotIdx) || piece.shape !== slot.shape) {
      ctl.wrong(pieceEls.current.get(pieceKey))
      return
    }
    const nowFilled = [...filled, slotIdx]
    setFilled(nowFilled)
    setUsed([...used, pieceKey])
    if (nowFilled.length === r.slots.length) {
      setComplete(true)
      ctl.correct(board.current, fmt(d.games.say.shapesDone, { thing: d.games.things[r.id] }))
    } else {
      ctl.say(d.shapes[piece.shape])
      ctl.step(slotEls.current.get(slotIdx))
    }
  }
  const { drag, bind } = useDrag<string>({
    disabled: locked,
    onTap: (key) => {
      const piece = r.pieces.find((p) => p.key === key)
      audio.sfx('tap')
      setSel((cur) => (cur === key ? null : key))
      if (piece) ctl.say(d.shapes[piece.shape])
    },
    onDrop: (key, t) => t.startsWith('slot-') && put(key, Number(t.slice(5))),
  })
  const ghost = drag ? r.pieces.find((p) => p.key === drag.payload) : undefined

  return (
    <div className={s.build}>
      <div ref={board} className={cx(s.board, complete && s.boardDone)}>
        {r.slots.map((sl, i) => {
          const done = filled.includes(i)
          return (
            <button
              key={i}
              ref={(el) => {
                if (el) slotEls.current.set(i, el)
              }}
              type="button"
              data-drop={done ? undefined : `slot-${i}`}
              className={cx(s.slot, done && s.slotFilled, drag?.over === `slot-${i}` && s.over, sel && !done && s.ready)}
              style={{ left: `${sl.x}%`, top: `${sl.y}%`, width: `${sl.w}%`, height: `${sl.h}%`, transform: sl.rot ? `rotate(${sl.rot}deg)` : undefined }}
              aria-label={d.shapes[sl.shape]}
              onClick={() => sel && put(sel, i)}
            >
              <ShapeFill shape={sl.shape} fill={done ? sl.fill : 'rgba(255,255,255,.6)'} dashed={!done} />
            </button>
          )
        })}
      </div>
      <div className={s.tray}>
        {r.pieces
          .filter((p) => !used.includes(p.key))
          .map((p) => {
            const b = bind(p.key)
            return (
              <button
                key={p.key}
                ref={(el) => {
                  if (el) pieceEls.current.set(p.key, el)
                }}
                type="button"
                className={cx(s.piece, p.shape === 'rectangle' && s.pieceWide, sel === p.key && s.selected, drag?.payload === p.key && s.lifted)}
                aria-label={d.shapes[p.shape]}
                aria-pressed={sel === p.key}
                {...b}
              >
                <ShapeFill shape={p.shape} fill={p.fill} stretch={p.shape === 'rectangle'} />
              </button>
            )
          })}
      </div>
      {ghost && drag && (
        <Ghost x={drag.x} y={drag.y}>
          <span className={cx(s.piece, ghost.shape === 'rectangle' && s.pieceWide)}>
            <ShapeFill shape={ghost.shape} fill={ghost.fill} stretch={ghost.shape === 'rectangle'} />
          </span>
        </Ghost>
      )}
    </div>
  )
}

/** What Comes Next? — finish the pattern (AB, AAB, ABC…). */
export function NextRound({ d, stage, choices, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const set = pickOne(PATTERN_SETS, rng)
    const kind = pickOne(PATTERN_KINDS[stage], rng)
    const distinct = new Set(kind).size
    const syms = shuffle(set, rng).slice(0, distinct)
    const unit = kind.split('').map((ch) => syms[ch.charCodeAt(0) - 65] ?? set[0] ?? '')
    const k = Math.floor(rng() * unit.length)
    const answer = unit[k] ?? ''
    const n = Math.max(distinct, choices)
    const distract = [...shuffle(syms.filter((x) => x !== answer), rng), ...shuffle(set.filter((x) => !syms.includes(x)), rng)].slice(0, n - 1)
    return { shown: [...unit, ...unit, ...unit.slice(0, k)], answer, opts: shuffle([answer, ...distract], rng) }
  })
  const [solved, setSolved] = useState(false)
  const q = useRef<HTMLDivElement>(null)
  const opts = useRef(new Map<string, HTMLButtonElement>())

  useMount(() => {
    ctl.prompt(d.games.say.next)
    ctl.hint(() => opts.current.get(r.answer))
  })

  return (
    <>
      <div className={s.seq}>
        {r.shown.map((hex, i) => (
          <div key={i} className={s.tile} style={{ animationDelay: `${i * 0.12}s` }}>
            <OpenMoji hex={hex} alt="" size={52} />
          </div>
        ))}
        <div ref={q} className={cx(s.tile, s.tileQ, solved && s.tileSolved)} style={{ animationDelay: `${r.shown.length * 0.12}s` }}>
          {solved ? <OpenMoji hex={r.answer} alt="" size={52} /> : '?'}
        </div>
      </div>
      <div className={s.choices}>
        {r.opts.map((hex, i) => (
          <button
            key={hex}
            ref={(el) => {
              if (el) opts.current.set(hex, el)
            }}
            type="button"
            className={cx(s.choice, solved && hex === r.answer && s.right)}
            data-testid={hex === r.answer ? 'game-answer' : 'game-other'}
            aria-label={String(i + 1)}
            onClick={() => {
              if (locked) return
              if (hex === r.answer) {
                setSolved(true)
                ctl.correct(q.current)
              } else ctl.wrong(opts.current.get(hex))
            }}
          >
            <OpenMoji hex={hex} alt="" size={68} />
          </button>
        ))}
      </div>
    </>
  )
}

type OddItem = { key: string; odd: boolean } & ({ hex: string } | { shape: ShapeKey; color: ColorKey })
type OddKind = 'color' | 'shape' | 'category'
const ODD_KINDS: Record<1 | 2 | 3, readonly OddKind[]> = { 1: ['color'], 2: ['color', 'shape'], 3: ['shape', 'category', 'category'] }

/** Odd One Out — tap the one that doesn't belong (colour, then shape, then kind of thing). */
export function OddRound({ d, stage, choices, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const n = Math.max(3, choices)
    const kind = pickOne(ODD_KINDS[stage], rng)
    let items: OddItem[]
    let line: string
    if (kind === 'color') {
      const shape = pickOne(ODD_SHAPES, rng)
      const [c1, c2] = shuffle(GAME_COLORS, rng) as [ColorKey, ColorKey]
      items = [...Array.from({ length: n - 1 }, (_, i) => ({ key: `a${i}`, odd: false, shape, color: c1 })), { key: 'odd', odd: true, shape, color: c2 }]
      line = fmt(d.games.say.oddColor, { color: d.colors[c2] })
    } else if (kind === 'shape') {
      const color = pickOne(GAME_COLORS, rng)
      const [s1, s2] = shuffle(ODD_SHAPES, rng) as [ShapeKey, ShapeKey]
      items = [...Array.from({ length: n - 1 }, (_, i) => ({ key: `a${i}`, odd: false, shape: s1, color })), { key: 'odd', odd: true, shape: s2, color }]
      line = fmt(d.games.say.oddShape, { shape: d.shapes[s2] })
    } else {
      const [a, b] = shuffle(CATEGORY_IDS, rng) as [CategoryId, CategoryId]
      items = [...shuffle(CATEGORIES[a], rng).slice(0, n - 1).map((hex, i) => ({ key: `a${i}`, odd: false, hex })), { key: 'odd', odd: true, hex: pickOne(CATEGORIES[b], rng) }]
      line = fmt(d.games.say.oddCategory, { odd: d.games.categories[b], rest: d.games.categories[a] })
    }
    return { items: shuffle(items, rng), line }
  })
  const [found, setFound] = useState(false)
  const els = useRef(new Map<string, HTMLButtonElement>())

  useMount(() => {
    ctl.prompt(d.games.say.odd)
    ctl.hint(() => els.current.get('odd'))
  })

  return (
    <div className={cx(s.oddGrid, r.items.length === 3 && s.oddThree)} style={{ '--n': r.items.length } as CSSProperties}>
      {r.items.map((it, i) => (
        <button
          key={it.key}
          ref={(el) => {
            if (el) els.current.set(it.key, el)
          }}
          type="button"
          className={cx(s.choice, s.oddChoice, found && it.odd && s.right)}
          data-testid={it.odd ? 'game-answer' : 'game-other'}
          aria-label={'hex' in it ? String(i + 1) : `${d.shapes[it.shape]} ${d.colors[it.color]}`}
          onClick={() => {
            if (locked) return
            if (it.odd) {
              setFound(true)
              ctl.correct(els.current.get(it.key), r.line)
            } else ctl.wrong(els.current.get(it.key))
          }}
        >
          {'hex' in it ? <OpenMoji hex={it.hex} alt="" size={84} /> : <ShapeSvg shape={it.shape} color={COLOR_HEX[it.color]} size={90} />}
        </button>
      ))}
    </div>
  )
}
