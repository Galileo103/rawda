import type { Lang } from './types'

/**
 * The child's gender, chosen by the parent. Arabic addresses boys and girls differently
 * (أَحْسَنْتَ / أَحْسَنْتِ), so lines that speak *to* or *about* the child come in two forms.
 * Unknown (not set yet) uses the neutral form when one exists, otherwise the masculine.
 */
export type Gender = 'm' | 'f'

/** A value with a masculine and a feminine form, and optionally a neutral one for "not set". */
export interface Gendered<T> {
  m: T
  f: T
  n?: T
}

/** Either a plain value or one that changes with the child's gender. */
export type G<T> = T | Gendered<T>

/** In text, where the child's name goes (shown written, spoken from the parent's recording). */
export const NAME_TOKEN = '@name'

/** Said and shown in place of the name when there is no name / no recording. */
export const HERO_WORD: Record<Lang, Gendered<string>> = {
  ar: { m: 'بَطَلُنَا', f: 'بَطَلَتُنَا', n: 'بَطَلُنَا' },
  en: { m: 'our hero', f: 'our heroine', n: 'our hero' },
}

export function isGendered(v: unknown): v is Gendered<unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const keys = Object.keys(v)
  return 'm' in v && 'f' in v && keys.every((k) => k === 'm' || k === 'f' || k === 'n')
}

/** `T` with every gendered value replaced by its chosen form. */
export type Resolved<T> =
  T extends Gendered<infer U>
    ? Resolved<U>
    : T extends string | number | boolean | null | undefined
      ? T
      : T extends readonly (infer E)[]
        ? Resolved<E>[]
        : { [K in keyof T]: Resolved<T[K]> }

/** Pick the form for this child, all the way down (dictionaries, stories). */
export function resolveGender<T>(value: T, gender: Gender | undefined): Resolved<T> {
  return pick(value, gender) as Resolved<T>
}

function pick(v: unknown, gender: Gender | undefined): unknown {
  if (isGendered(v)) return pick(gender ? v[gender] : (v.n ?? v.m), gender)
  if (Array.isArray(v)) return v.map((x) => pick(x, gender))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = pick(x, gender)
    return out
  }
  return v
}

export interface ChildNames {
  nameAr?: string
  nameEn?: string
}

/** The child's written name for a language, falling back to the other language's name. */
export function childName(p: ChildNames, lang: Lang): string | undefined {
  return (lang === 'ar' ? p.nameAr || p.nameEn : p.nameEn || p.nameAr) || undefined
}

/** Replace the name slot for display: the child's name, or "our hero/heroine". */
export function fillName(text: string, lang: Lang, p: ChildNames & { gender?: Gender }): string {
  if (!text.includes(NAME_TOKEN)) return text
  const name = childName(p, lang) ?? resolveGender(HERO_WORD[lang], p.gender)
  return text.split(NAME_TOKEN).join(name)
}

/** Split spoken text around the name slot: plain text pieces and `null` where the name goes. */
export function splitName(text: string): (string | null)[] {
  if (!text.includes(NAME_TOKEN)) return [text]
  const out: (string | null)[] = []
  text.split(NAME_TOKEN).forEach((piece, i) => {
    if (i > 0) out.push(null)
    const t = piece.trim()
    // Punctuation alone ("@name!") has nothing to say.
    if (/[\p{L}\p{N}]/u.test(t)) out.push(t)
  })
  return out
}
