import { type PointerEvent, useEffect, useRef, useState } from 'react'
import type { TraceItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { IconButton } from '../../../design/ui'
import { useOptionalApp } from '../../../app/AppState'
import { ageProfile } from '../../../domain/ageProfile'
import { audio } from '../../../services/audio/AudioService'
import { coverPoints, maskPoints, traceThreshold } from '../../studio/canvasTools'
import s from '../activities.module.css'
import { STROKE_BOX, STROKES, strokeStart } from './strokes'
import type { TemplateProps } from './types'

const SIZE = STROKE_BOX
const BRUSH = 38
const REACH = 30
const STROKE_WIDTH = 54

/**
 * Trace with a finger: a letter/numeral, or a pre-writing stroke (line, circle, zigzag…)
 * that starts at a green dot. Success = enough of the shape covered (generous threshold,
 * lowered by hints and for younger children). A big ✓ appears early as a motor-friendly
 * alternative, so a child with less precise fine-motor control is never stuck.
 */
export function TraceTemplate({ item, lang, hintLevel, locked, onCorrect }: TemplateProps<TraceItem>) {
  const guideRef = useRef<HTMLCanvasElement>(null)
  const inkRef = useRef<HTMLCanvasElement>(null)
  const points = useRef<Float32Array>(new Float32Array())
  const covered = useRef<Uint8Array>(new Uint8Array())
  const last = useRef<{ x: number; y: number } | null>(null)
  const done = useRef(false)
  const [progress, setProgress] = useState(0)
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState<'loading' | 'canvas' | 'fallback'>('loading')
  const age = useOptionalApp()?.age ?? ageProfile(undefined)
  /** Coverage needed: generous, easier with hints and for younger children. */
  const needed = Math.max(0.3, traceThreshold(hintLevel) - age.traceBonus)
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
      const fill = hintLevel >= 1 ? '#c9b8f2' : '#e7dfd2'
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
        g.font = `800 ${glyph.length > 1 ? 250 : 340}px 'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.direction = /[؀-ۿ]/.test(glyph) ? 'rtl' : 'ltr'
        g.fillText(glyph, SIZE / 2, SIZE / 2 + 10)
      }
      if (points.current.length === 0) {
        points.current = maskPoints(g.getImageData(0, 0, SIZE, SIZE))
        covered.current = new Uint8Array(points.current.length / 2)
      }
      setReady(points.current.length > 0 ? 'canvas' : 'fallback')
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [glyph, stroke, rtl, hintLevel])

  const finish = (quality: number) => {
    if (done.current || locked) return
    done.current = true
    onCorrect(undefined, quality)
  }

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
    last.current = p
    if (coverPoints(points.current, covered.current, p.x, p.y, REACH) > 0) {
      const total = covered.current.length || 1
      const value = covered.current.reduce((n, v) => n + v, 0) / total
      setProgress(value)
      if (value >= needed) finish(value)
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
  const onUp = () => {
    last.current = null
  }

  const clear = () => {
    audio.sfx('tap')
    inkRef.current?.getContext('2d')?.clearRect(0, 0, SIZE, SIZE)
    covered.current = new Uint8Array(points.current.length / 2)
    setProgress(0)
  }

  const canFinishEarly = ready === 'fallback' || progress >= 0.35 || hintLevel >= 2
  const label = stroke ? (item.stroke ?? '') : glyph

  return (
    <div className={s.stage}>
      <div className={s.traceBox}>
        <canvas ref={guideRef} width={SIZE} height={SIZE} className={s.traceCanvas} aria-hidden="true" />
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
      </div>
      <div className={s.traceBar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${Math.min(100, Math.round((progress / needed) * 100))}%` }} />
      </div>
      <div className={s.actions}>
        <IconButton icon="again" label="↺" onClick={clear} />
        {canFinishEarly && (
          <button type="button" className={[s.choice, s.traceDone].join(' ')} onClick={() => finish(progress)} data-testid="choice-answer" aria-label="✓">
            <Icon name="check" size={48} />
          </button>
        )}
      </div>
    </div>
  )
}
