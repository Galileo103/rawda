/**
 * Handwriting strokes for the dotted-path mode: parsing the authored paths, fitting a letter
 * into the board, and following a finger along a stroke in the right direction.
 * Pure (no DOM) so it is unit-tested.
 */

import { STROKES } from '../../content/strokes'

export type Pt = { x: number; y: number }

/** One stroke on the board: evenly spaced points (STEP apart), or a single dot to tap. */
export interface Stroke {
  pts: Pt[]
  dot: boolean
  /** The authored path in board coordinates (for drawing the guide). */
  d: string
  /** The stroke's size on the board (its larger side): small marks like a hamza get a thinner track. */
  span: number
}

/** Spacing between stroke points, in board pixels. */
export const STEP = 4

const TOKENS = /[A-Za-z]|-?\d*\.?\d+/g

/**
 * Parse an authored stroke into a dense polyline. Absolute M, L, H, V, Q and C commands;
 * "D x y" is a dot (tapped, not drawn).
 */
export function parseStroke(src: string): { pts: Pt[]; dot: boolean } {
  const tokens = src.match(TOKENS) ?? []
  if (tokens[0] === 'D') return { pts: [{ x: Number(tokens[1]), y: Number(tokens[2]) }], dot: true }
  const pts: Pt[] = []
  let i = 0
  let cmd = ''
  let cur: Pt = { x: 0, y: 0 }
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i] as string)) cmd = tokens[i++] as string
    switch (cmd) {
      case 'M':
        cur = { x: num(), y: num() }
        pts.push(cur)
        cmd = 'L' // extra pairs after M are line-tos
        break
      case 'L':
        cur = { x: num(), y: num() }
        pts.push(cur)
        break
      case 'H':
        cur = { x: num(), y: cur.y }
        pts.push(cur)
        break
      case 'V':
        cur = { x: cur.x, y: num() }
        pts.push(cur)
        break
      case 'Q': {
        const c = { x: num(), y: num() }
        const e = { x: num(), y: num() }
        const s = cur
        for (let k = 1; k <= 24; k++) {
          const t = k / 24
          const u = 1 - t
          pts.push({ x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y })
        }
        cur = e
        break
      }
      case 'C': {
        const c1 = { x: num(), y: num() }
        const c2 = { x: num(), y: num() }
        const e = { x: num(), y: num() }
        const s = cur
        for (let k = 1; k <= 32; k++) {
          const t = k / 32
          const u = 1 - t
          pts.push({
            x: u * u * u * s.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * e.x,
            y: u * u * u * s.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * e.y,
          })
        }
        cur = e
        break
      }
      default:
        i++ // unknown token: skip rather than loop forever
    }
  }
  return { pts, dot: false }
}

/** Points evenly spaced `step` apart along a polyline (first and last kept). */
export function resample(line: Pt[], step: number): Pt[] {
  if (line.length < 2) return line.slice()
  const out: Pt[] = [line[0] as Pt]
  let carry = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Pt
    const b = line[i] as Pt
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (seg === 0) continue
    let t = step - carry
    while (t <= seg) {
      out.push({ x: a.x + ((b.x - a.x) * t) / seg, y: a.y + ((b.y - a.y) * t) / seg })
      t += step
    }
    carry = seg - (t - step)
  }
  const end = line[line.length - 1] as Pt
  const last = out[out.length - 1] as Pt
  if (Math.hypot(end.x - last.x, end.y - last.y) > step / 4) out.push(end)
  return out
}

/**
 * Fit a letter's strokes into a size×size board: centred, as large as fits in `fit` of it
 * (letters are authored in any units; only their shape matters).
 */
