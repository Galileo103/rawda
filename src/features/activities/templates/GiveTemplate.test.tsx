import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { activityById } from '../../../content/loader'
import type { GiveItem } from '../../../content/schemas'
import { seededRng } from '../../../domain/rng'
import { audio } from '../../../services/audio/AudioService'
import { numberWord, voice } from '../../common'
import { itemSay } from '../itemSay'
import { GiveTemplate } from './GiveTemplate'

const three: GiveItem = {
  id: 'apple-3',
  skill: 'num.give.3',
  difficulty: 2,
  object: 'apple',
  n: 3,
  have: 5,
  say: { ar: 'هَيَّا نَضَعُ ثَلَاثَ تُفَّاحَاتٍ فِي الطَّبَقِ.', en: 'Give me three apples.' },
  ask: { ar: { m: 'أَعْطِنِي ثَلَاثَ تُفَّاحَاتٍ.', f: 'أَعْطِينِي ثَلَاثَ تُفَّاحَاتٍ.' } },
}

const setup = (hintLevel = 0) => {
  const onCorrect = vi.fn()
  const onWrong = vi.fn()
  const utils = render(<GiveTemplate item={three} lang="en" hintLevel={hintLevel} locked={false} onCorrect={onCorrect} onWrong={onWrong} rng={seededRng(1)} />)
  return { onCorrect, onWrong, ...utils }
}
const pile = () => screen.queryAllByTestId('pile-obj')
const plate = () => screen.queryAllByTestId('plate-obj')

