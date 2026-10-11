import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { content } from '../../../content/loader'
import type { SyllablesItem } from '../../../content/schemas'
import { seededRng } from '../../../domain/rng'
import { dict } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { numberWord } from '../../common'
import { SyllablesTemplate, clapChoices } from './SyllablesTemplate'

const duck: SyllablesItem = { id: 'duck', skill: 'syllables.duck', difficulty: 1, word: 'duck', parts: ['بَطْ', 'طَة'], say: { ar: 'هَيَّا نُصَفِّقُ لِكُلِّ جُزْءٍ: بَطْ… طَة!' } }

function setup(over: Partial<Parameters<typeof SyllablesTemplate>[0]> = {}) {
  const onCorrect = vi.fn()
  const onWrong = vi.fn()
  const onInstruction = vi.fn()
  const props = { item: duck, lang: 'ar' as const, hintLevel: 0, locked: false, onCorrect, onWrong, onInstruction, rng: seededRng(1), ...over }
  const view = render(<SyllablesTemplate {...props} />)
  return { onCorrect, onWrong, onInstruction, props, view }
}

const litParts = () => screen.getAllByRole('listitem').filter((el) => el.dataset.lit === 'true').map((el) => el.textContent)

describe('SyllablesTemplate', () => {
  it('each drum tap lights the next part; then the child says how many claps', async () => {
    const { onCorrect, onWrong, onInstruction } = setup()
    expect(screen.getAllByRole('listitem').map((el) => el.textContent)).toEqual(['بَطْ', 'طَة'])
    expect(litParts()).toEqual([])
    expect(screen.queryByTestId('choice-answer')).toBeNull() // numbers come after clapping

    const drum = screen.getByRole('button', { name: dict('ar').syllables.drum })
    await userEvent.click(drum)
    expect(litParts()).toEqual(['بَطْ'])
    await userEvent.click(drum)
    expect(litParts()).toEqual(['بَطْ', 'طَة'])
    expect(onInstruction).toHaveBeenCalledWith(dict('ar').voice.clapHowMany)

    await userEvent.click(screen.getByRole('button', { name: numberWord(2, 'ar') }))
    expect(onCorrect).toHaveBeenCalledWith('بَطَّة')
    expect(onWrong).not.toHaveBeenCalled()
  })

  it('a wrong count gets the gentle try-again, and a hint claps the parts again slowly', async () => {
    const { onWrong, onCorrect, props, view } = setup()
    const drum = screen.getByTestId('syllables-drum')
    await userEvent.click(drum)
    await userEvent.click(drum)
    const three = screen.getByRole('button', { name: numberWord(3, 'ar') })
    await userEvent.click(three)
    expect(onWrong).toHaveBeenCalledTimes(1)
    expect(onCorrect).not.toHaveBeenCalled()
    expect(three).toHaveAttribute('aria-disabled', 'true')

    view.rerender(<SyllablesTemplate {...props} hintLevel={1} />)
    await waitFor(() => expect(litParts().length).toBeLessThan(2)) // starts over
    await waitFor(() => expect(litParts()).toEqual(['بَطْ', 'طَة']), { timeout: 4000 })
    await userEvent.click(screen.getByRole('button', { name: numberWord(2, 'ar') }))
    expect(onCorrect).toHaveBeenCalledWith('بَطَّة')
  })

  it('the hint demo shows its line in the caption and stops once the child answers', async () => {
    const { onCorrect, onInstruction, props, view } = setup()
    const drum = screen.getByTestId('syllables-drum')
    await userEvent.click(drum)
    await userEvent.click(drum)
    await userEvent.click(screen.getByRole('button', { name: numberWord(3, 'ar') }))

    const speak = vi.spyOn(audio, 'speak')
    const sfx = vi.spyOn(audio, 'sfx')
    onInstruction.mockClear()
    view.rerender(<SyllablesTemplate {...props} hintLevel={1} />)
    expect(onInstruction).toHaveBeenCalledWith(dict('ar').voice.clapTogether) // voice off: the grown-up reads it
    await waitFor(() => expect(litParts().length).toBeLessThan(2))

    await userEvent.click(screen.getByRole('button', { name: numberWord(2, 'ar') }))
    expect(onCorrect).toHaveBeenCalledWith('بَطَّة')
    speak.mockClear()
    sfx.mockClear()
    onInstruction.mockClear()
    await new Promise((r) => setTimeout(r, 2500))
    expect(speak).not.toHaveBeenCalled()
    expect(sfx).not.toHaveBeenCalledWith('pop')
    expect(onInstruction).not.toHaveBeenCalled()
    speak.mockRestore()
    sfx.mockRestore()
  })

  it('one-part words count as one clap (English)', async () => {
    const sun: SyllablesItem = { id: 'sun', skill: 'syllables.sun', difficulty: 1, word: 'sun', parts: ['sun'], say: { en: 'Let’s clap each part: sun!' } }
    const { onCorrect } = setup({ item: sun, lang: 'en' })
    await userEvent.click(screen.getByTestId('syllables-drum'))
    await userEvent.click(screen.getByRole('button', { name: numberWord(1, 'en') }))
    expect(onCorrect).toHaveBeenCalledWith('sun')
  })

  it('offers 1–4 (or fewer for the youngest), always with the answer', () => {
    expect(clapChoices({ parts: ['a', 'b'] }, 4)).toEqual([1, 2, 3, 4])
    expect(clapChoices({ parts: ['a', 'b', 'c', 'd'] }, 3)).toEqual([2, 3, 4])
    expect(clapChoices({ parts: ['a'] }, 3)).toEqual([1, 2, 3])
    expect(clapChoices({ parts: ['a', 'b'], choices: [1, 2] }, 4)).toEqual([1, 2])
  })

  it('the clapping activities mix one- to four-part words in both languages', () => {
    for (const id of ['ar-syllables', 'en-syllables']) {
      const a = content.activities.find((x) => x.id === id)
      expect(a?.template, id).toBe('syllables')
      if (a?.template !== 'syllables') continue
      expect(a.items).toHaveLength(12)
      expect(new Set(a.items.map((i) => i.parts.length))).toEqual(new Set([1, 2, 3, 4]))
    }
  })
})