export function layoutStrokes(src: readonly string[], size: number, fit = 0.68, frame?: readonly [number, number]): Stroke[] {
  const parsed = src.map(parseStroke)
  const all = parsed.flatMap((p) => p.pts)
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  // With a frame (small letters: ascender to descender), every letter keeps its height and
  // place on the line, so "o" is small and "p" hangs below. Otherwise it fills the board;
  // a thin letter (l, 1, alif) is fitted by its height alone.
  const minY = frame ? frame[0] : Math.min(...all.map((p) => p.y))
  const maxY = frame ? frame[1] : Math.max(...all.map((p) => p.y))
  const scale = (size * fit) / Math.max(maxY - minY, maxX - minX, 1)
  const ox = size / 2 - ((minX + maxX) / 2) * scale
  const oy = size / 2 - ((minY + maxY) / 2) * scale
  const tf = (p: Pt): Pt => ({ x: ox + p.x * scale, y: oy + p.y * scale })
  return parsed.map((p, i) => {
    const pts = p.dot ? p.pts.map(tf) : resample(p.pts.map(tf), STEP)
    const xs = pts.map((q) => q.x)
    const ys = pts.map((q) => q.y)
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    return { pts, dot: p.dot, d: transformPath(src[i] as string, scale, ox, oy), span }
  })
}

/** Small English letters share one writing frame: ascender (y 12) to descender (y 110). */
const SMALL_FRAME = [12, 110] as const

/** A Writing room entry's strokes on a size×size board (none for letter forms). */
/** fit 0.64: a little smaller than the board allows, so the thick track never touches its edge. */
export function letterStrokes(entryId: string, size: number, fit = 0.64): Stroke[] {
  const src = STROKES[entryId]
  if (!src) return []
  return layoutStrokes(src, size, fit, /^en-[a-z]$/.test(entryId) ? SMALL_FRAME : undefined)
}

/** The authored path, scaled into board coordinates (absolute commands only). */
function transformPath(d: string, scale: number, ox: number, oy: number): string {
  const out: string[] = []
  let cmd = ''
  let axis = 0
  for (const tok of d.match(TOKENS) ?? []) {
    if (/[A-Za-z]/.test(tok)) {
      cmd = tok
      axis = 0
      out.push(tok)
      continue
    }
    const isY = cmd === 'V' || (cmd !== 'H' && axis % 2 === 1)
    out.push(String(Math.round(((isY ? oy : ox) + Number(tok) * scale) * 10) / 10))
    axis++
  }
  return out.join(' ')
}

/**
 * Follow a finger along a stroke. `reached` is how far along it the child has come (a point
 * index). The finger moves it to the point of the stroke nearest to it, a little way ahead
 * and within `tol` — only forward, so drawing it backwards doesn't count. Nearest (not
 * furthest): where a stroke passes close to itself (the tail of a hamza, a loop), progress
 * stays where the finger really is instead of jumping ahead. A point ahead must be nearer
 * than the one already reached, so a finger that barely moves (a mouse sends many tiny
 * events) doesn't creep progress ahead of itself. Returns the new `reached`.
 */
export function follow(stroke: Stroke, reached: number, p: Pt, tol: number, lookahead = 40): number {
  let best = reached
  const at = stroke.pts[reached]
  let bestD = at ? Math.min(tol, Math.hypot(at.x - p.x, at.y - p.y)) : tol
  const end = Math.min(stroke.pts.length - 1, reached + lookahead)
  for (let i = reached + 1; i <= end; i++) {
    const q = stroke.pts[i] as Pt
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < bestD) {
      best = i
      bestD = d
    }
  }
  return best
}

/**
 * Follow a finger that moved from `from` to `to` since the last pointer event. A quick hand
 * sends events far apart — further than `lookahead` reaches — so progress walks the
 * movement in small steps instead of stalling mid-stroke. Each step can carry progress only
 * about as far as the finger travelled (plus a little slack), so it never races ahead of
 * the hand — not even where a stroke passes close to itself (the tail of a hamza).
 */
export function followMove(stroke: Stroke, reached: number, from: Pt, to: Pt, tol: number, lookahead = 40): number {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const n = Math.max(1, Math.ceil(dist / (STEP * 3)))
  const reach = Math.min(lookahead, Math.ceil(dist / n / STEP) + 8)
  let r = reached
  for (let k = 1; k <= n; k++) r = follow(stroke, r, { x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n }, tol, reach)
  return r
}

/** How far along a stroke `reached` is, 0..1. */
export const strokeProgress = (stroke: Stroke, reached: number) => (stroke.pts.length > 1 ? reached / (stroke.pts.length - 1) : 1)

/** Distance from p to the nearest point of a stroke (to know when a finger has left the path). */
export function distToStroke(stroke: Stroke, p: Pt): number {
  let best = Infinity
  for (const q of stroke.pts) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y))
  return best
}
