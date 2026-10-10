/** Fixed logical canvas size: drawings look the same on every device; CSS scales it to fit. */
export const CANVAS_W = 1200
export const CANVAS_H = 900

export type RGBA = [number, number, number, number]

export function hexToRgba(hex: string): RGBA {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255]
}

/** Minimal image buffer (ImageData-compatible) so the algorithm is testable without a browser. */
export interface PixelBuffer {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** A coloring-page line pixel acts as a wall for the paint bucket. */
export function isWall(boundary: PixelBuffer | null, i: number): boolean {
  if (!boundary) return false
  const d = boundary.data
  const a = d[i + 3] ?? 0
  if (a < 100) return false
  const lum = 0.299 * (d[i] ?? 0) + 0.587 * (d[i + 1] ?? 0) + 0.114 * (d[i + 2] ?? 0)
  return lum < 140
}

/** Transparent pixels count as white paper. */
function colorAt(layer: PixelBuffer, i: number): RGBA {
  const d = layer.data
  if ((d[i + 3] ?? 0) < 20) return [255, 255, 255, 255]
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0]
}

function close(a: RGBA, b: RGBA, tol: number): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol
}

/**
 * Scanline flood fill on the drawing layer, bounded by coloring-page lines.
 * Returns false when nothing changed (tapped a line, or same colour).
 */
export function floodFill(layer: PixelBuffer, boundary: PixelBuffer | null, x: number, y: number, color: RGBA, tolerance = 48): boolean {
  const { width: w, height: h } = layer
  x = Math.floor(x)
  y = Math.floor(y)
  if (x < 0 || y < 0 || x >= w || y >= h) return false
  const start = (y * w + x) * 4
  if (isWall(boundary, start)) return false
  const target = colorAt(layer, start)
  if (close(target, color, 4)) return false

  const visited = new Uint8Array(w * h)
  const stack: number[] = [x, y]
  const d = layer.data
  const matches = (px: number, py: number) => {
    const p = py * w + px
    if (visited[p]) return false
    const i = p * 4
    return !isWall(boundary, i) && close(colorAt(layer, i), target, tolerance)
  }
  while (stack.length) {
    const sy = stack.pop() as number
    let sx = stack.pop() as number
    while (sx > 0 && matches(sx - 1, sy)) sx--
    let spanUp = false
    let spanDown = false
    for (let cx = sx; cx < w && matches(cx, sy); cx++) {
      const p = sy * w + cx
      visited[p] = 1
      const i = p * 4
      d[i] = color[0]
      d[i + 1] = color[1]
      d[i + 2] = color[2]
      d[i + 3] = color[3]
      if (sy > 0) {
        const up = matches(cx, sy - 1)
        if (up && !spanUp) stack.push(cx, sy - 1)
        spanUp = up
      }
      if (sy < h - 1) {
        const down = matches(cx, sy + 1)
        if (down && !spanDown) stack.push(cx, sy + 1)
        spanDown = down
      }
    }
  }
  return true
}

/** Path for a filled shape stamp centred at (cx, cy). */
export function shapePath(ctx: CanvasRenderingContext2D, shape: 'circle' | 'square' | 'triangle' | 'star' | 'heart', cx: number, cy: number, r: number): void {
  ctx.beginPath()
  switch (shape) {
    case 'circle':
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      break
    case 'square':
      ctx.rect(cx - r, cy - r, r * 2, r * 2)
      break
    case 'triangle':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy + r * 0.85)
      ctx.lineTo(cx - r, cy + r * 0.85)
      ctx.closePath()
      break
    case 'star':
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? r : r * 0.45
        const ang = -Math.PI / 2 + (i * Math.PI) / 5
        const px = cx + rad * Math.cos(ang)
        const py = cy + rad * Math.sin(ang)
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    case 'heart':
      ctx.moveTo(cx, cy + r * 0.9)
      ctx.bezierCurveTo(cx - r * 1.4, cy, cx - r * 0.8, cy - r * 1.2, cx, cy - r * 0.45)
      ctx.bezierCurveTo(cx + r * 0.8, cy - r * 1.2, cx + r * 1.4, cy, cx, cy + r * 0.9)
      ctx.closePath()
      break
  }
}

const GLYPH_FONT = (px: number) => `800 ${px}px 'Baloo Bhaijaan 2 Variable', 'Baloo Bhaijaan 2', sans-serif`

