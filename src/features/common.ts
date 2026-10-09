import { useEffect, useRef } from 'react'
import { activityAvailable, activityLang, content, pick, skillsOf } from '../content/loader'
import { spokenTextFrom } from '../content/narration'
import type { Activity, Area, Visual } from '../content/schemas'
import { defaultRng, pickOne } from '../domain/rng'
import type { AreaId, Lang } from '../domain/types'
import { dict, numeral } from '../i18n'
import { audio } from '../services/audio/AudioService'
import { completedActivityIds, lastCompletedActivityId, takenLessonItems } from '../services/repos/progress'

export function voice(lang: Lang) {
  return dict(lang).voice
}

export function randomLine(lines: readonly string[]): string {
  return lines.length ? pickOne(lines, defaultRng) : ''
}

/** What to *say* for a visual (number words instead of digits; never a lone letter glyph). */
export function spokenText(v: Visual, lang: Lang): string {
  return spokenTextFrom(v, lang, content.lexicon, dict(lang))
}

export function numberWord(n: number, lang: Lang): string {
  return voice(lang).numbers[n - 1] ?? numeral(n, lang)
}

/** Speak a line once when a screen appears (stops when leaving the screen). */
export function useSpeakOnMount(text: string | undefined, lang: Lang, enabled = true): void {
  const said = useRef(false)
  useEffect(() => {
    if (!enabled || !text || said.current) return
    said.current = true
    void audio.speak(text, lang)
  }, [text, lang, enabled])
  useEffect(() => () => audio.stop(), [])
}

export { pick }

/** The icon to show in the current language (areas and activities can differ per language). */
export function iconFor(x: { icon: Visual; iconByLang?: { ar: Visual; en: Visual } }, lang: Lang): Visual {
  return x.iconByLang?.[lang] ?? x.icon
}

// ---- curriculum visibility (respects parent subject toggles and learning languages) ----

export interface Visibility {
  disabledAreas: readonly AreaId[]
  langs: readonly Lang[]
}

export function playableActivities(v: Visibility, areaId?: AreaId): Activity[] {
  return content.activities.filter(
    (a) => !v.disabledAreas.includes(a.areaId) && activityAvailable(a, v.langs) && (!areaId || a.areaId === areaId),
  )
}

export function visibleAreas(v: Visibility): Area[] {
  return content.areas.filter((area) => {
    if (v.disabledAreas.includes(area.id)) return false
    if (area.route === 'studio') return true
    if (area.route === 'stories') return content.stories.length > 0
    if (area.id === 'islamic' && content.quran) return true
    return playableActivities(v, area.id).length > 0
  })
}

// ---- the learning journey: discover → practise → discover the next one ----

export function lessonActivities(v: Visibility, areaId?: AreaId): Activity[] {
  return playableActivities(v, areaId).filter((a) => a.template === 'lesson')
}

/** Skills introduced by the Discover lessons the child has taken. */
export function introducedSkills(taken: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const out = new Set<string>()
  for (const a of content.activities) {
    if (a.template !== 'lesson') continue
    const done = taken.get(a.id)
    if (!done) continue
    for (const item of a.items) if (done.has(item.id)) item.teaches.forEach((s) => out.add(s))
  }
  return out
}

/**
 * "Completed" set for the recommender. A Discover lesson with new concepts left counts as
 * not-done again once something else was played after it — so Continue alternates
 * between meeting something new and practising it.
 */
export async function journeyCompleted(v: Visibility): Promise<Set<string>> {
  const lessons = lessonActivities(v)
  const [completed, last, taken] = await Promise.all([completedActivityIds(), lastCompletedActivityId(), takenLessonItems(lessons.map((l) => l.id))])
  const justLearned = lessons.some((l) => l.id === last)
  for (const l of lessons) {
    const remaining = l.items.some((i) => !taken.get(l.id)?.has(i.id))
    if (justLearned) completed.add(l.id) // just met something new → practise it before the next lesson
    else if (remaining) completed.delete(l.id) // practised since → time to discover the next one
  }
  return completed
}

/** Shape the recommender needs: each activity with the language it will run in. */
export function forRecommend(acts: Activity[], practiceLang: Lang) {
  return acts.map((a) => ({ id: a.id, level: a.level, skills: skillsOf(a), lang: activityLang(a, practiceLang), activity: a }))
}
