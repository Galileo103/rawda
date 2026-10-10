import { type Gender, type Gendered, type Resolved, resolveGender } from '../domain/child'
import type { Lang } from '../domain/types'
import { ar } from './ar'
import { en } from './en'

/** Any line may instead come in boy / girl forms (Arabic needs it far more often than English). */
type Widen<T> = T extends string
  ? string | Gendered<string>
  : T extends readonly string[]
    ? readonly string[] | Gendered<readonly string[]>
    : { readonly [K in keyof T]: Widen<T[K]> }

/**
 * Shape of a dictionary as written; ar.ts is type-checked against the English one.
 * Lines that address the child may be `{ m, f, n? }` (see domain/child.ts).
 */
export type RawDict = Widen<typeof en>

/** A dictionary with every line already in the child's form (what screens use). */
export type Dict = Resolved<RawDict>

/** Both forms of every gendered line (narration rendering, tests). */
export const rawDictionaries: Record<Lang, RawDict> = { ar, en }

/** Dictionaries in the neutral form (gender not set). */
export const dictionaries: Record<Lang, Dict> = { ar: resolveGender(ar, undefined), en: resolveGender(en, undefined) }

/**
 * Which form `dict()` returns. Set by AppStateProvider from the child's profile, the same
 * way the audio service is configured, so every screen speaks to the child correctly
 * without threading the gender through each call.
 */
let currentGender: Gender | undefined
const resolved = new Map<string, Dict>()

export function setDictGender(gender: Gender | undefined): void {
  currentGender = gender
}

export function dict(lang: Lang, gender: Gender | undefined = currentGender): Dict {
  if (!gender) return dictionaries[lang]
  const key = `${lang}-${gender}`
  let d = resolved.get(key)
  if (!d) {
    d = resolveGender(rawDictionaries[lang], gender)
    resolved.set(key, d)
  }
  return d
}

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr'
}

/** `fmt('Hi {name}', { name: 'Mariam' })` */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`))
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

/** Numerals as children see them in each language: ٣ in Arabic, 3 in English. */
export function numeral(n: number, lang: Lang): string {
  const s = String(n)
  return lang === 'ar' ? s.replace(/\d/g, (d) => AR_DIGITS[Number(d)] ?? d) : s
}

export function otherLang(lang: Lang): Lang {
  return lang === 'ar' ? 'en' : 'ar'
}
