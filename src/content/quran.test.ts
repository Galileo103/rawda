import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from '../../scripts/lib/contentFs'
import { content } from './loader'

/**
 * Integrity of the bundled Quran data. The data itself is produced only by
 * scripts/fetch-quran.ts (verbatim Tanzil text, cross-checked with quran.com);
 * these tests make sure nothing was edited or corrupted afterwards.
 */

// Standard Hafs ayah counts and Arabic names (as given in Tanzil's quran-data metadata).
const EXPECTED: Record<number, { name: string; ayahs: number }> = {
  1: { name: 'الفاتحة', ayahs: 7 },
  102: { name: 'التكاثر', ayahs: 8 },
  103: { name: 'العصر', ayahs: 3 },
  104: { name: 'الهمزة', ayahs: 9 },
  105: { name: 'الفيل', ayahs: 5 },
  106: { name: 'قريش', ayahs: 4 },
  107: { name: 'الماعون', ayahs: 7 },
  108: { name: 'الكوثر', ayahs: 3 },
  109: { name: 'الكافرون', ayahs: 6 },
  110: { name: 'النصر', ayahs: 3 },
  111: { name: 'المسد', ayahs: 5 },
  112: { name: 'الإخلاص', ayahs: 4 },
  113: { name: 'الفلق', ayahs: 5 },
  114: { name: 'الناس', ayahs: 6 },
}

const quran = content.quran!
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('Quran data', () => {
  it('is present and passed schema validation', () => {
    expect(quran).toBeDefined()
    expect(content.errors.filter((e) => e.startsWith('quran/'))).toEqual([])
  })

  it('contains exactly the agreed surahs with correct names and ayah counts', () => {
    expect(quran.surahs.map((s) => s.number).sort((a, b) => a - b)).toEqual([1, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114])
    for (const s of quran.surahs) {
      expect(s.nameAr, `surah ${s.number}`).toBe(EXPECTED[s.number]!.name)
      expect(s.ayahs, `surah ${s.number}`).toHaveLength(EXPECTED[s.number]!.ayahs)
      expect(s.ayahCount).toBe(EXPECTED[s.number]!.ayahs)
    }
  })

  it('numbers ayahs in order without gaps', () => {
    for (const s of quran.surahs) expect(s.ayahs.map((a) => a.n)).toEqual(Array.from({ length: s.ayahCount }, (_, i) => i + 1))
  })

  it('keeps the basmala as ayah 1 of Al-Fatiha only; other surahs show it as a heading', () => {
    const fatiha = quran.surahs.find((s) => s.number === 1)!
    expect(fatiha.ayahs[0]!.text).toBe(quran.basmala.text)
    expect(fatiha.basmalaHeading).toBe(false)
    for (const s of quran.surahs.filter((x) => x.number !== 1)) {
      expect(s.basmalaHeading).toBe(true)
      expect(s.ayahs[0]!.text.startsWith(quran.basmala.text)).toBe(false)
    }
  })

  it('every ayah is Arabic text with diacritics (Uthmani script)', () => {
    for (const s of quran.surahs)
      for (const a of s.ayahs) {
        expect(a.text).toMatch(/[ء-يٱ]/)
        expect(a.text).toMatch(/[ً-ْ]/) // harakat present
      }
  })

  it('every recitation file is bundled and unchanged since download (SHA-256)', () => {
    expect(sha(join(ROOT, 'public', 'assets', quran.basmala.audio))).toBe(quran.basmala.sha256)
    for (const s of quran.surahs) for (const a of s.ayahs) expect(sha(join(ROOT, 'public', 'assets', a.audio)), a.audio).toBe(a.sha256)
  })

  it('every other verified reciter covers every ayah and the basmala, unchanged since download', () => {
    const others = (quran.source.reciters ?? []).slice(1)
    // Al-Minshawi (teaching, with children) is the default voice; Al-Husary is the second.
    expect(quran.source.reciters?.[0]?.id).toBe('minshawy-muallim')
    expect(others.map((r) => r.id)).toContain('husary-muallim')
    for (const r of others) {
      expect(r.audioUrl).toContain('everyayah.com')
      const b = quran.basmala.more?.[r.id]
      expect(b, `basmala · ${r.id}`).toBeDefined()
      expect(sha(join(ROOT, 'public', 'assets', b!.audio))).toBe(b!.sha256)
      for (const s of quran.surahs)
        for (const a of s.ayahs) {
          const x = a.more?.[r.id]
          expect(x, `${s.number}:${a.n} · ${r.id}`).toBeDefined()
          expect(x!.audio.startsWith(`quran/${r.id}/`)).toBe(true)
          expect(sha(join(ROOT, 'public', 'assets', x!.audio)), x!.audio).toBe(x!.sha256)
        }
    }
  })

  it('records its sources and the Tanzil notice', () => {
    expect(quran.source.textUrl).toContain('tanzil.net')
    expect(quran.source.textNotice).toContain('Tanzil Project')
    expect(quran.source.audioUrl).toContain('everyayah.com')
  })
})