describe('GiveTemplate ("give me N")', () => {
  it('starts with the whole pile and an empty plate', () => {
    setup()
    expect(pile()).toHaveLength(5)
    expect(plate()).toHaveLength(0)
  })

  it('tapping moves an object to the plate with its count; tapping it there moves it back', async () => {
    setup()
    await userEvent.click(pile()[0]!)
    await userEvent.click(pile()[0]!)
    expect(plate()).toHaveLength(2)
    expect(plate()[1]).toHaveTextContent('2')
    await userEvent.click(plate()[0]!)
    expect(plate()).toHaveLength(1)
    expect(plate()[0]).toHaveTextContent('1')
    expect(pile()).toHaveLength(4)
  })

  it('done with exactly n is correct and says the number', async () => {
    const { onCorrect, onWrong } = setup()
    for (let k = 0; k < 3; k++) await userEvent.click(pile()[0]!)
    await userEvent.click(screen.getByTestId('give-done'))
    expect(onCorrect).toHaveBeenCalledWith('three')
    expect(onWrong).not.toHaveBeenCalled()
  })

  it('a wrong count is gentle: onWrong, and the plate stays as it is to fix', async () => {
    const { onCorrect, onWrong } = setup()
    for (let k = 0; k < 4; k++) await userEvent.click(pile()[0]!)
    await userEvent.click(screen.getByTestId('give-done'))
    expect(onWrong).toHaveBeenCalledTimes(1)
    expect(plate()).toHaveLength(4)
    await userEvent.click(plate()[3]!) // take one back
    await userEvent.click(screen.getByTestId('give-done'))
    expect(onCorrect).toHaveBeenCalledTimes(1)
  })

  it('at hint 3 the extra ones on the plate glow, or the missing ones in the pile', async () => {
    const { rerender } = setup()
    for (let k = 0; k < 4; k++) await userEvent.click(pile()[0]!)
    const props = { item: three, lang: 'en' as const, locked: false, onCorrect: vi.fn(), onWrong: vi.fn(), rng: seededRng(1) }
    rerender(<GiveTemplate {...props} hintLevel={3} />)
    const glowing = (els: HTMLElement[]) => els.filter((el) => /demo/.test(el.className)).length
    expect(glowing(plate())).toBe(1)
    expect(glowing(pile())).toBe(0)
    await userEvent.click(plate()[3]!)
    await userEvent.click(plate()[2]!)
    expect(glowing(plate())).toBe(0)
    expect(glowing(pile())).toBe(1)
  })

  it('at hint 1 Hala counts the plate aloud with a moving highlight, and stops when the plate changes', async () => {
    const speak = vi.spyOn(audio, 'speak')
    const { rerender } = setup()
    fireEvent.click(pile()[0]!)
    fireEvent.click(pile()[0]!)
    speak.mockClear()
    const props = { item: three, lang: 'en' as const, locked: false, onCorrect: vi.fn(), onWrong: vi.fn(), rng: seededRng(1) }
    rerender(<GiveTemplate {...props} hintLevel={1} />)
    const counted = () => plate().findIndex((el) => /counting/.test(el.className))
    await waitFor(() => expect(counted()).toBe(0), { timeout: 3000 })
    await waitFor(() => expect(counted()).toBe(1), { timeout: 3000 })
    const said = speak.mock.calls.map((c) => c[0])
    expect(said.indexOf(numberWord(1, 'en'))).toBeLessThan(said.indexOf(numberWord(2, 'en')))
    expect(said.indexOf(numberWord(1, 'en'))).toBeGreaterThanOrEqual(0)
    fireEvent.click(plate()[0]!) // the plate changes partway: the highlight clears
    expect(counted()).toBe(-1)
    speak.mockRestore()
  })

  it('counts the plate again after every wrong "Done", also once the hint level is capped', async () => {
    const speak = vi.spyOn(audio, 'speak')
    const onWrong = vi.fn()
    render(<GiveTemplate item={three} lang="en" hintLevel={3} locked={false} onCorrect={vi.fn()} onWrong={onWrong} rng={seededRng(1)} />)
    const counts = () => speak.mock.calls.filter((c) => c[0] === voice('en').countTogether).length
    fireEvent.click(pile()[0]!)
    await waitFor(() => expect(counts()).toBe(1), { timeout: 3000 }) // hint 3 from the start
    await waitFor(() => expect(plate().some((el) => /counting/.test(el.className))).toBe(false), { timeout: 3000 })
    for (const n of [2, 3]) {
      fireEvent.click(screen.getByTestId('give-done'))
      await waitFor(() => expect(plate().some((el) => /counting/.test(el.className))).toBe(true), { timeout: 3000 })
      expect(counts()).toBe(n)
      await waitFor(() => expect(plate().some((el) => /counting/.test(el.className))).toBe(false), { timeout: 3000 })
    }
    expect(onWrong).toHaveBeenCalledTimes(2)
    speak.mockRestore()
  })

  it('dragging an object onto the plate places it', async () => {
    setup()
    const target = screen.getByTestId('plate')
    const original = document.elementFromPoint
    document.elementFromPoint = () => target
    const ev = (type: string, x: number) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 })
    pile()[0]!.dispatchEvent(ev('pointerdown', 0))
    window.dispatchEvent(ev('pointermove', 60))
    window.dispatchEvent(ev('pointerup', 60))
    await waitFor(() => expect(plate()).toHaveLength(1))
    document.elementFromPoint = original
  })
})

describe('give instructions', () => {
  it('speak to a boy or a girl, and use the neutral line until the parent has said which', () => {
    expect(itemSay(three, 'ar', 'm')).toBe('أَعْطِنِي ثَلَاثَ تُفَّاحَاتٍ.')
    expect(itemSay(three, 'ar', 'f')).toBe('أَعْطِينِي ثَلَاثَ تُفَّاحَاتٍ.')
    expect(itemSay(three, 'ar', undefined)).toBe('هَيَّا نَضَعُ ثَلَاثَ تُفَّاحَاتٍ فِي الطَّبَقِ.')
    expect(itemSay(three, 'en', 'f')).toBe('Give me three apples.')
  })

  it('the activity asks for n of a pile with room to choose, rising in difficulty with n', () => {
    const a = activityById('give-me')
    expect(a?.template).toBe('give')
    if (a?.template !== 'give') return
    for (const i of a.items) {
      expect(i.have).toBeGreaterThanOrEqual(Math.min(i.n + 2, 10))
      expect(i.ask?.ar).toBeTruthy()
    }
    const byN = [...a.items].sort((x, y) => x.n - y.n)
    for (let k = 1; k < byN.length; k++) expect(byN[k]!.difficulty).toBeGreaterThanOrEqual(byN[k - 1]!.difficulty)
  })
})
