import { describe, expect, it } from 'vitest'
import { lessonStoryOffer, storyHighlight, storyShelves } from './letterStories'
import { parseContent } from './parse'

/** A tiny fixture world: two lexicon-backed letter lessons and stories linked to them (independent of /content). */
const lexicon = [
  { id: 'duck', image: '1F986', ar: 'بَطَّة', en: 'duck' },
  { id: 'door', image: '1F6AA', ar: 'بَاب', en: 'door' },
  { id: 'apple', image: '1F34E', ar: 'تُفَّاحَة', en: 'apple' },
  { id: 'cat', image: '1F408', ar: 'قِطَّة', en: 'cat' },
]
const lessonItem = (id: string, letter: string, examples: string[]) => ({
  id,
  skill: `ar.letter.${id}`,
  difficulty: 1,
  say: { ar: 'هَيَّا نَتَعَرَّفُ عَلَى حَرْفٍ جَدِيدٍ.' },
  focus: { kind: 'glyph', text: letter },
  meet: { ar: 'هَذَا حَرْفٌ جَدِيدٌ.' },
  teaches: [`ar.letter.${id}`],
  examples,
  highlight: letter,
})
const lesson = {
  id: 'ar-discover',
  areaId: 'letters',
  langs: 'ar',
  level: 1,
  template: 'lesson',
  title: { ar: 'نَكْتَشِفُ الْحُرُوفَ' },
  intro: { ar: 'هَيَّا نَكْتَشِفُ.' },
  icon: { kind: 'glyph', text: 'ب' },
  sessionLength: 1,
  items: [lessonItem('ba', 'ب', ['duck', 'door']), lessonItem('ta', 'ت', ['apple'])],
}
const practice = {
  id: 'ar-pick',
  areaId: 'letters',
  langs: 'ar',
  level: 1,
  template: 'choice',
  title: { ar: 'نَخْتَارُ' },
  intro: { ar: 'نَخْتَارُ.' },
  icon: { kind: 'glyph', text: 'ب' },
  items: [
    { id: 'one', skill: 'x', difficulty: 1, say: { ar: 'أَيْنَ؟' }, answer: { kind: 'lex', id: 'duck' }, choices: [{ kind: 'lex', id: 'duck' }, { kind: 'lex', id: 'cat' }] },
  ],
}
const story = (id: string, letter: { activityId: string; itemId: string } | undefined, vocab: string[][]) => ({
  id,
  title: { ar: 'قِصَّة', en: 'A story' },
  theme: 'letters',
  cover: { kind: 'lex', id: 'cat' },
  level: 1,
  ...(letter ? { letter } : {}),
  pages: vocab.map((v) => ({ scene: { bg: 'meadow', actors: [] }, text: { ar: 'رَأَيْنَا {بَطَّةً}.', en: 'We saw a {duck}.' }, vocab: v })),
})

function parse(stories: Record<string, unknown>) {
  return parseContent({
    'content/lexicon.json': lexicon,
    'content/activities/letters/ar-discover.json': lesson,
    'content/activities/letters/ar-pick.json': practice,
    ...Object.fromEntries(Object.entries(stories).map(([id, s]) => [`content/stories/${id}/story.json`, s])),
  })
}

describe('letter stories: the link to a lesson item', () => {
  it('accepts a story whose pages cover every lesson word', () => {
    const r = parse({ 'letter-ba': story('letter-ba', { activityId: 'ar-discover', itemId: 'ba' }, [['duck'], ['door', 'cat']]) })
    expect(r.errors).toEqual([])
    expect(r.stories.map((s) => s.id)).toEqual(['letter-ba'])
    expect(r.stories[0]?.letter).toEqual({ activityId: 'ar-discover', itemId: 'ba' })
  })

  it('names the lesson words missing from vocab, and skips the story', () => {
    const r = parse({ 'letter-ba': story('letter-ba', { activityId: 'ar-discover', itemId: 'ba' }, [['cat'], ['duck']]) })
    expect(r.stories).toEqual([])
    expect(r.errors.join('\n')).toMatch(/content\/stories\/letter-ba: .*vocab.*missing: door/)
  })

  it('needs a lesson activity and an existing item', () => {
    const r = parse({
      a: story('a', { activityId: 'nope', itemId: 'ba' }, [['duck']]),
      b: story('b', { activityId: 'ar-pick', itemId: 'one' }, [['duck']]),
      c: story('c', { activityId: 'ar-discover', itemId: 'zz' }, [['duck']]),
    })
    expect(r.stories).toEqual([])
    const all = r.errors.join('\n')
    expect(all).toMatch(/unknown activity "nope"/)
    expect(all).toMatch(/"ar-pick" is not a lesson/)
    expect(all).toMatch(/unknown item "zz"/)
  })

  it('leaves ordinary stories alone', () => {
    const r = parse({ plain: story('plain', undefined, [['cat']]) })
    expect(r.errors).toEqual([])
    expect(r.stories[0]?.letter).toBeUndefined()
  })
})

describe('letter stories: helpers', () => {
  const r = parse({
    'letter-ta': story('letter-ta', { activityId: 'ar-discover', itemId: 'ta' }, [['apple']]),
    plain1: story('plain1', undefined, [['cat']]),
    'letter-ba': story('letter-ba', { activityId: 'ar-discover', itemId: 'ba' }, [['duck', 'door']]),
    plain2: story('plain2', undefined, [['cat']]),
  })

  it('library shelf: letter stories in alphabet order, learned letters first; other stories keep their order', () => {
    expect(r.errors).toEqual([])
    const none = storyShelves(r.stories, r.activities, new Map())
    expect(none.letters.map((s) => s.id)).toEqual(['letter-ba', 'letter-ta'])
    expect(none.others.map((s) => s.id)).toEqual(['plain1', 'plain2'])
    const learnedTa = storyShelves(r.stories, r.activities, new Map([['ar-discover', new Set(['ta'])]]))
    expect(learnedTa.letters.map((s) => s.id)).toEqual(['letter-ta', 'letter-ba'])
    const learnedBoth = storyShelves(r.stories, r.activities, new Map([['ar-discover', new Set(['ta', 'ba'])]]))
    expect(learnedBoth.letters.map((s) => s.id)).toEqual(['letter-ba', 'letter-ta'])
  })

  it('offers the story after its lesson only', () => {
    const discover = r.activities.find((a) => a.id === 'ar-discover')!
    const pick = r.activities.find((a) => a.id === 'ar-pick')!
    expect(lessonStoryOffer(discover, [{ id: 'ba' }], r.stories)).toMatchObject({ story: { id: 'letter-ba' }, letter: 'ب' })
    expect(lessonStoryOffer(discover, [{ id: 'ba' }], r.stories.filter((s) => s.id !== 'letter-ba'))).toBeUndefined()
    expect(lessonStoryOffer(pick, [{ id: 'one' }], r.stories)).toBeUndefined()
  })

  it('colours the lesson letter only in the lesson language', () => {
    const ba = r.stories.find((s) => s.id === 'letter-ba')!
    expect(storyHighlight(ba, r.activities, 'ar')).toBe('ب')
    expect(storyHighlight(ba, r.activities, 'en')).toBeUndefined()
    expect(storyHighlight(r.stories.find((s) => s.id === 'plain1')!, r.activities, 'ar')).toBeUndefined()
  })
})
