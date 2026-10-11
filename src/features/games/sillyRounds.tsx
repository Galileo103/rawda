import { type CSSProperties, type RefObject, useEffect, useRef, useState } from 'react'
import {
  LOOKALIKE,
  monsterWant,
  monsterWantTwo,
  monsterNoThanks,
  monsterYum,
  sillyClaimCount,
  sillyClaimLetter,
  sillyClaimWord,
  sillyRevealCount,
  sillyRevealLetter,
  sillyRevealWord,
  sillyShowLetter,
  sillyShowWord,
  sillyWordOk,
} from '../../content/funGames'
import { JUDGE_HEX, type Letter, type LearnedPools, type SillyKind, monsterLetters, numberName, sillyKinds } from '../../content/games'
import { content } from '../../content/loader'
import type { LexEntry } from '../../content/schemas'
import { OpenMoji } from '../../design/Visual'
import { type Rng, pickOne, shuffle } from '../../domain/rng'
import type { Lang } from '../../domain/types'
import { type Dict, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { useDrag } from '../activities/templates/useDrag'
import { Ghost } from './drawings'
import { type RoundProps, cx, flash, useMount } from './engine'
import s from './games.module.css'

// ---------- Silly Hala ----------

/** Fruit to count when Hala miscounts. */
const COUNT_HEX = ['1F34E', '1F34C', '1F353', '1F34A', '1F955']

type Shown = { kind: 'pictures'; e: LexEntry } | { kind: 'letters'; l: Letter } | { kind: 'counting'; n: number; hex: string }

interface SillyPlan {
  /** About one round in four Hala is actually right, so the child has to really look. */
  truth: boolean
  shown: Shown
  claim: string
  /** "Oops! Show me…" once the child says she is wrong. */
  show: string
  /** Said with the praise when the child shows her the right one. */
  reveal: string
  options: { key: string; hex?: string; text?: string; label: string }[]
  answer: string
  skill?: string
}

function planSilly(kind: SillyKind, p: LearnedPools, lang: Lang, d: Dict, choices: number, maxN: number, rng: Rng): SillyPlan {
  const truth = rng() < 0.25
  const n = Math.max(2, Math.min(3, choices))
  if (kind === 'pictures') {
    const words = shuffle(
      p.words.map((w) => content.lexicon.get(w)).filter(sillyWordOk),
      rng,
    )
    const [a, b, c] = words as [LexEntry, LexEntry, LexEntry | undefined]
    const claim = truth ? a : b
    const opts = shuffle([a, b, ...(c ? [c] : [])].slice(0, n), rng)
    return {
      truth,
      shown: { kind, e: a },
      claim: sillyClaimWord(claim, lang, d),
      show: sillyShowWord(claim, lang, d),
      reveal: sillyRevealWord(a, lang, d),
      options: opts.map((e) => ({ key: e.id, hex: e.image, label: e[lang] })),
      answer: claim.id,
    }
  }
  if (kind === 'letters') {
    const pool = p.letters
    const a = pickOne(pool, rng)
    const looks = pool.filter((l) => (LOOKALIKE[lang][a.glyph] ?? '').includes(l.glyph))
    const c = truth ? a : looks.length ? pickOne(looks, rng) : pickOne(pool.filter((l) => l !== a), rng)
    const third = pool.filter((l) => l !== a && l !== c)
    const opts = shuffle([a, ...(c !== a ? [c] : []), ...(third.length && n > 2 ? [pickOne(third, rng)] : [])], rng)
    return {
      truth,
      shown: { kind, l: a },
      claim: sillyClaimLetter(c, d),
      show: sillyShowLetter(c, d),
      reveal: sillyRevealLetter(a, d),
      options: opts.map((l) => ({ key: l.glyph, text: l.glyph, label: l.name })),
      answer: c.glyph,
      skill: `${lang}.letter.${c.id}`,
    }
  }
  const nums = p.numbers.filter((x) => x >= 2 && x <= Math.min(maxN, 8))
  const count = pickOne(nums.length ? nums : p.numbers, rng)
  const near = [count - 2, count - 1, count + 1, count + 2].filter((x) => x >= 1 && x <= 9)
  const said = truth ? count : pickOne(near, rng)
  const other = pickOne(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== count && x !== said),
    rng,
  )
  const opts = shuffle([count, ...(said !== count ? [said] : []), ...(n > 2 ? [other] : [])], rng)
  return {
    truth,
    shown: { kind, n: count, hex: pickOne(COUNT_HEX, rng) },
    claim: sillyClaimCount(said, d),
    show: d.games.fun.sillyOopsCount,
    reveal: sillyRevealCount(count, d),
    options: opts.map((x) => ({ key: String(x), text: numeral(x, lang), label: numberName(x, d) })),
    answer: String(count),
    skill: `num.count.${count}`,
  }
}

