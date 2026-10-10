import { describe, expect, it } from 'vitest'
import { STROKES } from '../../content/strokes'
import { WRITE_ENTRIES, writeEntryById } from '../../content/writing'
import { brushFor } from './brushes'
import { STEP, follow, layoutStrokes, letterStrokes, parseStroke, resample, strokeProgress } from './paths'

describe('stroke paths', () => {
  it('parses lines, curves and dots', () => {
    expect(parseStroke('M0 0 L10 0').pts).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])
    const c = parseStroke('M0 0 C0 10 10 10 10 0').pts
    expect(c.length).toBeGreaterThan(20)
    expect(c[c.length - 1]).toEqual({ x: 10, y: 0 })
    expect(parseStroke('D 5 6')).toEqual({ pts: [{ x: 5, y: 6 }], dot: true })
  })

  it('spaces points evenly along a stroke', () => {
    const pts = resample(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      STEP,
    )
    expect(pts).toHaveLength(26)
    expect(pts[1]!.x).toBeCloseTo(STEP)
  })

  it('centres a letter in the board', () => {
    const [st] = layoutStrokes(['M0 0 L0 100'], 600, 0.5)
    expect(st!.pts[0]).toEqual({ x: 300, y: 150 })
    expect(st!.pts[st!.pts.length - 1]!.y).toBeCloseTo(450)
  })

  it('keeps small English letters on one line: o is shorter than l', () => {
    const height = (id: string) => {
      const ys = letterStrokes(id, 600).flatMap((s) => s.pts.map((p) => p.y))
      return Math.max(...ys) - Math.min(...ys)
    }
    expect(height('en-o')).toBeLessThan(height('en-l') * 0.6)
    expect(height('en-O')).toBeGreaterThan(height('en-o') * 1.5)
  })

  it('follows a finger only forwards along the stroke', () => {
    const [st] = layoutStrokes(['M0 0 L100 0'], 600, 0.5)
    const at = (i: number) => st!.pts[i]!
    let reached = 0
    reached = follow(st!, reached, at(10), 20)
    expect(reached).toBeGreaterThanOrEqual(10)
    // Going back to the start does not undo progress; jumping far ahead is out of reach.
    expect(follow(st!, reached, at(0), 20)).toBe(reached)
    expect(follow(st!, reached, at(st!.pts.length - 1), 20)).toBe(reached)
    // Off the path: nothing counts.
    expect(follow(st!, reached, { x: at(15).x, y: at(15).y + 100 }, 20)).toBe(reached)
    expect(strokeProgress(st!, st!.pts.length - 1)).toBe(1)
  })

  it('does not jump ahead where a stroke passes close to itself (the hamza of أ)', () => {
    const st = letterStrokes('ar-alif', 600)[1]!
    const part = st.pts.slice(0, Math.floor(st.pts.length * 0.7))
    let reached = 0
    for (let i = 3; i < part.length; i += 3) reached = follow(st, reached, part[i]!, 34, 12)
    reached = follow(st, reached, part[part.length - 1]!, 34, 12)
    // Where the finger is (give or take a point), not on the tail further along (it used to jump to ~62 of 71).
    expect(Math.abs(reached - (part.length - 1))).toBeLessThanOrEqual(2)
  })
})

describe('stroke data', () => {
  it('covers every Arabic letter and its forms, English letter and digit', () => {
    for (const e of WRITE_ENTRIES) expect(STROKES[e.id], e.id).toBeDefined()
    for (const id of Object.keys(STROKES)) expect(writeEntryById(id), id).toBeDefined()
  })

  it('has one continuous movement per stroke, each long enough to follow', () => {
    for (const [id, strokes] of Object.entries(STROKES)) {
      for (const src of strokes) {
        if (src.startsWith('D')) continue
        expect((src.match(/M/g) ?? []).length, `${id}: ${src}`).toBe(1)
        expect(parseStroke(src).pts.length, `${id}: ${src}`).toBeGreaterThan(1)
      }
    }
  })

  it('writes the dots of Arabic letters after the body', () => {
    for (const [id, strokes] of Object.entries(STROKES)) {
      if (!id.startsWith('ar-')) continue
      const firstDot = strokes.findIndex((s) => s.startsWith('D'))
      if (firstDot >= 0) expect(strokes.slice(firstDot).every((s) => s.startsWith('D')), id).toBe(true)
    }
  })
})

describe('colouring brush', () => {
  it('is as wide as the letter’s strokes, so one pass colours a stroke', () => {
    const width = 600
    const height = 600
    const data = new Uint8ClampedArray(width * height * 4)
    // A bar 80 px thick and 400 px long.
    for (let y = 260; y < 340; y++) for (let x = 100; x < 500; x++) data[(y * width + x) * 4 + 3] = 255
    expect(brushFor({ data, width, height })).toBeGreaterThan(65)
    expect(brushFor({ data, width, height })).toBeLessThan(85)
    // Never a hair-thin or a giant brush.
    expect(brushFor({ data: new Uint8ClampedArray(width * height * 4), width, height })).toBe(70)
  })
})
