import { describe, expect, it } from 'vitest'
import { confusablesFor, LOOKALIKE } from '../../content/confusables'
import { visualKey } from '../../content/parse'
import type { ChoiceItem, Visual } from '../../content/schemas'
import { ageProfile } from '../../domain/ageProfile'
import { seededRng } from '../../domain/rng'
import { buildChoices, confusablesFirst } from './choices'

const glyph = (t: string): Visual => ({ kind: 'glyph', text: t })
const texts = (vs: readonly Visual[]) => vs.map((v) => (v.kind === 'glyph' ? v.text : visualKey(v)))
const item = (answer: string, difficulty = 3): ChoiceItem => ({ id: answer, skill: 's', difficulty, say: { ar: 'أَيْنَ الْحَرْفُ؟' }, answer: glyph(answer) })

describe('confusables', () => {
  it('lists look-alikes per alphabet and nothing for a letter without a twin', () => {
    expect(confusablesFor('ب', 'ar')).toEqual(['ت', 'ث', 'ن'])
    expect(confusablesFor('b', 'en')).toEqual(['d', 'p', 'q'])
    expect(confusablesFor('B', 'en')).toEqual(['D', 'P'])
    expect(confusablesFor('1', 'en')).toEqual([])
  })

  it('every look-alike is itself a letter of the same alphabet, never the letter itself', () => {
    for (const lang of ['ar', 'en'] as const) {
      for (const [g, twins] of Object.entries(LOOKALIKE[lang])) {
        for (const t of twins) {
          expect(t, `${g} → ${t}`).not.toBe(g)
          expect(LOOKALIKE[lang], `${lang}: ${t} (twin of ${g}) is not a known letter`).toHaveProperty(t)
        }
      }
    }
  })

  it('puts look-alikes of the answer first and keeps the order inside each part', () => {
    const vs = [glyph('س'), glyph('ن'), glyph('م'), glyph('ت')]
    expect(texts(confusablesFirst(vs, glyph('ب'), 'ar'))).toEqual(['ن', 'ت', 'س', 'م'])
    expect(texts(confusablesFirst(vs, glyph('ب'), undefined))).toEqual(['س', 'ن', 'م', 'ت'])
  })
})

describe('buildChoices with age options', () => {
  // The whole ب family plus unrelated letters, as a letters activity's pool would be.
  const pool = ['أ', 'ب', 'ت', 'ث', 'ن', 'س', 'م', 'ل', 'ك'].map(glyph)

  it('still accepts a plain number as maxChoices', () => {
    expect(buildChoices(item('ب', 5), pool, seededRng(1), 3)).toHaveLength(3)
    expect(buildChoices(item('ب', 5), pool, seededRng(1), { maxChoices: 3 })).toHaveLength(3)
  })

  it('older children: the wrong letters are the look-alikes of the answer', () => {
    const older = ageProfile('5-6')
    for (let seed = 1; seed <= 10; seed++) {
      const c = buildChoices(item('ب', 3), pool, seededRng(seed), { maxChoices: older.maxChoices, preferConfusables: older.preferConfusables, lang: 'ar' })
      expect(c).toHaveLength(3)
      expect(c.map(visualKey)).toContain('glyph:ب')
      for (const w of texts(c).filter((t) => t !== 'ب')) expect(['ت', 'ث', 'ن'], `seed ${seed}`).toContain(w)
    }
  })

  it('falls back to the rest of the pool once the look-alikes run out', () => {
    const c = buildChoices(item('د', 5), ['د', 'ذ', 'م', 'ل', 'ك'].map(glyph), seededRng(4), { maxChoices: 4, preferConfusables: true, lang: 'ar' })
    expect(c).toHaveLength(4)
    expect(texts(c)).toContain('د')
    expect(texts(c)).toContain('ذ')
  })

  it('explicit choices: look-alikes survive trimming for older children', () => {
    const explicit = { ...item('ب', 1), choices: [glyph('س'), glyph('ب'), glyph('ت')] }
    const older = buildChoices(explicit, [], seededRng(2), { maxChoices: 2, preferConfusables: true, lang: 'ar' })
    expect(older.map(visualKey).sort()).toEqual(['glyph:ب', 'glyph:ت'])
  })

  it('3–4: two options in a lesson check, no look-alike preference', () => {
    const young = ageProfile('3-4')
    expect(young.checkChoices).toBe(2)
    expect(young.preferConfusables).toBe(false)
    expect(ageProfile('4-5').checkChoices).toBe(3)
    expect(ageProfile('5-6').preferConfusables).toBe(true)
    const explicit = { ...item('ب', 1), choices: [glyph('س'), glyph('ب'), glyph('ت')] }
    const c = buildChoices(explicit, [], seededRng(3), { maxChoices: young.checkChoices, preferConfusables: young.preferConfusables, lang: 'ar' })
    expect(c).toHaveLength(2)
    expect(c.map(visualKey)).toContain('glyph:ب')
  })
})