/** Silly Hala — Hala names something wrong on purpose; the child says "Wrong!" and shows her the right one. */
export function SillyRound({ lang, d, stage, choices, maxN, locked, rng, ctl, learned }: RoundProps) {
  const [plan] = useState(() => {
    const kinds = sillyKinds(learned)
    const want = (['pictures', 'letters', 'counting'] as const)[stage - 1] ?? 'pictures'
    return planSilly(kinds.includes(want) ? want : pickOne(kinds, rng), learned, lang, d, choices, maxN, rng)
  })
  const [phase, setPhase] = useState<'judge' | 'fix'>('judge')
  const [counted, setCounted] = useState<number[]>([])
  const card = useRef<HTMLDivElement>(null)
  const opts = useRef(new Map<string, HTMLButtonElement>())
  const f = d.games.fun

  useMount(() => {
    ctl.prompt(plan.claim)
    // Hala wonders aloud while the child judges, so her face asks the question too.
    ctl.mood('think')
    ctl.hint(() => card.current)
    if (plan.skill) ctl.practise(plan.skill)
  })

  const judge = (saysRight: boolean) => {
    if (locked || phase !== 'judge') return
    if (saysRight !== plan.truth) return ctl.wrong(card.current, saysRight ? f.sillyLookAgain : f.sillyImRight)
    if (plan.truth) return ctl.correct(card.current, f.sillyRightYes)
    setPhase('fix')
    audio.sfx('gasp')
    ctl.prompt(plan.show)
    ctl.mood('oops')
    ctl.hint(() => opts.current.get(plan.answer))
  }
  const choose = (key: string) => {
    if (locked) return
    const el = opts.current.get(key)
    if (key === plan.answer) ctl.correct(el, plan.reveal)
    else ctl.wrong(el)
  }
  const count = (i: number) => {
    if (counted.includes(i)) return
    ctl.say(numberName(counted.length + 1, d))
    setCounted([...counted, i])
  }

  const shown = plan.shown
  return (
    <div className={s.sillyWrap}>
      <div ref={card} className={cx(s.sillyCard, shown.kind === 'counting' && s.sillyCountCard)} lang={lang}>
        {shown.kind === 'pictures' && <OpenMoji hex={shown.e.image} alt="" size={190} />}
        {shown.kind === 'letters' && <span className={s.sillyGlyph}>{shown.l.glyph}</span>}
        {shown.kind === 'counting' &&
          Array.from({ length: shown.n }, (_, i) => (
            <button key={i} type="button" className={s.countThing} onClick={() => count(i)} aria-label={numberName(i + 1, d)}>
              <OpenMoji hex={shown.hex} alt="" size={64} />
              {counted.includes(i) && <b>{numeral(counted.indexOf(i) + 1, lang)}</b>}
            </button>
          ))}
      </div>
      {phase === 'judge' ? (
        <div className={s.judge}>
          {/* One big thumb per button says it for a child who can't read; the word under it is for the grown-up. */}
          <button type="button" className={s.judgeYes} onClick={() => judge(true)} aria-label={f.right} data-testid={plan.truth ? 'game-answer' : undefined}>
            <span className={s.judgePic}>
              <OpenMoji hex={JUDGE_HEX.yes} alt="" size={96} />
            </span>
            <span className={s.judgeWord}>{f.right}</span>
          </button>
          <button type="button" className={s.judgeNo} onClick={() => judge(false)} aria-label={f.wrong} data-testid={plan.truth ? undefined : 'game-answer'}>
            <span className={s.judgePic}>
              <OpenMoji hex={JUDGE_HEX.no} alt="" size={96} />
            </span>
            <span className={s.judgeWord}>{f.wrong}</span>
          </button>
        </div>
      ) : (
        <div className={s.sillyOptions}>
          {plan.options.map((o) => (
            <button
              key={o.key}
              ref={(el) => {
                if (el) opts.current.set(o.key, el)
              }}
              type="button"
              lang={lang}
              className={s.sillyOption}
              aria-label={o.label}
              data-testid={o.key === plan.answer ? 'game-answer' : undefined}
              onClick={() => choose(o.key)}
            >
              {o.hex ? <OpenMoji hex={o.hex} alt="" size={84} /> : <span>{o.text}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- Hungry Monster ----------

/** A friendly, round monster with two mismatched googly eyes that follow the finger. */
function Monster({ open, belly, eyes }: { open: boolean; belly: number; eyes: RefObject<SVGSVGElement | null> }) {
  return (
    <svg ref={eyes} className={cx(s.monster, open && s.monsterOpen)} viewBox="0 0 220 220" aria-hidden="true" style={{ '--belly': belly } as CSSProperties}>
      <g className={s.monsterBody}>
        <path d="M62 54 48 14l34 30z" fill="#2f8a42" />
        <path d="M158 54l14-40-34 30z" fill="#2f8a42" />
        <path d="M28 150C18 84 58 34 110 34s92 50 82 116c-6 46-158 46-164 0z" fill="#5cc46a" />
        <circle cx="52" cy="120" r="7" fill="#49ad58" />
        <circle cx="172" cy="112" r="9" fill="#49ad58" />
        <circle cx="160" cy="160" r="6" fill="#49ad58" />
        <ellipse cx="110" cy="176" rx="44" ry="18" fill="#8fdc96" />
        <circle cx="78" cy="84" r="24" fill="#fff" stroke="#24502c" strokeWidth="3" />
        <circle data-pupil="78,84,11" cx="78" cy="84" r="10" fill="#1b1b1b" />
        <circle cx="142" cy="78" r="30" fill="#fff" stroke="#24502c" strokeWidth="3" />
        <circle data-pupil="142,78,13" cx="142" cy="78" r="12" fill="#1b1b1b" />
        <ellipse className={s.monsterMouth} cx="110" cy="132" rx="46" ry="11" fill="#7a1f3d" />
        <rect x="94" y="126" width="9" height="8" rx="2" fill="#fff" />
        <rect x="117" y="126" width="9" height="8" rx="2" fill="#fff" />
      </g>
    </svg>
  )
}

interface Dish {
  e: LexEntry
  l: Letter
  good: boolean
}

/** Hungry Monster — feed it things that start with the letter it asks for; a wrong one it politely hands back. */
export function MonsterRound({ lang, d, stage, choices, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    const letters = monsterLetters(learned)
    const target = pickOne(letters, rng)
    const wordsOf = (l: Letter) => (learned.letterWords.get(l.id) ?? []).map((id) => content.lexicon.get(id)).filter((e): e is LexEntry => !!e)
    const mine = wordsOf(target)
    const two = stage === 3 && mine.length >= 2
    const goods = shuffle(mine, rng).slice(0, two ? 2 : 1)
    const others = letters.filter((l) => l !== target).flatMap((l) => wordsOf(l).map((e) => ({ e, l })))
    const bads = shuffle(others, rng).slice(0, stage === 1 ? 1 : Math.max(1, Math.min(2, choices - 1)))
    const dishes: Dish[] = shuffle([...goods.map((e) => ({ e, l: target, good: true })), ...bads.map((b) => ({ ...b, good: false }))], rng)
    return { target, two, dishes, need: goods.length }
  })
  const [eaten, setEaten] = useState<string[]>([])
  const svg = useRef<SVGSVGElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const plates = useRef(new Map<string, HTMLButtonElement>())
  const f = d.games.fun

  useMount(() => {
    ctl.prompt(r.two ? monsterWantTwo(r.target, d) : monsterWant(r.target, d))
    ctl.hint(() => plates.current.get(r.dishes.find((x) => x.good && !eaten.includes(x.e.id))?.e.id ?? ''))
    ctl.practise(`${lang}.sound.${r.target.id}`)
  })

  // The googly eyes follow the finger.
  useEffect(() => {
    const look = (e: PointerEvent) => {
      const el = svg.current
      if (!el) return
      const box = el.getBoundingClientRect()
      const k = box.width / 220
      for (const p of el.querySelectorAll<SVGCircleElement>('[data-pupil]')) {
        const [cx0, cy0, reach] = (p.dataset.pupil ?? '').split(',').map(Number) as [number, number, number]
        const dx = e.clientX - (box.left + cx0 * k)
        const dy = e.clientY - (box.top + cy0 * k)
        const dist = Math.hypot(dx, dy) || 1
        const m = Math.min(1, dist / 220) * reach
        p.setAttribute('cx', String(cx0 + (dx / dist) * m))
        p.setAttribute('cy', String(cy0 + (dy / dist) * m))
      }
    }
    window.addEventListener('pointermove', look)
    return () => window.removeEventListener('pointermove', look)
  }, [])

  const feed = (id: string) => {
    if (locked || eaten.includes(id)) return
    const dish = r.dishes.find((x) => x.e.id === id)
    const plate = plates.current.get(id)
    if (!dish) return
    if (!dish.good) {
      audio.sfx('nope')
      flash(plate, s.giveBack, 700)
      return ctl.wrong(plate, monsterNoThanks(dish.e, dish.l, lang, d))
    }
    // Into the mouth, then munch; the tummy grows a little.
    const mouth = svg.current?.querySelector(`.${s.monsterMouth}`)
    if (plate && mouth && typeof plate.animate === 'function') {
      const a = plate.getBoundingClientRect()
      const b = mouth.getBoundingClientRect()
      plate.animate([{ transform: 'none' }, { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.2)`, opacity: 0.2 }], {
        duration: 420,
        easing: 'ease-in',
        fill: 'forwards',
      })
    }
    audio.sfx('munch')
    const now = [...eaten, id]
    setEaten(now)
    const yum = monsterYum(dish.e, r.target, lang, d)
    if (now.length < r.need) {
      ctl.step(wrap.current)
      void audio.speakAll([
        { text: yum, lang },
        { text: f.monsterMore, lang },
      ])
    } else ctl.correct(wrap.current, yum)
  }
  const { drag, bind } = useDrag<string>({ disabled: locked, onTap: feed, onDrop: (id, target) => target === 'monster' && feed(id) })
  const draggedDish = drag && r.dishes.find((x) => x.e.id === drag.payload)
  const nextGood = r.dishes.find((x) => x.good && !eaten.includes(x.e.id))?.e.id

  return (
    <div className={s.monsterField}>
      <div ref={wrap} className={cx(s.monsterWrap, drag?.over === 'monster' && s.over)} data-drop="monster">
        <Monster open={drag?.over === 'monster'} belly={eaten.length} eyes={svg} />
        <span className={s.monsterSign} lang={lang}>
          {r.target.glyph}
        </span>
      </div>
      <div className={s.plate}>
        {r.dishes.map((x) => {
          const b = bind(x.e.id)
          return (
            <button
              key={x.e.id}
              ref={(el) => {
                if (el) plates.current.set(x.e.id, el)
              }}
              type="button"
              className={cx(s.dish, eaten.includes(x.e.id) && s.gone, drag?.payload === x.e.id && s.lifted)}
              aria-label={x.e[lang]}
              data-testid={x.e.id === nextGood ? 'game-answer' : undefined}
              {...b}
            >
              <OpenMoji hex={x.e.image} alt="" size={78} />
            </button>
          )
        })}
      </div>
      {draggedDish && (
        <Ghost x={drag.x} y={drag.y}>
          <OpenMoji hex={draggedDish.e.image} alt="" size={78} />
        </Ghost>
      )}
    </div>
  )
}
