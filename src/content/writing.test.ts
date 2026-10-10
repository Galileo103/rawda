import { describe, expect, it } from 'vitest'
import { dict } from '../i18n'
import { WRITE_ENTRIES, entriesOf, fillLine, visibleSets, writeEntryById, writingLines } from './writing'

describe('Writing room catalog', () => {
  it('has every Arabic letter, its forms, English capitals and small letters, and both kinds of digits', () => {
    expect(entriesOf('ar', ['ar'])).toHaveLength(28)
    // 22 joining letters × 3 forms + 6 non-joining letters × 1 end form
    expect(entriesOf('arForms', ['ar'])).toHaveLength(72)
    expect(entriesOf('en', ['en'])).toHaveLength(52)
    expect(entriesOf('num', ['ar', 'en'])).toHaveLength(20)
    expect(entriesOf('num', ['ar']).map((e) => e.glyph).join('')).toBe('٠١٢٣٤٥٦٧٨٩')
    expect(new Set(WRITE_ENTRIES.map((e) => e.id)).size).toBe(WRITE_ENTRIES.length)
  })

  it('writes alif with its hamza, and letter forms with a tatweel', () => {
    expect(writeEntryById('ar-alif')?.glyph).toBe('أ')
    expect(writeEntryById('arf-ba-start')?.glyph).toBe('بـ')
    expect(writeEntryById('arf-ba-middle')?.glyph).toBe('ـبـ')
    expect(writeEntryById('arf-dal-start')).toBeUndefined() // د never joins the next letter
    expect(writeEntryById('arf-dal-end')?.glyph).toBe('ـد')
  })

  it('shows only the sets for the learning languages', () => {
    expect(visibleSets(['ar'])).toEqual(['ar', 'arForms', 'num'])
    expect(visibleSets(['en'])).toEqual(['en', 'num'])
  })

  it('says which letter to colour, and every line is collected for the audio', () => {
    expect(fillLine(writeEntryById('ar-ba')!, dict('ar'))).toBe('هَيَّا نُلَوِّنُ حَرْفَ البَاء!')
    expect(fillLine(writeEntryById('arf-ba-end')!, dict('ar'))).toContain('آخِرِ الْكَلِمَةِ')
    expect(fillLine(writeEntryById('num-ar-0')!, dict('ar'))).toContain('صِفْر')
    expect(fillLine(writeEntryById('en-a')!, dict('en'))).toBe('Let’s color small a!')
    const lines = writingLines('ar', dict('ar'))
    expect(lines).toContain('هَيَّا نُلَوِّنُ حَرْفَ البَاء!')
    expect(lines.every((l) => l.length > 0)).toBe(true)
  })
})
