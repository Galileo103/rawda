import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import type { TraceItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { IconButton } from '../../../design/ui'
import { useOptionalApp } from '../../../app/AppState'
import { ageProfile } from '../../../domain/ageProfile'
import { audio } from '../../../services/audio/AudioService'
import { coverPoints, maskPoints, pointParts, traceThreshold, weakestPart } from '../../studio/canvasTools'
import s from '../activities.module.css'
import { STROKE_BOX, STROKES, strokeStart } from './strokes'
import type { TemplateProps } from './types'

const SIZE = STROKE_BOX
const BRUSH = 38
const REACH = 30
const STROKE_WIDTH = 54
/** How long the finished letter shines before the activity moves on. */
const CELEBRATE_MS = 1800

/**
 * Trace with a finger: a letter/numeral, or a pre-writing stroke (line, circle, zigzag…)
 * that starts at a green dot. Success = most of the shape covered, every part of it touched
 * (the dot of ب too), checked when the finger lifts so it never ends mid-stroke. Then the
 * letter turns gold and shines for a moment so the child sees what they made. A big ✓
 * appears once the child is well along (or after hints) as a motor-friendly alternative.
 */
export function TraceTemplate({ item, lang, hintLevel, locked, onCorrect }: TemplateProps<TraceItem>) {
  const guideRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const points = useRef<Float32Array>(new Float32Array())
  const covered = useRef<Uint8Array>(new Uint8Array())
  const parts = useRef<{ part: Int32Array; count: number }>({ part: new Int32Array(), count: 0 })
  const last = useRef<{ x: number; y: number } | null>(null)
  const done = useRef(false)
  const [progress, setProgress] = useState(0)
  const [started, setStarted] = useState(false)
  const [partsDone, setPartsDone] = useState(false)
  const [won, setWon] = useState(false)
  const winTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [ready, setReady] = useState<'loading' | 'canvas' | 'fallback'>('loading')
  const age = useOptionalApp()?.age ?? ageProfile(undefined)
  /** Coverage needed: generous, easier with hints and for younger children. */
  const needed = Math.max(0.5, traceThreshold(hintLevel) - age.traceBonus)
  /** Each separate part (a dot, a second stroke) must be at least this much traced. */
  const partNeeded = hintLevel >= 2 ? 0.35 : 0.5
  const glyph = item.glyph ?? ''
  const stroke = item.stroke ? STROKES[item.stroke] : undefined
  const rtl = lang === 'ar'
  const start = stroke ? strokeStart(stroke, rtl) : undefined

  // Draw the guide (after fonts load) and sample it into points to cover.
  useEffect(() => {
    let cancelled = false
    const draw = async () => {
      try {
        await document.fonts?.ready
      } catch {
        /* ignore */
      }
      const g = guideRef.current?.getContext('2d', { willReadFrequently: true })
      if (cancelled) return
      if (!g) return setReady('fallback')
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.clearRect(0, 0, SIZE, SIZE)
      // Clearly visible on white for a small child; stronger once Hala starts helping.
      const fill = hintLevel >= 1 ? '#b39ae8' : '#d6c8f2'
      if (stroke) {
        if (typeof Path2D === 'undefined') return setReady('fallback')
        if (rtl && stroke.directional) g.setTransform(-1, 0, 0, 1, SIZE, 0)
        g.strokeStyle = fill
        g.lineWidth = STROKE_WIDTH
        g.lineCap = 'round'
        g.lineJoin = 'round'
        g.stroke(new Path2D(stroke.d))
        g.setTransform(1, 0, 0, 1, 0, 0)
      } else {
        g.fillStyle = fill
        g.textAlign = 'center'
        g.textBaseline = 'alphabetic'
        g.direction = /[؀-ۿ]/.test(glyph) ? 'rtl' : 'ltr'
        // Centre the letter by its real outline and keep it inside the box: a tall أ keeps its
        // hamza, a low ي its dots.
        const font = (px: number) => `800 ${px}px 'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', sans-serif`
        let px = glyph.length > 1 ? 250 : 340
        g.font = font(px)
        let m = g.measureText(glyph)
        const tall = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
        const wide = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
        const fit = (SIZE * 0.8) / Math.max(tall, wide, 1)
        if (fit < 1) {
          px = Math.floor(px * fit)
          g.font = font(px)
          m = g.measureText(glyph)
        }
        const x = SIZE / 2 + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2
        const y = SIZE / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2
        g.fillText(glyph, x, y)
      }
      if (points.current.length === 0) {
        points.current = maskPoints(g.getImageData(0, 0, SIZE, SIZE))
        covered.current = new Uint8Array(points.current.length / 2)
        parts.current = pointParts(points.current)
      }
      setReady(points.current.length > 0 ? 'canvas' : 'fallback')
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [glyph, stroke, rtl, hintLevel])

  useEffect(() => () => clearTimeout(winTimer.current), [])

  const finish = (quality: number) => {
    if (done.current || locked) return
    done.current = true
    setWon(true)
    setProgress(Math.max(progress, needed))
    audio.sfx('sparkle')
    // The guide turns gold under the child's ink: the whole letter, finished and shining.
    const g = guideRef.current?.getContext('2d')
    if (g) {
      g.save()
      g.globalCompositeOperation = 'source-in'
      g.fillStyle = '#ffc83d'
      g.fillRect(0, 0, SIZE, SIZE)
      g.restore()
    }
    winTimer.current = setTimeout(() => onCorrect(undefined, quality), CELEBRATE_MS)
  }

  const coverage = () => covered.current.reduce((n, v) => n + v, 0) / (covered.current.length || 1)

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = inkRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * SIZE) / r.width, y: ((e.clientY - r.top) * SIZE) / r.height }
  }

  const paint = (p: { x: number; y: number }) => {
    const c = inkRef.current?.getContext('2d')
    if (c) {
      c.strokeStyle = '#e8613a'
      c.lineWidth = BRUSH
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      c.moveTo(last.current?.x ?? p.x, last.current?.y ?? p.y)
      c.lineTo(p.x + 0.1, p.y + 0.1)
      c.stroke()
    }
    // Count coverage all along the segment, not just where events land: a quick swipe on a
    // slow tablet sends events far apart, and the ink between them was really drawn.
    const from = last.current ?? p
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / (REACH / 2)))
    let added = 0
    for (let i = 1; i <= steps; i++) {
      added += coverPoints(points.current, covered.current, from.x + ((p.x - from.x) * i) / steps, from.y + ((p.y - from.y) * i) / steps, REACH)
    }
    last.current = p
    if (added > 0) {
      setProgress(coverage())
      setPartsDone(weakestPart(covered.current, parts.current) >= partNeeded)
    }
  }

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (locked || done.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    last.current = null
    if (!started) setStarted(true)
    paint(toCanvas(e))
  }
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return
    for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) paint(toCanvas(ev))
  }
  // Checked only when the finger lifts: the child always gets to finish the stroke they're drawing.
  const onUp = () => {
    if (!last.current) return
    last.current = null
    if (done.current) return
    const value = coverage()
    if (value >= needed && weakestPart(covered.current, parts.current) >= partNeeded) finish(value)
  }

  const clear = () => {
    if (done.current) return
    audio.sfx('tap')
    inkRef.current?.getContext('2d')?.clearRect(0, 0, SIZE, SIZE)
    covered.current = new Uint8Array(points.current.length / 2)
    setProgress(0)
    setPartsDone(false)
  }

  const canFinishEarly = !won && (ready === 'fallback' || progress >= needed * 0.75 || hintLevel >= 2)
  // The bar only fills up completely when every part has been traced, so it never looks "done" too soon.
  const bar = won ? 1 : Math.min(partsDone ? 1 : 0.9, progress / needed)
  const label = stroke ? (item.stroke ?? '') : glyph

  return (
    <div className={s.stage}>
      <div className={[s.traceBox, won ? s.traceWin : ''].join(' ')}>
        <canvas ref={guideRef} width={SIZE} height={SIZE} className={[s.traceCanvas, won ? s.traceGold : ''].join(' ')} aria-hidden="true" />
        {stroke && start && (
          // "Start here": a pulsing green dot (and, with a hint, the path drawn as a moving dash).
          <svg className={s.traceCanvas} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" style={{ pointerEvents: 'none' }}>
            {(hintLevel >= 1 || ready === 'fallback') && (
              <path
                d={stroke.d}
                transform={rtl && stroke.directional ? `matrix(-1 0 0 1 ${SIZE} 0)` : undefined}
                className={ready === 'fallback' ? s.strokeFallback : s.strokeHint}
              />
            )}
            {!started && <circle cx={start[0]} cy={start[1]} r={30} className={s.startDot} />}
          </svg>
        )}
        <canvas
          ref={inkRef}
          width={SIZE}
          height={SIZE}
          className={s.traceCanvas}
          style={{ touchAction: 'none' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label={label}
          data-testid="trace-canvas"
        />
        {ready === 'fallback' && !stroke && <span className={s.traceFallback}>{glyph}</span>}
        {won && (
          <div className={s.traceStars} aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <Icon key={i} name="star" size={40} style={{ '--a': `${i * 45}deg`, animationDelay: `${(i % 4) * 0.12}s` } as CSSProperties} />
            ))}
          </div>
        )}
      </div>
      <div className={s.traceBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${Math.round(bar * 100)}%` }} />
      </div>
      <div className={s.actions}>
        <IconButton icon="again" label="↺" onClick={clear} />
        {/* Its space is always kept, so the box never jumps under the child's finger when ✓ appears. */}
        <button
          type="button"
          className={[s.choice, s.traceDone].join(' ')}
          style={canFinishEarly ? undefined : { visibility: 'hidden' }}
          disabled={!canFinishEarly}
          onClick={() => finish(progress)}
          data-testid="choice-answer"
          aria-label="✓"
        >
          <Icon name="check" size={48} />
        </button>
      </div>
    </div>
  )
}
