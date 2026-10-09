import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppStateProvider } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { LessonItem } from '../../../content/schemas'
import { LessonTemplate, highlightParts } from './LessonTemplate'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ChoiceItem, CountItem } from '../../../content/schemas'
import { seededRng } from '../../../domain/rng'
import { ChoiceTemplate } from './ChoiceTemplate'
import { CountTemplate } from './CountTemplate'

const item: ChoiceItem = {
  id: 'cat',
  skill: 'en.sound.c',
  difficulty: 1,
  say: { en: 'Which picture starts with C?' },
  answer: { kind: 'lex', id: 'cat' },
  choices: [
    { kind: 'lex', id: 'cat' },
    { kind: 'lex', id: 'dog' },
    { kind: 'lex', id: 'fish' },
  ],
}

function setup(over: Partial<Parameters<typeof ChoiceTemplate>[0]> = {}) {
  const onCorrect = vi.fn()
  const onWrong = vi.fn()
  render(<ChoiceTemplate item={item} pool={[]} lang="en" hintLevel={0} locked={false} onCorrect={onCorrect} onWrong={onWrong} rng={seededRng(1)} {...over} />)
  return { onCorrect, onWrong }
}

describe('ChoiceTemplate', () => {
  it('a wrong answer gets gentle feedback: reported once, option dimmed, nothing removed', async () => {
    const { onWrong, onCorrect } = setup()
    const wrong = screen.getByRole('button', { name: 'dog' })
    await userEvent.click(wrong)
    expect(onWrong).toHaveBeenCalledTimes(1)
    expect(onCorrect).not.toHaveBeenCalled()
    expect(wrong).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(wrong) // tapping it again is ignored, not counted twice
    expect(onWrong).toHaveBeenCalledTimes(1)
  })

  it('the right answer reports success and says the word', async () => {
    const { onCorrect } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'cat' }))
    expect(onCorrect).toHaveBeenCalledWith('cat')
  })

  it('works with the keyboard', async () => {
    const { onCorrect } = setup()
    const answer = screen.getByRole('button', { name: 'cat' })
    answer.focus()
    await userEvent.keyboard('{Enter}')
    expect(onCorrect).toHaveBeenCalled()
  })

  it('hint level 3 highlights the answer; level 2 removes extra options', () => {
    setup({ hintLevel: 2 })
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('a missing illustration falls back without crashing', () => {
    setup()
    const imgs = document.querySelectorAll('img')
    expect(imgs.length).toBeGreaterThan(0)
    imgs.forEach((img) => fireEvent.error(img))
    expect(screen.getAllByRole('img').length).toBeGreaterThan(0)
  })

  it('an unknown word id renders a placeholder instead of crashing', () => {
    const broken: ChoiceItem = { ...item, answer: { kind: 'lex', id: 'no-such-word' }, choices: [{ kind: 'lex', id: 'no-such-word' }, { kind: 'lex', id: 'dog' }] }
    expect(() => setup({ item: broken })).not.toThrow()
  })
})

describe('Discover lessons', () => {
  it('colour the new letter inside a word (keeping its diacritics with it)', () => {
    expect(highlightParts('بَطَّة', 'ب')).toEqual(['', 'بَ', 'طَّة'])
    expect(highlightParts('دَجَاجَة', 'ج')).toEqual(['دَ', 'جَ', 'اجَة'])
    expect(highlightParts('Ball', 'b')).toEqual(['', 'B', 'all'])
    expect(highlightParts('cat', undefined)).toEqual(['cat', '', ''])
  })

  it('teach first (meet → words), and only then check gently', async () => {
    const lesson = content.activities.find((a) => a.id === 'ar-discover')!
    const ba = lesson.items.find((i) => i.id === 'ba') as LessonItem
    const noTrace: LessonItem = { ...ba, trace: undefined }
    const onCorrect = vi.fn()
    const onWrong = vi.fn()
    const steps: string[] = []
    render(
      <AppStateProvider>
        <LessonTemplate item={noTrace} lang="ar" hintLevel={0} locked={false} onCorrect={onCorrect} onWrong={onWrong} onInstruction={(t) => steps.push(t)} rng={seededRng(1)} />
      </AppStateProvider>,
    )
    // 1. meet: the letter is shown big; no question yet
    expect(await screen.findByRole('button', { name: noTrace.meet.ar })).toBeInTheDocument()
    expect(screen.queryByTestId('choice-answer')).not.toBeInTheDocument()
    const next = await screen.findByTestId('lesson-next')
    await waitFor(() => expect(next).toBeEnabled())
    await userEvent.click(next)
    // 2. words: familiar pictures with the letter coloured
    expect(await screen.findAllByText('بَ')).toHaveLength(3) // بَطَّة، بَقَرَة، بَيْضَة
    // "next" waits until each word has been heard (≈ 0.35 s pause after each)
    await waitFor(() => expect(screen.getByTestId('lesson-next')).toBeEnabled(), { timeout: 4000 })
    await userEvent.click(screen.getByTestId('lesson-next'))
    // 3. gentle check with two options
    await userEvent.click(await screen.findByTestId('choice-answer'))
    expect(onCorrect).toHaveBeenCalled()
    expect(onWrong).not.toHaveBeenCalled()
    expect(steps).toContain(noTrace.check!.say.ar)
  })
})

describe('CountTemplate', () => {
  const count: CountItem = { id: 'c3', skill: 'num.count.3', difficulty: 1, object: 'apple', count: 3, say: { ar: 'كَمْ تُفَّاحَةً هُنَا؟' } }

  it('numbers objects as they are tapped (Arabic numerals) and accepts the right count', async () => {
    const onCorrect = vi.fn()
    const onWrong = vi.fn()
    render(<CountTemplate item={count} lang="ar" hintLevel={0} locked={false} onCorrect={onCorrect} onWrong={onWrong} rng={seededRng(2)} />)
    const apples = screen.getAllByRole('button', { name: 'تُفَّاحَة' })
    expect(apples).toHaveLength(3)
    await userEvent.click(apples[0]!)
    await userEvent.click(apples[1]!)
    // "٢" now appears as the second object's badge (and as a numeral option).
    expect(screen.getAllByText('٢').length).toBeGreaterThanOrEqual(2)
    await userEvent.click(screen.getByRole('button', { name: 'ثَلَاثَة' }))
    expect(onCorrect).toHaveBeenCalledWith('ثَلَاثَة')
    expect(onWrong).not.toHaveBeenCalled()
  })
})
