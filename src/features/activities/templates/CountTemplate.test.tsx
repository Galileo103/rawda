import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CountItemZ, type CountItem } from '../../../content/schemas'
import { seededRng } from '../../../domain/rng'
import { CountTemplate, DICE_SPOTS } from './CountTemplate'

const quick = (count: number, flashMs?: number): CountItem => ({
  id: `ql-${count}`,
  skill: `num.subitize.${count}`,
  difficulty: 1,
  object: 'apple',
  count,
  layout: 'dice',
  flashMs,
  say: { en: 'How many apples were there?' },
})

function renderDice(item: CountItem, over: { onHelp?: () => void; hintLevel?: number } = {}) {
  const onCorrect = vi.fn()
  const onWrong = vi.fn()
  const view = render(<CountTemplate item={item} lang="en" hintLevel={over.hintLevel ?? 0} locked={false} onCorrect={onCorrect} onWrong={onWrong} onHelp={over.onHelp} rng={seededRng(3)} />)
  return { onCorrect, onWrong, ...view }
}

describe('CountTemplate dice layout (quick look)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('has standard dice positions for 1–6, each spot distinct and inside a 3×3 grid', () => {
    for (let n = 1; n <= 6; n++) {
      const spots = DICE_SPOTS[n]!
      expect(spots).toHaveLength(n)
      expect(new Set(spots.map(([r, c]) => `${r},${c}`)).size).toBe(n)
      for (const [r, c] of spots) {
        expect(r).toBeGreaterThanOrEqual(1)
        expect(c).toBeLessThanOrEqual(3)
      }
    }
    // Odd counts use the centre; even counts never do.
    expect(DICE_SPOTS[5]).toContainEqual([2, 2])
    expect(DICE_SPOTS[4]).not.toContainEqual([2, 2])
  })

  it('places the objects in dice spots with no tap-to-count buttons', () => {
    renderDice(quick(5))
    const spots = screen.getAllByRole('img', { name: 'apple' })
    expect(spots).toHaveLength(5)
    expect(spots.map((el) => `${el.style.gridRow},${el.style.gridColumn}`)).toEqual(DICE_SPOTS[5]!.map(([r, c]) => `${r},${c}`))
    expect(screen.queryByRole('button', { name: 'apple' })).toBeNull()
  })

  it('starts covered; the first look is free and does not ask for help', () => {
    const onHelp = vi.fn()
    renderDice(quick(4, 1500), { onHelp })
    const dice = screen.getByTestId('dice')
    act(() => void vi.advanceTimersByTime(5000))
    expect(dice).toHaveAttribute('data-covered', 'true')
    expect(screen.queryByRole('button', { name: /peek again/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /let’s look/i }))
    expect(onHelp).not.toHaveBeenCalled()
    expect(dice).toHaveAttribute('data-covered', 'false')
    act(() => void vi.advanceTimersByTime(1500))
    expect(dice).toHaveAttribute('data-covered', 'true')
  })

  it('covers the objects after flashMs; "peek again" re-shows them and asks for help', () => {
    const onHelp = vi.fn()
    renderDice(quick(4, 1500), { onHelp })
    const dice = screen.getByTestId('dice')
    fireEvent.click(screen.getByRole('button', { name: /let’s look/i }))
    expect(dice).toHaveAttribute('data-covered', 'false')
    expect(screen.queryByRole('button', { name: /peek again/i })).toBeNull()

    act(() => void vi.advanceTimersByTime(1500))
    expect(dice).toHaveAttribute('data-covered', 'true')

    fireEvent.click(screen.getByRole('button', { name: /peek again/i }))
    expect(onHelp).toHaveBeenCalledTimes(1)
    expect(dice).toHaveAttribute('data-covered', 'false')
    act(() => void vi.advanceTimersByTime(1500))
    expect(dice).toHaveAttribute('data-covered', 'true')
  })

  it('peeks again when the help level rises (a miss or the help button)', () => {
    const item = quick(3, 2000)
    const { rerender } = renderDice(item)
    act(() => void vi.advanceTimersByTime(2000))
    expect(screen.getByTestId('dice')).toHaveAttribute('data-covered', 'true')
    rerender(<CountTemplate item={item} lang="en" hintLevel={1} locked={false} onCorrect={vi.fn()} onWrong={vi.fn()} rng={seededRng(3)} />)
    expect(screen.getByTestId('dice')).toHaveAttribute('data-covered', 'false')
  })

  it('accepts the numeral while covered and reveals the objects when solved', () => {
    const { onCorrect, onWrong } = renderDice(quick(3, 2000))
    act(() => void vi.advanceTimersByTime(2000))
    fireEvent.click(screen.getByRole('button', { name: 'three' }))
    expect(onCorrect).toHaveBeenCalledWith('three')
    expect(onWrong).not.toHaveBeenCalled()
    expect(screen.getByTestId('dice')).toHaveAttribute('data-covered', 'false')
  })

  it('without flashMs the dice stay visible and there is no cover', () => {
    renderDice(quick(2))
    act(() => void vi.advanceTimersByTime(10000))
    expect(screen.getByTestId('dice')).toHaveAttribute('data-covered', 'false')
    expect(screen.queryByRole('button', { name: /peek again/i })).toBeNull()
  })
})

describe('CountItem schema (dice)', () => {
  const base = { id: 'x', skill: 'num.subitize.3', difficulty: 1, object: 'apple', say: { en: 'How many?' } }
  it('allows dice up to 6 and flashMs only with dice', () => {
    expect(CountItemZ.safeParse({ ...base, count: 6, layout: 'dice', flashMs: 1500 }).success).toBe(true)
    expect(CountItemZ.safeParse({ ...base, count: 7, layout: 'dice' }).success).toBe(false)
    expect(CountItemZ.safeParse({ ...base, count: 3, flashMs: 1500 }).success).toBe(false)
  })
})
