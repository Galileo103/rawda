import type { Activity, LessonItem } from './schemas'
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
