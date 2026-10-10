import { shapePath } from '../studio/canvasTools'

export const BRUSHES = ['marker', 'crayon', 'rainbow', 'glitter', 'stars'] as const
export type Brush = (typeof BRUSHES)[number]

type Pt = { x: number; y: number }

/** Per-stroke state a brush keeps (rainbow hue, distance to the next stamp). */
export interface BrushState {
  hue: number
  toStamp: number
  stamp: number
}
export const newBrushState = (): BrushState => ({ hue: Math.random() * 360, toStamp: 0, stamp: 0 })

const STAMP_COLORS = ['#e8613a', '#f5a300', '#2f8fdb', '#3f9d33', '#d94a86', '#7a5cd6']

/**
 * Paint one segment of a stroke with a fun brush. Everything is drawn freely here; the
 * "magic walls" (only inside the letter) are applied afterwards by masking the layer.
 */
export function paintSegment(c: CanvasRenderingContext2D, brush: Brush, color: string, width: number, from: Pt, to: Pt, st: BrushState): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  c.lineCap = 'round'
  c.lineJoin = 'round'
  switch (brush) {
    case 'marker':
    case 'glitter':
      line(c, color, width, from, to)
      if (brush === 'glitter') {
        // Little white and gold sparkles scattered along the stroke.
        const n = Math.max(1, Math.round(dist / 6))
        for (let i = 0; i < n; i++) {
          const t = Math.random()
          const a = Math.random() * Math.PI * 2
          const r = Math.random() * width * 0.45
          c.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#ffe27a'
          c.beginPath()
          c.arc(from.x + (to.x - from.x) * t + Math.cos(a) * r, from.y + (to.y - from.y) * t + Math.sin(a) * r, 1.5 + Math.random() * 2.5, 0, Math.PI * 2)
          c.fill()
        }
      }
      break
    case 'crayon': {
      // Waxy texture: many small soft dots instead of one smooth line.
      c.fillStyle = color
      const steps = Math.max(1, Math.round(dist / 3))
      for (let i = 0; i <= steps; i++) {
        const x = from.x + ((to.x - from.x) * i) / steps
        const y = from.y + ((to.y - from.y) * i) / steps
        for (let k = 0; k < 7; k++) {
          const a = Math.random() * Math.PI * 2
          const r = Math.sqrt(Math.random()) * width * 0.5
          c.globalAlpha = 0.35 + Math.random() * 0.45
          c.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 3.5, 3.5)
        }
      }
      c.globalAlpha = 1
      break
    }
    case 'rainbow':
      st.hue = (st.hue + dist * 0.6) % 360
      line(c, `hsl(${st.hue} 85% 58%)`, width, from, to)
      break
    case 'stars': {
      // A trail of little stars and hearts in changing colours.
      const gap = width * 0.55
      let travelled = 0
      while (travelled + st.toStamp <= dist) {
        travelled += st.toStamp
        const t = dist ? travelled / dist : 0
        c.save()
        c.translate(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)
        c.rotate((Math.random() - 0.5) * 0.8)
        c.fillStyle = STAMP_COLORS[st.stamp % STAMP_COLORS.length] as string
        shapePath(c, st.stamp % 4 === 3 ? 'heart' : 'star', 0, 0, width * 0.62)
        c.fill()
        c.restore()
        st.stamp++
        st.toStamp = gap
      }
      st.toStamp -= dist - travelled
      break
    }
  }
}

function line(c: CanvasRenderingContext2D, color: string, width: number, from: Pt, to: Pt) {
  c.strokeStyle = color
  c.lineWidth = width
  c.beginPath()
  c.moveTo(from.x, from.y)
  c.lineTo(to.x + 0.1, to.y + 0.1)
  c.stroke()
}
