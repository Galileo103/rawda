import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppStateProvider } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { SequenceItem, SortItem, SpeakItem } from '../../../content/schemas'
import { seededRng } from '../../../domain/rng'
import { SequenceTemplate } from './SequenceTemplate'
import { SortTemplate } from './SortTemplate'
import { SpeakTemplate } from './SpeakTemplate'
import { STROKES, strokeStart } from './strokes'

const sort: SortItem = {
  id: 'ry',
  skill: 'logic.sort.color',
  difficulty: 1,
  say: { en: 'Red here, yellow there' },
  bins: [
    { id: 'red', label: { kind: 'color', color: 'red' } },
    { id: 'yellow', label: { kind: 'color', color: 'yellow' } },
  ],
  things: [
    { v: { kind: 'lex', id: 'apple' }, bin: 'red' },
    { v: { kind: 'lex', id: 'banana' }, bin: 'yellow' },
    { v: { kind: 'lex', id: 'lemon' }, bin: 'yellow' },
  ],
}

describe('SortTemplate (drag or tap-tap)', () => {
  it('tap a picture, then its basket; a wrong basket is gentle and the picture stays', async () => {
    const onCorrect = vi.fn()
    const onWrong = vi.fn()
    render(<SortTemplate item={sort} lang="en" hintLevel={0} locked={false} onCorrect={onCorrect} onWrong={onWrong} rng={seededRng(3)} />)
    await userEvent.click(screen.getByRole('button', { name: 'apple' }))
    await userEvent.click(screen.getByTestId('bin-yellow'))
    expect(onWrong).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'apple' })).toBeInTheDocument() // back in the tray
    for (const [name, bin] of [['apple', 'red'], ['banana', 'yellow'], ['lemon', 'yellow']] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      await userEvent.click(screen.getByTestId(`bin-${bin}`))
    }
    expect(onCorrect).toHaveBeenCalledTimes(1)
  })

  it('dropping a dragged picture on its basket places it', async () => {
    const onWrong = vi.fn()
    render(<SortTemplate item={sort} lang="en" hintLevel={0} locked={false} onCorrect={vi.fn()} onWrong={onWrong} rng={seededRng(1)} />)
    const bin = screen.getByTestId('bin-red')
    // jsdom has no layout: point elementFromPoint at the basket under the finger.
    const original = document.elementFromPoint
    document.elementFromPoint = () => bin
    const ev = (type: string, x: number) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 })
    screen.getByRole('button', { name: 'apple' }).dispatchEvent(ev('pointerdown', 0))
    window.dispatchEvent(ev('pointermove', 60))
    window.dispatchEvent(ev('pointerup', 60))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'apple' })).not.toBeInTheDocument())
    expect(onWrong).not.toHaveBeenCalled()
    document.elementFromPoint = original
  })
})

describe('SequenceTemplate', () => {
  it('tiles still work by tapping, in order', async () => {
    const seq: SequenceItem = { id: 's', skill: 'num.order', difficulty: 1, say: { en: 'Put in order' }, steps: [1, 2, 3].map((value) => ({ kind: 'numeral' as const, value })) }
    const onCorrect = vi.fn()
    const onWrong = vi.fn()
    render(<SequenceTemplate item={seq} lang="en" hintLevel={0} locked={false} onCorrect={onCorrect} onWrong={onWrong} rng={seededRng(5)} />)
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByTestId('choice-answer'))
    expect(onCorrect).toHaveBeenCalledTimes(1)
    expect(onWrong).not.toHaveBeenCalled()
  })
})

describe('SpeakTemplate', () => {
  it('without the microphone: shows the word and "I said it!" (never a wrong answer)', async () => {
    const speak: SpeakItem = { id: 'cat', skill: 'speak.cat', difficulty: 1, say: { en: "Let's say: cat!" }, word: 'cat' }
    const onCorrect = vi.fn()
    const onWrong = vi.fn()
    render(
      <AppStateProvider>
        <SpeakTemplate item={speak} lang="en" hintLevel={0} locked={false} onCorrect={onCorrect} onWrong={onWrong} rng={seededRng(1)} />
      </AppStateProvider>,
    )
    expect(await screen.findByTestId('speak-word')).toHaveTextContent('cat')
    await userEvent.click(screen.getByTestId('choice-answer'))
    expect(onCorrect).toHaveBeenCalledWith('cat', 0.5)
    expect(onWrong).not.toHaveBeenCalled()
  })
})

describe('pre-writing strokes', () => {
  it('directional strokes start on the right for Arabic', () => {
    expect(strokeStart(STROKES.hline, false)[0]).toBeLessThan(240)
    expect(strokeStart(STROKES.hline, true)[0]).toBeGreaterThan(240)
    expect(strokeStart(STROKES.vline, true)).toEqual(STROKES.vline.start) // not mirrored
  })

  it('content has a finger-paths activity covering every stroke', () => {
    const a = content.activities.find((x) => x.id === 'finger-paths')
    expect(a?.template).toBe('trace')
    expect(new Set(a?.items.map((i) => (i as { stroke?: string }).stroke))).toEqual(new Set(Object.keys(STROKES)))
  })
})