/**
 * Set up `g` to draw `glyph` centred in a size×size box by its real outline: `basePx` tall,
 * shrunk so it never takes more than `fit` of the box (a tall أ keeps its hamza, a low ي its
 * dots), or with `grow` scaled to fill exactly `fit` of it. Returns where to call fillText.
 */
export function layoutGlyph(g: CanvasRenderingContext2D, glyph: string, size: number, basePx: number, fit = 0.8, grow = false): { x: number; y: number } {
  g.textAlign = 'center'
  g.textBaseline = 'alphabetic'
  g.direction = /[؀-ۿ]/.test(glyph) ? 'rtl' : 'ltr'
  let px = basePx
  g.font = GLYPH_FONT(px)
  let m = g.measureText(glyph)
  const tall = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  const wide = m.actualBoundingBoxLeft + m.actualBoundingBoxRight
  const scale = (size * fit) / Math.max(tall, wide, 1)
  if (scale < 1 || grow) {
    px = Math.floor(px * scale)
    g.font = GLYPH_FONT(px)
    m = g.measureText(glyph)
  }
  return {
    x: size / 2 + (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2,
    y: size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2,
  }
}

/** Sample points (x0,y0,x1,y1,…) on a grid where the buffer is painted — the shape to trace. */
export function maskPoints(buf: PixelBuffer, step = 12): Float32Array {
  const pts: number[] = []
  for (let y = step / 2; y < buf.height; y += step) {
    for (let x = step / 2; x < buf.width; x += step) {
      if ((buf.data[(Math.floor(y) * buf.width + Math.floor(x)) * 4 + 3] ?? 0) > 100) pts.push(x, y)
    }
  }
  return Float32Array.from(pts)
}

/** Mark mask points within `r` of (x, y) as covered. Returns how many were newly covered. */
export function coverPoints(points: Float32Array, covered: Uint8Array, x: number, y: number, r: number): number {
  let added = 0
  const r2 = r * r
  for (let i = 0; i < covered.length; i++) {
    if (covered[i]) continue
    const dx = (points[i * 2] ?? 0) - x
    const dy = (points[i * 2 + 1] ?? 0) - y
    if (dx * dx + dy * dy <= r2) {
      covered[i] = 1
      added++
    }
  }
  return added
}

/**
 * Split mask points into the separate parts of a shape (the body of ب and its dot, the two
 * strokes of ت…): points on neighbouring grid cells belong to the same part. Returns each
 * point's part number and how many parts there are.
 */
export function pointParts(points: Float32Array, step = 12): { part: Int32Array; count: number } {
  const n = points.length / 2
  const part = new Int32Array(n).fill(-1)
  const at = new Map<string, number>()
  const key = (x: number, y: number) => `${Math.round(x / step)},${Math.round(y / step)}`
  for (let i = 0; i < n; i++) at.set(key(points[i * 2] ?? 0, points[i * 2 + 1] ?? 0), i)
  let count = 0
  for (let i = 0; i < n; i++) {
    if (part[i] !== -1) continue
    part[i] = count
    const queue = [i]
    while (queue.length) {
      const j = queue.pop() as number
      const x = points[j * 2] ?? 0
      const y = points[j * 2 + 1] ?? 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const k = at.get(key(x + dx * step, y + dy * step))
          if (k !== undefined && part[k] === -1) {
            part[k] = count
            queue.push(k)
          }
        }
      }
    }
    count++
  }
  return { part, count }
}

/** The least-covered part of the shape (0–1), so a trace can't finish with the dot of ب untouched. */
export function weakestPart(covered: Uint8Array, parts: { part: Int32Array; count: number }): number {
  if (parts.count === 0) return 0
  const hit = new Array<number>(parts.count).fill(0)
  const all = new Array<number>(parts.count).fill(0)
  for (let i = 0; i < covered.length; i++) {
    const p = parts.part[i] ?? 0
    all[p] = (all[p] ?? 0) + 1
    if (covered[i]) hit[p] = (hit[p] ?? 0) + 1
  }
  // A speck of a few points (edge smoothing) isn't a part the child should have to find.
  return Math.min(...all.map((a, p) => (a >= 3 ? (hit[p] ?? 0) / a : 1)))
}

/** Coverage needed to finish a trace: most of the shape, a little easier with each hint. */
export function traceThreshold(hintLevel: number): number {
  return Math.max(0.55, 0.85 - 0.1 * hintLevel)
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image failed: ${src}`))
    img.src = src
  })
}
