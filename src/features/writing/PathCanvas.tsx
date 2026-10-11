import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import type { Lang } from '../../domain/types'
import { Icon } from '../../design/Icon'
import { dict } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { type Pt, type Stroke, distToStroke, followMove, strokeProgress } from './paths'
import s from './writing.module.css'

export const BOARD = 600
/** The light track every stroke sits in (and the "magic walls" for the ink). */
const TRACK = 92
const INK = 62
/** How close the finger must stay to the stroke to move along it. */
const TOL = 50
/** How far ahead (in stroke points, 4 px each) one finger movement can carry the progress. */
const LOOKAHEAD = 12
/** How close to the green dot (or to where the child stopped) a stroke must start. */
const START_TOL = 60
const DOT_TOL = 66
const DOT_R = 32
const IDLE_MS = 6000
const PEN_SPEED = 0.42 // board px per ms

/**
 * How much help the board gives (fade-away practice):
 * 1 — the whole stroke dotted, a moving arrow, magic walls;
 * 2 — only a few dots, the arrow, magic walls;
 * 3 — a faint ghost of the letter and the green start dots: she writes it herself
 *     (checked loosely: in order, roughly along the shape).
 */
export type HelpLevel = 1 | 2 | 3
const LEVEL = {
  1: { every: 7, arrow: true, walls: true, track: '#efe8fb', tol: 1, look: LOOKAHEAD, start: START_TOL, done: 0.97 },
  2: { every: 20, arrow: true, walls: true, track: '#f4effc', tol: 1.15, look: LOOKAHEAD, start: START_TOL, done: 0.96 },
  3: { every: 0, arrow: false, walls: false, track: '#f7f4fc', tol: 1.6, look: 18, start: 80, done: 0.92 },
} as const

type Phase = 'demo' | 'play' | 'won'

/** Track width for a stroke: thick, but a small mark (hamza, the little ء in ك) keeps its shape. */
const trackOf = (st: Stroke) => Math.min(TRACK, Math.max(48, st.span * 0.42))

/**
 * Write a letter along its strokes. Hala's pen can show how it's written first; then the child
 * follows each stroke in order, from its green numbered dot, in the direction of the moving
 * arrow. Only forward movement counts. Dots are tapped. When every stroke is done the letter
 * shines gold and `onWon` gets the number of misses (touches in the wrong place).
 * `say` shows and speaks Hala's line (the screen around the board owns the speech bubble).
 */
