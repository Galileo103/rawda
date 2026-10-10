import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { COLOR_KEYS, type ColorKey } from '../../content/schemas'
import { type WriteEntry, WRITE_FILL_ACTIVITY, entriesOf, fillLine, writeEntryById } from '../../content/writing'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { IconButton, Screen, SpeechBubble } from '../../design/ui'
import { COLOR_HEX } from '../../design/Visual'
import { dict, fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { saveDrawing } from '../../services/repos/drawings'
import { grantEarnedRewards, recordItemResult } from '../../services/repos/progress'
import { coverPoints, layoutGlyph, maskPoints, pointParts, weakestPart } from '../studio/canvasTools'
import { BRUSHES, type Brush, newBrushState, paintSegment } from './brushes'
import s from './writing.module.css'

const SIZE = 600
const BRUSH = 50
const REACH = BRUSH / 2
const STEP = 10
/** Quiet this long (ms) with work left: the spots still to colour start to sparkle. */
const IDLE_MS = 5000
const PALE = '#f4effc'
const OUTLINE = '#7a5cd6'
/** Outline thickness, drawn just outside the letter so it never covers the paint. */
const RING = 6
/** White would vanish on the pale letter. */
const PALETTE = COLOR_KEYS.filter((k) => k !== 'white')

type Pt = { x: number; y: number }

export function WritingScreen() {
  const { entryId } = useParams()
  const entry = writeEntryById(entryId)
  if (!entry) return <Navigate to="/write" replace />
  // A fresh board for every letter.
  return <FillBoard key={entry.id} entry={entry} />
}

/**
 * Colour a big hollow letter. "Magic walls": paint only ever shows inside the letter; when the
 * finger wanders out, nothing is drawn and the outline wiggles once (with a soft boing), so
 * nothing is ever a mistake. Done when the whole letter is coloured — every part of it, the
 * dots too — then it celebrates, and the picture goes to "My drawings".
 */
function FillBoard({ entry }: { entry: WriteEntry }) {
  const { t, settings, langs, age } = useApp()
  const navigate = useNavigate()
  const lang = entry.lang
  const w = dict(lang).writing.say
  const intro = fillLine(entry, dict(lang))

  const baseRef = useRef<HTMLCanvasElement>(null)
  const paintRef = useRef<HTMLCanvasElement>(null)
  const outlineRef = useRef<HTMLCanvasElement>(null)
  const mask = useRef<HTMLCanvasElement | null>(null)
  const maskData = useRef<ImageData | null>(null)
  const points = useRef<Float32Array>(new Float32Array())
  const covered = useRef<Uint8Array>(new Uint8Array())
  const parts = useRef<{ part: Int32Array; count: number }>({ part: new Int32Array(), count: 0 })
  const last = useRef<Pt | null>(null)
  const brushState = useRef(newBrushState())
  const wasInside = useRef(true)
  const bumped = useRef(false)
  const said = useRef({ inside: false, almost: false })
  const stats = useRef({ sparkles: 0, startedAt: Date.now() })
  const lastActive = useRef(Date.now())
  const done = useRef(false)

  const [ready, setReady] = useState<'loading' | 'canvas' | 'fallback'>('loading')
  const [brush, setBrush] = useState<Brush>('marker')
  const [color, setColor] = useState<ColorKey>('blue')
  const [progress, setProgress] = useState(0)
  const [sparkles, setSparkles] = useState<Pt[] | null>(null)
  const [won, setWon] = useState(false)
  const [bubble, setBubble] = useState(intro)

  /** Coverage needed: nearly all of it (a little less for the youngest). */
  const needed = 0.95 - age.traceBonus / 2
  const say = (text: string) => {
    setBubble(text)
    void audio.speak(text, lang)
  }
  const coverage = () => covered.current.reduce((n, v) => n + v, 0) / (covered.current.length || 1)

  // Draw the letter: a pale fill (under the paint), its outline (over the paint), and the mask.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await document.fonts?.ready
      } catch {
        /* ignore */
      }
      if (cancelled) return
      const off = document.createElement('canvas')
      off.width = SIZE
      off.height = SIZE
      const m = off.getContext('2d', { willReadFrequently: true })
      const base = baseRef.current?.getContext('2d')
      const outline = outlineRef.current?.getContext('2d')
      if (!m || !base || !outline) return setReady('fallback')
      const draw = (g: CanvasRenderingContext2D, how: 'fill' | 'stroke', style: string) => {
        g.clearRect(0, 0, SIZE, SIZE)
        const { x, y } = layoutGlyph(g, entry.glyph, SIZE, 400, 0.78, true)
        if (how === 'fill') {
          g.fillStyle = style
          g.fillText(entry.glyph, x, y)
        } else {
          // One clean ring around the whole shape (no seams where a letter meets its tatweel):
          // the letter drawn slightly larger all round, minus the letter itself.
          g.fillStyle = style
          for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2
            g.fillText(entry.glyph, x + Math.cos(a) * RING, y + Math.sin(a) * RING)
          }
          g.globalCompositeOperation = 'destination-out'
          g.fillText(entry.glyph, x, y)
          g.globalCompositeOperation = 'source-over'
        }
      }
      draw(m, 'fill', '#000')
      draw(base, 'fill', PALE)
      draw(outline, 'stroke', OUTLINE)
      mask.current = off
      maskData.current = m.getImageData(0, 0, SIZE, SIZE)
      points.current = maskPoints(maskData.current, STEP)
      covered.current = new Uint8Array(points.current.length / 2)
      parts.current = pointParts(points.current, STEP)
      setReady(points.current.length ? 'canvas' : 'fallback')
    })()
    void audio.speak(intro, lang)
    return () => {
      cancelled = true
      audio.stop()
    }
    // Runs once per board (the board is keyed by the letter).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Idle helper: the spots still to colour sparkle (and once, Hala points them out).
  useEffect(() => {
    if (ready !== 'canvas' || sparkles) return
    const id = setInterval(() => {
      if (done.current || last.current || Date.now() - lastActive.current < IDLE_MS) return
      const value = coverage()
      if (value < 0.25) return
      // Spread out: at most 10 sparkles, never two on top of each other.
      const pick: Pt[] = []
      for (let i = 0; i < covered.current.length && pick.length < 10; i++) {
        if (covered.current[i]) continue
        const p = { x: points.current[i * 2] ?? 0, y: points.current[i * 2 + 1] ?? 0 }
        if (pick.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 70)) pick.push(p)
      }
      if (!pick.length) return
      setSparkles(pick)
      stats.current.sparkles++
      if (value >= 0.6 && !said.current.almost) {
        said.current.almost = true
        say(w.almost)
      }
    }, 1000)
    return () => clearInterval(id)
    // say/coverage only read refs and stable values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sparkles])

  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const r = paintRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * SIZE) / r.width, y: ((e.clientY - r.top) * SIZE) / r.height }
  }

  /** Inside the letter (or touching it with the edge of the brush). */
  const inside = (p: Pt) => {
    const data = maskData.current
    if (!data) return true
    const near = BRUSH * 0.35
    const probes: [number, number][] = [
      [0, 0],
      [near, 0],
      [-near, 0],
      [0, near],
      [0, -near],
    ]
    return probes.some(([dx, dy]) => {
      const x = Math.round(p.x + dx)
      const y = Math.round(p.y + dy)
      return x >= 0 && y >= 0 && x < SIZE && y < SIZE && (data.data[(y * SIZE + x) * 4 + 3] ?? 0) > 100
    })
  }

  const paint = (from: Pt, to: Pt) => {
    const c = paintRef.current?.getContext('2d')
    if (!c || !mask.current) return
    paintSegment(c, brush, COLOR_HEX[color], BRUSH, from, to, brushState.current)
    // Magic walls: keep only what is inside the letter.
    c.globalCompositeOperation = 'destination-in'
    c.drawImage(mask.current, 0, 0)
    c.globalCompositeOperation = 'source-over'
    // Count coverage all along the segment (a quick swipe sends events far apart).
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (REACH / 2)))
    let added = 0
    for (let i = 0; i <= steps; i++) added += coverPoints(points.current, covered.current, from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, REACH)
    if (added) setProgress(coverage())
  }

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (done.current || ready !== 'canvas') return
    e.currentTarget.setPointerCapture(e.pointerId)
    lastActive.current = Date.now()
    setSparkles(null)
    brushState.current = newBrushState()
    bumped.current = false
    const p = toCanvas(e)
    wasInside.current = inside(p)
    last.current = p
    paint(p, p)
  }

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return
    lastActive.current = Date.now()
    for (const ev of e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]) {
      const p = toCanvas(ev)
      const isIn = inside(p)
      // Bumping the wall: the outline wiggles once per stroke; Hala says it only the first time.
      if (!isIn && wasInside.current && !bumped.current) {
        bumped.current = true
        outlineRef.current?.animate?.(
          [{ transform: 'none' }, { transform: 'translateX(-7px) rotate(-1.2deg)' }, { transform: 'translateX(7px) rotate(1.2deg)' }, { transform: 'translateX(-3px)' }, { transform: 'none' }],
          { duration: 420, easing: 'ease-out' },
        )
        audio.sfx('boing')
        if (!said.current.inside) {
          said.current.inside = true
          say(w.inside)
        }
      }
      wasInside.current = isIn
      if (last.current) paint(last.current, p)
      last.current = p
    }
  }

  const onUp = () => {
    if (!last.current) return
    last.current = null
    lastActive.current = Date.now()
    if (!done.current && coverage() >= needed && weakestPart(covered.current, parts.current) >= 0.85) void win()
  }

  const win = async () => {
    done.current = true
    setWon(true)
    setSparkles(null)
    setProgress(1)
    audio.sfx('sparkle')
    say(entry.set === 'num' ? w.doneNumber : w.done)
    void recordItemResult({
      activityId: WRITE_FILL_ACTIVITY,
      itemId: entry.id,
      skill: entry.skill,
      areaId: entry.areaId,
      lang,
      firstTry: stats.current.sparkles === 0,
      misses: 0,
      hintsUsed: stats.current.sparkles,
      durationMs: Date.now() - stats.current.startedAt,
      quality: coverage(),
    }).catch((err) => console.error('[rawda] could not save writing result', err))
    // The finished letter goes to "My drawings", just as the child sees it.
    try {
      const comp = document.createElement('canvas')
      comp.width = SIZE
      comp.height = SIZE
      const o = comp.getContext('2d')
      if (o && baseRef.current && paintRef.current && outlineRef.current) {
        o.fillStyle = '#fff'
        o.fillRect(0, 0, SIZE, SIZE)
        o.drawImage(baseRef.current, 0, 0)
        o.drawImage(paintRef.current, 0, 0)
        o.drawImage(outlineRef.current, 0, 0)
        const png = comp.toDataURL('image/png')
        await saveDrawing({ pngDataUrl: png, layerDataUrl: png })
        await grantEarnedRewards(content.rewards).catch(() => [])
      }
    } catch (err) {
      console.error('[rawda] could not save the letter picture', err)
    }
  }

  const restart = () => {
    audio.sfx('tap')
    paintRef.current?.getContext('2d')?.clearRect(0, 0, SIZE, SIZE)
    covered.current = new Uint8Array(points.current.length / 2)
    done.current = false
    stats.current = { sparkles: 0, startedAt: Date.now() }
    lastActive.current = Date.now()
    setProgress(0)
    setSparkles(null)
    setWon(false)
    say(intro)
  }

  const list = entriesOf(entry.set, langs)
  const next = list[(list.findIndex((e) => e.id === entry.id) + 1) % list.length]
  const back = () => navigate(`/write?set=${entry.set}`)
  const multi = brush === 'rainbow' || brush === 'stars'

  return (
    <Screen className={s.board}>
      <div className={s.bar}>
        <IconButton icon="close" label={t.writing.all} onClick={back} />
        <div className={s.barHala}>
          <Mascot mood={won ? 'cheer' : 'happy'} size={64} />
          <SpeechBubble text={bubble} lang={lang} readAloud={!settings.narration} />
        </div>
        <IconButton icon="speaker" label={t.player.listen} onClick={() => say(won ? bubble : intro)} />
      </div>

      <div className={s.stage}>
        <div className={s.side}>
          {won ? (
            <>
              <IconButton icon="again" label={t.writing.again} showLabel onClick={restart} />
              <IconButton icon="map" label={t.writing.all} showLabel onClick={back} />
            </>
          ) : (
            <div className={s.brushes} role="radiogroup" aria-label={t.studio.brush}>
              {BRUSHES.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={s.brushBtn}
                  aria-pressed={brush === b}
                  aria-label={t.writing.brushes[b]}
                  data-testid={`brush-${b}`}
                  onClick={() => {
                    audio.sfx('tap')
                    setBrush(b)
                  }}
                >
                  <span className={[s.brushDot, s[`b_${b}`]].join(' ')} style={{ '--c': COLOR_HEX[color] } as CSSProperties}>
                    {b === 'stars' && <Icon name="star" size={26} />}
                  </span>
                  <span className={s.brushName}>{t.writing.brushes[b]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={[s.box, won ? s.boxWin : ''].join(' ')}>
          <canvas ref={baseRef} width={SIZE} height={SIZE} className={s.layer} aria-hidden="true" />
          <canvas
            ref={paintRef}
            width={SIZE}
            height={SIZE}
            className={s.layer}
            style={{ touchAction: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            role="img"
            aria-label={entry.glyph}
            data-testid="write-canvas"
            data-progress={Math.round(progress * 100)}
          />
          <canvas ref={outlineRef} width={SIZE} height={SIZE} className={[s.layer, s.outline].join(' ')} aria-hidden="true" />
          {ready === 'fallback' && (
            <span className={s.fallback} lang={lang}>
              {entry.glyph}
            </span>
          )}
          {sparkles && (
            <svg className={s.layer} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true" data-testid="write-sparkles">
              {sparkles.map((p, i) => (
                <path
                  key={i}
                  className={s.sparkle}
                  style={{ animationDelay: `${(i % 5) * 0.15}s`, transformOrigin: `${p.x}px ${p.y}px` }}
                  d={`M${p.x} ${p.y - 18}L${p.x + 5} ${p.y - 5}L${p.x + 18} ${p.y}L${p.x + 5} ${p.y + 5}L${p.x} ${p.y + 18}L${p.x - 5} ${p.y + 5}L${p.x - 18} ${p.y}L${p.x - 5} ${p.y - 5}Z`}
                />
              ))}
            </svg>
          )}
          {won && (
            <div className={s.winStars} aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <Icon key={i} name="star" size={44} style={{ '--a': `${i * 45}deg`, animationDelay: `${(i % 4) * 0.12}s` } as CSSProperties} />
              ))}
            </div>
          )}
        </div>

        <div className={s.side}>
          {won ? (
            <>
              {next && (
                <button type="button" className={s.nextBtn} onClick={() => navigate(`/write/${next.id}`)} data-testid="write-next" aria-label={`${t.writing.next} ${next.glyph}`}>
                  <span lang={next.lang}>{next.glyph}</span>
                  <span className={s.nextArrow} aria-hidden="true">
                    <Icon name="next" size={40} />
                  </span>
                </button>
              )}
              <p className={s.saved} role="status">
                <Icon name="gallery" size={22} /> {t.writing.savedToGallery}
              </p>
            </>
          ) : (
            <>
              <div className={[s.palette, multi ? s.paletteOff : ''].join(' ')} role="radiogroup" aria-label={t.studio.color.replace('{name}', '')}>
                {PALETTE.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={s.swatch}
                    style={{ background: COLOR_HEX[k] }}
                    aria-pressed={color === k && !multi}
                    aria-label={fmt(t.studio.color, { name: t.colors[k] })}
                    onClick={() => {
                      audio.sfx('tap')
                      setColor(k)
                      if (multi) setBrush('marker')
                    }}
                  />
                ))}
              </div>
              <IconButton icon="again" label={t.writing.restart} onClick={restart} />
            </>
          )}
        </div>
      </div>

      {/* How much is coloured: fills up as the child works, full only when it's done. */}
      <div className={s.meter} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
        <span style={{ width: `${Math.round((won ? 1 : Math.min(progress / needed, 0.97)) * 100)}%` }} />
      </div>
    </Screen>
  )
}
