import type { StrokeKey } from '../../../content/schemas'

/**
 * Pre-writing strokes for finger tracing, drawn in a 480×480 box.
 * `start` is where the green "start here" dot sits. Strokes that have a writing
 * direction (lines across, zigzags, waves) are mirrored for Arabic so they run right → left.
 */
export interface StrokeDef {
  d: string
  start: [number, number]
  /** Mirror horizontally when the child writes right-to-left. */
  directional: boolean
}

export const STROKES: Record<StrokeKey, StrokeDef> = {
  vline: { d: 'M240 70 V410', start: [240, 70], directional: false },
  hline: { d: 'M70 240 H410', start: [70, 240], directional: true },
  circle: { d: 'M240 85 A155 155 0 1 0 240.1 85', start: [240, 85], directional: false },
  cross: { d: 'M240 75 V405 M75 240 H405', start: [240, 75], directional: false },
  square: { d: 'M95 95 H385 V385 H95 Z', start: [95, 95], directional: true },
  triangle: { d: 'M240 75 L410 395 H70 Z', start: [240, 75], directional: false },
  zigzag: { d: 'M50 310 L140 170 L230 310 L320 170 L410 310', start: [50, 310], directional: true },
  wave: { d: 'M45 240 Q 110 120 175 240 T 305 240 T 435 240', start: [45, 240], directional: true },
}

export const STROKE_BOX = 480

/** Start point for a stroke in the given writing direction. */
export function strokeStart(def: StrokeDef, rtl: boolean): [number, number] {
  return rtl && def.directional ? [STROKE_BOX - def.start[0], def.start[1]] : def.start
}