export function PathCanvas({
  strokes,
  label,
  lang,
  level = 1,
  demo = true,
  say,
  onWon,
  compact,
}: {
  strokes: Stroke[]
  label: string
  lang: Lang
  level?: HelpLevel
  demo?: boolean
  say: (text: string) => void
  onWon: (misses: number) => void
  compact?: boolean
}) {
  const w = dict(lang).writing.say
  const ui = dict(lang).writing
  const lv = LEVEL[level]

  const guideRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const demoRef = useRef<HTMLCanvasElement>(null)
  const mask = useRef<HTMLCanvasElement | null>(null)
  const reached = useRef(0)
  const active = useRef(false)
  const last = useRef<Pt | null>(null)
  const bumped = useRef(false)
  const misses = useRef(0)
  const lastActive = useRef(Date.now())
  const said = useRef({ arrow: false, dot: false })

  const [phase, setPhase] = useState<Phase>(demo ? 'demo' : 'play')
  const [idx, setIdx] = useState(0)
  const [pen, setPen] = useState<Pt | null>(null)
  const [nudge, setNudge] = useState(0)
  /** Where the green dot sits: the stroke's start, or where the child lifted the finger. */
  const [resume, setResume] = useState(0)

  // The magic walls: every stroke's track (and each dot), as a mask for the ink.
  useEffect(() => {
    const off = document.createElement('canvas')
    off.width = BOARD
    off.height = BOARD
    const m = off.getContext('2d')
    if (!m || typeof Path2D === 'undefined') return
    m.lineCap = 'round'
    m.lineJoin = 'round'
    for (const st of strokes) {
      const a = st.pts[0]
      if (st.dot && a) {
        m.beginPath()
        m.arc(a.x, a.y, DOT_R + 12, 0, Math.PI * 2)
        m.fill()
      } else {
        m.lineWidth = trackOf(st) + 10
        m.stroke(new Path2D(st.d))
      }
    }
    mask.current = off
  }, [strokes])

  // The guide: tracks, finished strokes, the current one dotted, the rest faint; gold when won.
  useEffect(() => {
    const g = guideRef.current?.getContext('2d')
    if (!g || typeof Path2D === 'undefined') return
    g.clearRect(0, 0, BOARD, BOARD)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    strokes.forEach((st, i) => {
      const a = st.pts[0] as Pt
      const done = i < idx || phase === 'won'
      // On her own (level 3), what she has written is her ink alone: no tidy guide under it.
      const color = phase === 'won' ? '#ffc83d' : done && level < 3 ? '#c4b0f0' : lv.track
      if (st.dot) {
        g.fillStyle = color
        g.beginPath()
        g.arc(a.x, a.y, DOT_R, 0, Math.PI * 2)
        g.fill()
      } else {
        g.strokeStyle = color
        g.lineWidth = done && level < 3 ? trackOf(st) * 0.7 : trackOf(st)
        g.stroke(new Path2D(st.d))
      }
      if (done || !lv.every) return
      // Dotted line: bold for the stroke to write now, faint for the ones after it.
      const now = i === idx && phase === 'play'
      g.fillStyle = now ? '#7a5cd6' : '#cbbcef'
      if (st.dot) {
        g.setLineDash([7, 7])
        g.strokeStyle = g.fillStyle
        g.lineWidth = 4
        g.beginPath()
        g.arc(a.x, a.y, DOT_R, 0, Math.PI * 2)
        g.stroke()
        g.setLineDash([])
      } else {
        const every = now ? lv.every : lv.every + 2
        for (let k = 0; k < st.pts.length; k += every) {
          const q = st.pts[k] as Pt
          g.beginPath()
          g.arc(q.x, q.y, now ? 8 : 6, 0, Math.PI * 2)
          g.fill()
        }
      }
    })
  }, [strokes, idx, phase, level, lv])

  // Hala's pen writes the letter (at the start, and again on "watch again").
  useEffect(() => {
    if (phase !== 'demo') return
    const c = demoRef.current?.getContext('2d')
    let raf = 0
    let cancelled = false
    const t0 = performance.now()
    // Timeline: each stroke takes its length / speed, dots 300 ms, with a short pause between.
    const plan: { st: Stroke; start: number; dur: number }[] = []
    let t = 400
    for (const st of strokes) {
      const dur = st.dot ? 300 : (st.pts.length * 4) / PEN_SPEED
      plan.push({ st, start: t, dur })
      t += dur + 350
    }
    const total = t
    const frame = (now: number) => {
      if (cancelled) return
      const el = now - t0
      if (c) {
        c.clearRect(0, 0, BOARD, BOARD)
        c.lineCap = 'round'
        c.lineJoin = 'round'
        c.strokeStyle = '#7a5cd6'
        c.fillStyle = '#7a5cd6'
        c.lineWidth = 40
      }
      let at: Pt | null = null
      for (const { st, start, dur } of plan) {
        if (el < start) break
        const f = Math.min(1, (el - start) / dur)
        if (st.dot) {
          const a = st.pts[0] as Pt
          c?.beginPath()
          c?.arc(a.x, a.y, 22 * f, 0, Math.PI * 2)
          c?.fill()
          at = a
        } else {
          const n = Math.max(1, Math.floor(f * (st.pts.length - 1)))
          c?.beginPath()
          st.pts.slice(0, n + 1).forEach((q, k) => (k ? c?.lineTo(q.x, q.y) : c?.moveTo(q.x, q.y)))
          c?.stroke()
          at = st.pts[n] ?? at
        }
      }
      setPen(at)
      if (el < total + 300) raf = requestAnimationFrame(frame)
      else {
        c?.clearRect(0, 0, BOARD, BOARD)
        setPen(null)
        setPhase('play')
        lastActive.current = Date.now()
        say(w.yourTurn)
      }
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // say/w are stable for this board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, strokes])

  // Idle: the green dot wiggles, and once Hala says "follow the arrow" (or "start here").
  useEffect(() => {
    if (phase !== 'play') return
    const id = setInterval(() => {
      if (active.current || Date.now() - lastActive.current < IDLE_MS) return
      lastActive.current = Date.now()
      setNudge((n) => n + 1)
      if (!said.current.arrow) {
        said.current.arrow = true
        say(strokes[idx]?.dot ? w.nowDot : lv.arrow ? w.followArrow : w.startGreen)
      }
    }, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, idx])

  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const r = inkRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * BOARD) / r.width, y: ((e.clientY - r.top) * BOARD) / r.height }
  }

  const ink = (from: Pt, to: Pt) => {
    const c = inkRef.current?.getContext('2d')
    const st = strokes[idx]
    if (!c) return
    c.strokeStyle = '#e8613a'
    c.lineWidth = st && !st.dot ? (INK * trackOf(st)) / TRACK : INK
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(from.x, from.y)
    c.lineTo(to.x + 0.1, to.y + 0.1)
    c.stroke()
    if (lv.walls && mask.current) {
      c.globalCompositeOperation = 'destination-in'
      c.drawImage(mask.current, 0, 0)
      c.globalCompositeOperation = 'source-over'
    }
  }

  /** Touched somewhere else: the green dot wiggles; Hala says where to start (not every time). */
  const missStart = () => {
    misses.current++
    audio.sfx('boing')
    setNudge((n) => n + 1)
    if (misses.current % 3 === 1) say(strokes[idx]?.dot ? w.nowDot : w.startGreen)
  }

  const finishStroke = () => {
    // With help, the ink completes the last bit of the stroke so it looks finished;
    // on her own (level 3) her letter stays exactly as she wrote it.
    const st = strokes[idx]
    if (st && !st.dot && level < 3) for (let i = Math.max(1, reached.current); i < st.pts.length; i++) ink(st.pts[i - 1] as Pt, st.pts[i] as Pt)
    active.current = false
    last.current = null
    reached.current = 0
    setResume(0)
    bumped.current = false
    const next = idx + 1
    if (next >= strokes.length) {
      setPhase('won')
      audio.sfx('sparkle')
      return onWon(misses.current)
    }
    audio.sfx('pop')
    setIdx(next)
    if (strokes[next]?.dot && !said.current.dot) {
      said.current.dot = true
      say(w.nowDot)
    }
  }

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'play') return
    lastActive.current = Date.now()
    const st = strokes[idx]
    if (!st) return
    const p = toCanvas(e)
    if (st.dot) {
      const a = st.pts[0] as Pt
      if (Math.hypot(p.x - a.x, p.y - a.y) <= DOT_TOL * (level === 3 ? 1.3 : 1)) {
        ink(a, a)
        finishStroke()
      } else missStart()
      return
    }
    // Start at the green dot — or, after lifting the finger, where the child stopped.
    const from = st.pts[reached.current] as Pt
    if (Math.hypot(p.x - from.x, p.y - from.y) > lv.start) return missStart()
    e.currentTarget.setPointerCapture(e.pointerId)
    active.current = true
    last.current = p
    ink(p, p)
  }

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!active.current) return
    lastActive.current = Date.now()
    const st = strokes[idx]
    if (!st) return
    const tol = Math.max(34, (TOL * trackOf(st)) / TRACK) * lv.tol
    for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) {
      const p = toCanvas(ev)
      reached.current = followMove(st, reached.current, last.current ?? p, p, tol, lv.look)
      // Wandered off the path: one soft bump per stroke.
      if (!bumped.current && distToStroke(st, p) > tol * 1.6) {
        bumped.current = true
        audio.sfx('boing')
      }
      if (last.current) ink(last.current, p)
      last.current = p
      if (strokeProgress(st, reached.current) >= lv.done) return finishStroke()
    }
  }

  const onUp = () => {
    active.current = false
    last.current = null
    setResume(reached.current)
  }

  const watchAgain = () => {
    audio.sfx('tap')
    active.current = false
    say(w.watch)
    setPhase('demo')
  }

  const current = phase === 'play' ? strokes[idx] : undefined
  const start = current ? (current.dot ? current.pts[0] : current.pts[resume]) : undefined

  return (
    <div className={[s.box, compact ? s.boxCompact : '', phase === 'won' ? s.boxWin : ''].join(' ')}>
      <canvas ref={guideRef} width={BOARD} height={BOARD} className={[s.layer, phase === 'won' ? s.guideWon : ''].join(' ')} aria-hidden="true" />
      <canvas ref={inkRef} width={BOARD} height={BOARD} className={s.layer} aria-hidden="true" />
      <canvas ref={demoRef} width={BOARD} height={BOARD} className={s.layer} aria-hidden="true" />
      {/* The touch surface sits on top. */}
      <canvas
        width={BOARD}
        height={BOARD}
        className={s.layer}
        style={{ touchAction: 'none' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label={label}
        data-testid="path-canvas"
        data-stroke={idx}
        data-phase={phase}
        data-level={level}
      />
      <svg className={[s.layer, s.overlay].join(' ')} viewBox={`0 0 ${BOARD} ${BOARD}`} aria-hidden="true">
        {lv.arrow && current && !current.dot && current.pts.length - resume > 2 && (
          // The arrow runs along the part still to write (key: restart it when that changes).
          <path key={resume} d="M-20 -17 L17 0 L-20 17 Z" className={s.arrow}>
            <animateMotion
              dur={`${Math.max(1, ((current.pts.length - resume) * 4) / 260)}s`}
              repeatCount="indefinite"
              rotate="auto"
              path={`M${current.pts
                .slice(resume)
                .filter((_, i, a) => i % 3 === 0 || i === a.length - 1)
                .map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`)
                .join(' L')}`}
            />
          </path>
        )}
        {start && (
          <g key={`${idx}-${nudge}`} className={s.startDot} style={{ transformOrigin: `${start.x}px ${start.y}px` }} data-testid="path-start">
            <circle cx={start.x} cy={start.y} r={current?.dot ? DOT_R + 8 : 34} />
            <text x={start.x} y={start.y} textAnchor="middle" dominantBaseline="central">
              {idx + 1}
            </text>
          </g>
        )}
        {pen && (
          <g transform={`translate(${pen.x} ${pen.y})`} className={s.pen}>
            <circle r={14} />
            <path d="M-6 -46 L6 -46 L6 -12 L0 -2 L-6 -12 Z" />
          </g>
        )}
      </svg>
      {phase === 'play' && (
        <button type="button" className={s.replay} onClick={watchAgain} aria-label={ui.watchAgain} data-testid="write-watch">
          <Icon name="play" size={26} />
        </button>
      )}
      {phase === 'won' && (
        <div className={s.winStars} aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <Icon key={i} name="star" size={44} style={{ '--a': `${i * 45}deg`, animationDelay: `${(i % 4) * 0.12}s` } as CSSProperties} />
          ))}
        </div>
      )}
    </div>
  )
}
