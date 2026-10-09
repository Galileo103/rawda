import type { Lang } from '../domain/types'
import { type ContentBundle, parseContent } from './parse'
import type { Activity, Localized } from './schemas'

// Bundled at build time: content works offline and ships inside the app.
const raw = import.meta.glob('../../content/**/*.json', { eager: true, import: 'default' })

export const content: ContentBundle = parseContent(raw)

if (content.errors.length > 0) {
  console.warn(`[content] ${content.errors.length} problem(s); affected entries were skipped:\n` + content.errors.join('\n'))
}

export function activityById(id: string): Activity | undefined {
  return content.activities.find((a) => a.id === id)
}

export function storyById(id: string) {
  return content.stories.find((s) => s.id === id)
}

/** The language an activity runs in: fixed for language-specific ones, else the child's current learning language. */
export function activityLang(a: Activity, practiceLang: Lang): Lang {
  return a.langs === 'any' ? practiceLang : a.langs
}

export function activityAvailable(a: Activity, langs: readonly Lang[]): boolean {
  return a.langs === 'any' || langs.includes(a.langs)
}

/** Text in the requested language, falling back to the other one (never empty-crashes). */
export function pick(t: Localized | undefined, lang: Lang): string {
  if (!t) return ''
  return t[lang] ?? t[lang === 'ar' ? 'en' : 'ar'] ?? ''
}

export function skillsOf(a: Activity): string[] {
  return [...new Set(a.items.map((i: { skill: string }) => i.skill))]
}
