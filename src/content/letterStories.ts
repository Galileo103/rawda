import type { Activity, LessonItem, StoryDef } from './schemas'
import type { Lang } from '../domain/types'

/**
 * Letter stories: a story linked to one Discover lesson item (`story.letter`).
 * Pure helpers shared by the reader, the lesson completion screen, the Discover board and the library.
 */

interface Linkable {
  id: string
  letter?: { activityId: string; itemId: string } | undefined
}

/** The lesson item a letter story is linked to (undefined when not a letter story or the link is broken). */
export function linkedLesson(story: Linkable, activities: readonly Activity[]): { activity: Activity; item: LessonItem } | undefined {
  if (!story.letter) return undefined
  const { activityId, itemId } = story.letter
  const activity = activities.find((a) => a.id === activityId)
  if (!activity || activity.template !== 'lesson') return undefined
  const item = activity.items.find((i) => i.id === itemId)
  return item ? { activity, item } : undefined
}

/** The letter story for a lesson item, if one is linked. */
export function letterStoryFor<S extends Linkable>(stories: readonly S[], activityId: string, itemId: string): S | undefined {
  return stories.find((s) => s.letter?.activityId === activityId && s.letter.itemId === itemId)
}

/**
 * After a Discover lesson: the letter story to offer for the items just finished (the last linked one),
 * with the letter to name on the button. Undefined when no story is linked (or the activity is not a lesson).
 */
export function lessonStoryOffer<S extends Linkable>(
  activity: Activity,
  finished: readonly { id: string }[],
  stories: readonly S[],
): { story: S; letter: string } | undefined {
  if (activity.template !== 'lesson') return undefined
  for (const done of [...finished].reverse()) {
    const story = letterStoryFor(stories, activity.id, done.id)
    const item = activity.items.find((i) => i.id === done.id)
    if (story && item) return { story, letter: lessonLetter(item) }
  }
  return undefined
}

/** The letter to colour inside {highlighted} words, in the lesson's own form (only in the lesson's language). */
export function storyHighlight(story: Linkable, activities: readonly Activity[], lang: Lang): LessonItem['highlight'] {
  const link = linkedLesson(story, activities)
  if (!link) return undefined
  if (link.activity.langs !== 'any' && link.activity.langs !== lang) return undefined
  return link.item.highlight
}

/** The letter's name for the "Story of …" button: the lesson's highlight, else its focus glyph. */
export function lessonLetter(item: LessonItem): string {
  if (item.focus.kind === 'glyph') return item.focus.text
  const h = item.highlight as unknown
  if (typeof h === 'string') return h
  if (Array.isArray(h)) return h.join(' ')
  return item.id
}

/**
 * The library's two shelves: letter stories (learned letters first, each group in alphabet order,
 * i.e. lesson item order) and every other story in the given order. Nothing is locked.
 */
export function storyShelves<S extends StoryDef>(
  stories: readonly S[],
  activities: readonly Activity[],
  taken: ReadonlyMap<string, ReadonlySet<string>>,
): { letters: S[]; others: S[] } {
  const rank = new Map<string, { learned: boolean; activity: number; item: number }>()
  for (const s of stories) {
    const link = linkedLesson(s, activities)
    if (!link) continue
    rank.set(s.id, {
      learned: taken.get(link.activity.id)?.has(link.item.id) ?? false,
      activity: activities.indexOf(link.activity),
      item: link.activity.items.findIndex((i) => i.id === link.item.id),
    })
  }
  const letters = stories.filter((s) => rank.has(s.id))
  letters.sort((a, b) => {
    const x = rank.get(a.id)!
    const y = rank.get(b.id)!
    return Number(y.learned) - Number(x.learned) || x.activity - y.activity || x.item - y.item
  })
  return { letters, others: stories.filter((s) => !rank.has(s.id)) }
}
