import type { Lang } from '../domain/types'
import { ar } from './ar'
import { en } from './en'

type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : { readonly [K in keyof T]: Widen<T[K]> }

/** Shape of a dictionary; ar.ts is type-checked against the English one. */
export type Dict = Widen<typeof en>

export const dictionaries: Record<Lang, Dict> = { ar, en }

export function dict(lang: Lang): Dict {
  return dictionaries[lang]
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
