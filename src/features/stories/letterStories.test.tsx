import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { content } from '../../content/loader'
import type { StoryDef } from '../../content/schemas'
import { dictionaries } from '../../i18n'
import { db } from '../../services/db'
import { hashPin } from '../../services/parentGate'
import { recordItemResult } from '../../services/repos/progress'
import { updateSettings } from '../../services/repos/settings'
import { CompletionView } from '../activities/CompletionView'
import { richText } from './StoryReader'

/** Fixture letter stories linked to lessons the real letter stories don't use (hha, kha). */
const fixture = (id: string, itemId: string, title: string): StoryDef => ({
  id,
  title: { ar: title, en: title },
  theme: 'letters',
  cover: { kind: 'lex', id: 'cat' },
  level: 1,
  personalized: false,
  letter: { activityId: 'ar-discover', itemId },
  pages: [{ scene: { bg: 'meadow', actors: [] }, text: { ar: 'رَأَيْنَا {قِطَّةً}.', en: 'We saw a {cat}.' }, vocab: ['cat'] }],
  questions: [],
})
const added = [fixture('test-letter-hha', 'hha', 'قِصَّةُ اخْتِبَارِ الْحَاءِ'), fixture('test-letter-kha', 'kha', 'قِصَّةُ اخْتِبَارِ الْخَاءِ')]

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.location.hash = '#/'
  vi.restoreAllMocks()
  content.stories.push(...added)
  await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') })
})
afterEach(() => {
  for (const s of added) content.stories.splice(content.stories.indexOf(s), 1)
})

describe('story text in a letter story', () => {
  it('colours the lesson letter inside highlighted words only', () => {
    render(<p>{richText('رَأَى بَابًا وَ{بَطَّةً} هُنَا', 'ب')}</p>)
    const letters = screen.getAllByTestId('story-letter')
    expect(letters).toHaveLength(1)
    expect(letters[0]).toHaveTextContent('بَ')
    expect(letters[0]!.closest('mark')).toHaveTextContent('بَطَّةً')
  })

  it('a lesson with several letter forms (أ and إ) colours whichever the word has', () => {
    render(<p>{richText('{إِبْرِيقٌ} وَ{أَرْنَبٌ}', ['أ', 'إ'])}</p>)
    expect(screen.getAllByTestId('story-letter').map((e) => e.textContent)).toEqual(['إِ', 'أَ'])
  })

  it('ordinary stories keep plain highlighted words', () => {
    render(<p>{richText('رَأَيْنَا {بَطَّةً}')}</p>)
    expect(screen.queryByTestId('story-letter')).toBeNull()
    expect(screen.getByText('بَطَّةً').tagName).toBe('MARK')
  })
})

describe('lesson completion: the letter story button', () => {
  const base = {
    t: dictionaries.ar,
    uiLang: 'ar' as const,
    practiced: 'الْحُرُوف',
    stars: 1,
    newRewards: [],
    showRewards: true,
    resting: false,
    hasNext: true,
    onAgain: () => undefined,
    onNext: () => undefined,
    onHome: () => undefined,
    lang: 'ar' as const,
  }

  it('appears when a story is linked, and opens it', async () => {
    const onOpen = vi.fn()
    render(<CompletionView {...base} letterStory={{ letter: 'ب', onOpen }} />)
    const btn = screen.getByRole('button', { name: 'قِصَّةُ ب' })
    await userEvent.click(btn)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('is absent without a linked story', () => {
    render(<CompletionView {...base} />)
    expect(screen.queryByTestId('letter-story')).toBeNull()
  })
})

describe('letter stories in the app', () => {
  it('library (Arabic): one entry opens the letter board; letter stories stay off the main shelf', async () => {
    await recordItemResult({ activityId: 'ar-discover', itemId: 'kha', skill: 'ar.letter.kha', areaId: 'letters', lang: 'ar', firstTry: true, misses: 0, hintsUsed: 0, durationMs: 0 })
    window.location.hash = '#/stories'
    render(<App />)
    const entry = await screen.findByTestId('letter-stories-entry')
    expect(entry).toHaveTextContent('قِصَصُ الْحُرُوفِ')
    expect(screen.queryByText('قِصَّةُ اخْتِبَارِ الْحَاءِ')).toBeNull()
    const others = screen.getByTestId('shelf-others')
    expect(within(others).getAllByRole('article').length).toBe(content.stories.filter((s) => !s.letter).length)
    await userEvent.click(entry)
    const board = await screen.findByTestId('letter-stories-board')
    // The whole alphabet, in order: letters with a story open it; the others wait, dimmed.
    expect(within(board).getAllByRole('button')).toHaveLength(28)
    expect(screen.getByTestId('letter-story-dal')).toBeDisabled()
    await userEvent.click(screen.getByTestId('letter-story-hha'))
    expect(window.location.hash).toContain('/stories/test-letter-hha')
  })

  it('library (English): no letter stories at all', async () => {
    await updateSettings({ learningMode: 'en', practiceLang: 'en' })
    window.location.hash = '#/stories'
    render(<App />)
    expect(await screen.findAllByRole('article')).not.toHaveLength(0)
    expect(screen.queryByTestId('letter-stories-entry')).toBeNull()
    expect(screen.queryByText('قِصَّةُ اخْتِبَارِ الْحَاءِ')).toBeNull()
  })

  it('discover board: a book badge on letters with a story; the tile still opens the lesson', async () => {
    window.location.hash = '#/discover/ar-discover'
    render(<App />)
    expect(await screen.findByTestId('story-badge-hha')).toBeInTheDocument()
    expect(screen.queryByTestId('story-badge-dal')).toBeNull()
    await userEvent.click(screen.getByTestId('discover-hha'))
    expect(window.location.hash).toContain('/play/ar-discover?item=hha')
  })
})
