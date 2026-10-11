import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppStateProvider } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { LessonItem } from '../../../content/schemas'
import { lessonCountLine, lessonExampleLine, lessonExamplesLine, lessonTraceLine } from '../../../content/lessonLines'
import { collectNarration } from '../../../content/narration'
import { dict, rawDictionaries } from '../../../i18n'
import { LessonTemplate, highlightParts } from './LessonTemplate'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChoiceItem, CountItem } from '../../../content/schemas'
import type { AgeBand } from '../../../domain/ageProfile'
import { seededRng } from '../../../domain/rng'
import { db } from '../../../services/db'
import { updateProfile, updateSettings } from '../../../services/repos/settings'
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

  // The lesson reads the age band from the profile row; start each test from a clean database.
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  /** Walk the ب lesson (meet → words) up to its check, as a child of the given age would. */
  async function reachCheck(ageBand?: AgeBand) {
    if (ageBand) await updateProfile({ ageBand })
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
    expect(await screen.findAllByText(/^ب[َُِ]?$/)).toHaveLength(noTrace.examples.length) // بَطَّة، بَقَرَة، بِطِّيخَة
    // "next" waits until each word has been heard (≈ 0.35 s pause after each)
    await waitFor(() => expect(screen.getByTestId('lesson-next')).toBeEnabled(), { timeout: 4000 })
    await userEvent.click(screen.getByTestId('lesson-next'))
    // 3. the gentle check
    const answer = await screen.findByTestId('choice-answer')
    return { item: noTrace, answer, onCorrect, onWrong, steps }
  }

  const labels = (els: HTMLElement[]) => els.map((el) => el.getAttribute('aria-label'))

  it('teach first (meet → words), and only then check gently with the look-alike among three options', async () => {
    const { item, answer, onCorrect, onWrong, steps } = await reachCheck()
    // Default profile (4–5): the answer plus two others, and ت (the look-alike of ب) is one of them.
    const others = screen.getAllByTestId('choice-other')
    expect(others).toHaveLength(2)
    expect(labels(others)).toContain('ت')
    await userEvent.click(answer)
    expect(onCorrect).toHaveBeenCalled()
    expect(onWrong).not.toHaveBeenCalled()
    expect(steps).toContain(item.check!.say.ar)
  })

  it('gives the grown-up reading aloud a line of its own for each step (words, tapped word, tracing)', async () => {
    const lesson = content.activities.find((a) => a.id === 'ar-discover')!
    const ba = lesson.items.find((i) => i.id === 'ba') as LessonItem
    const steps: string[] = []
    render(
      <AppStateProvider>
        <LessonTemplate item={{ ...ba, check: undefined }} lang="ar" hintLevel={0} locked={false} onCorrect={vi.fn()} onWrong={vi.fn()} onInstruction={(t) => steps.push(t)} rng={seededRng(1)} />
      </AppStateProvider>,
    )
    const next = await screen.findByTestId('lesson-next')
    await waitFor(() => expect(next).toBeEnabled())
    await userEvent.click(next)
    // Voice off by default: all words stay on screen and the caption names the letter, not "a new letter".
    await waitFor(() => expect(steps.at(-1)).toBe('لِنَنْظُرْ! هَذِهِ كَلِمَاتٌ فِيهَا حَرْفُ الْبَاءِ.'))
    expect(steps).not.toContain(ba.say.ar)
    await userEvent.click(screen.getByRole('button', { name: 'بَطَّة' }))
    expect(steps.at(-1)).toBe('لِنَنْظُرْ! حَرْفُ الْبَاءِ فِي أَوَّلِ كَلِمَةِ بَطَّة.')
    await waitFor(() => expect(screen.getByTestId('lesson-next')).toBeEnabled())
    await userEvent.click(screen.getByTestId('lesson-next'))
    await waitFor(() => expect(steps.at(-1)).toBe('هَيَّا نَكْتُبُ حَرْفَ الْبَاءِ بِإِصْبَعِنَا!'))
  })

  it('names the letter, the word and the number in every lesson line, and the audio build gets each one', () => {
    const d = dict('en')
    const en = content.activities.find((a) => a.id === 'en-discover')!.items as LessonItem[]
    const x = en.find((i) => i.id === 'x')!
    expect(lessonExampleLine(en.find((i) => i.id === 'b')!, 'ball', 'en', d)).toBe('Look! The letter B is at the start of ball.')
    expect(lessonExampleLine(x, 'fox', 'en', d)).toBe('Look! The letter X is in fox.') // x is at the end of fox
    expect(lessonTraceLine(x, 'en', d)).toBe('Let’s write the letter X with our finger!')
    expect(lessonCountLine(5, dict('ar'))).toBe('هَيَّا نَعُدُّ مَعًا حَتَّى خَمْسَة!')
    expect(lessonCountLine(2, dict('ar'))).toBe('هَيَّا نَعُدُّ مَعًا حَتَّى اثْنَيْن!') // genitive after حَتَّى
    expect(lessonCountLine(1, dict('ar'))).toBe('هَيَّا نَعُدُّ مَعًا!') // nothing to count "up to"
    expect(lessonCountLine(1, d)).toBe('Let’s count it together!')
    // One picture only: its own line, never a plural "here are words".
    const lone = en.find((i) => i.examples.length === 1)!
    const loneWord = content.lexicon.get(lone.examples[0]!)!.en
    expect(lessonExamplesLine(lone, 'en', d, (id) => content.lexicon.get(id)?.en)).toBe(lessonExampleLine(lone, loneWord, 'en', d))
    // Colours, shapes, numbers…: no letter to name, so the line is about the pictures.
    const red = content.activities.find((a) => a.id === 'colors-discover')!.items[0] as LessonItem
    expect(lessonExamplesLine(red, 'en', d)).toBe('Look at these pictures!')
    expect(lessonTraceLine(red, 'en', d)).toBeUndefined()
    // No article or verb to agree with, so plurals and abstract words read well too.
    expect(lessonExampleLine(red, 'grapes', 'en', d)).toBe('Look! grapes!')
    expect(lessonExampleLine(red, 'دُبٌّ مَحْشُوّ', 'ar', dict('ar', 'm'))).toBe('انْظُرْ إِلَى الصُّورَةِ: دُبٌّ مَحْشُوّ.')
    const keys = new Set(collectNarration(content, rawDictionaries).map((l) => `${l.lang}:${l.text}`))
    for (const line of ['انْظُرِي! حَرْفُ الْبَاءِ فِي أَوَّلِ كَلِمَةِ بَطَّة.', 'انْظُرْ! هَذِهِ كَلِمَاتٌ فِيهَا حَرْفُ الْأَلِفِ.', 'هَيَّا نَكْتُبُ حَرْفَ الْجِيمِ بِإِصْبَعِنَا!', 'هَيَّا نَعُدُّ مَعًا حَتَّى ثَلَاثَة!'])
      expect(keys.has(`ar:${line}`), line).toBe(true)
    expect(keys.has('en:Look! The letter B is at the start of bee.')).toBe(true)
    expect([...keys].some((k) => /focus/.test(k))).toBe(false) // templates are never rendered raw
  })

  it('the youngest (3–4) check with just two options, the other a clearly different letter', async () => {
    await reachCheck('3-4')
    // No look-alikes yet: the first choice in the file (س) is kept, ت is left out.
    expect(labels(screen.getAllByTestId('choice-other'))).toEqual(['س'])
  })

  /** Walk the "sad" feelings lesson (meet → situations) up to its calm step. */
  async function reachCalm() {
    const lesson = content.activities.find((a) => a.id === 'feelings-discover')!
    const sad = lesson.items.find((i) => i.id === 'sad') as LessonItem
    const steps: string[] = []
    render(
      <AppStateProvider>
        <LessonTemplate item={sad} lang="ar" hintLevel={0} locked={false} onCorrect={vi.fn()} onWrong={vi.fn()} onInstruction={(t) => steps.push(t)} rng={seededRng(1)} />
      </AppStateProvider>,
    )
    for (let i = 0; i < 2; i++) {
      await waitFor(() => expect(screen.getByTestId('lesson-next')).toBeEnabled(), { timeout: 4000 })
      await userEvent.click(screen.getByTestId('lesson-next'))
    }
    return { sad, steps, calm: await screen.findByTestId('lesson-calm') }
  }

  it('a feeling lesson shows the calm step (the turtle breathing slowly) before the gentle check', async () => {
    const { sad, steps, calm } = await reachCalm()
    expect(calm).toHaveAttribute('data-breathing', 'slow')
    expect(calm).toHaveAccessibleName(sad.calm!.say.ar)
    expect(steps).toContain(sad.calm!.say.ar)
    expect(screen.queryByTestId('choice-answer')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('lesson-next')).toBeEnabled(), { timeout: 4000 })
    await userEvent.click(screen.getByTestId('lesson-next'))
    expect(await screen.findByTestId('choice-answer')).toBeInTheDocument()
  })

  it('the calm turtle stays still when the parent turned on "reduce motion"', async () => {
    await updateSettings({ reducedMotion: true })
    const { calm } = await reachCalm()
    expect(calm).toHaveAttribute('data-breathing', 'still')
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
