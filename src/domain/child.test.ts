import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { content } from '../content/loader'
import { collectNarration } from '../content/narration'
import { dict, rawDictionaries, setDictGender } from '../i18n'
import { AudioService } from '../services/audio/AudioService'
import { RawdaDB } from '../services/db'
import { childName, fillName, isGendered, resolveGender, splitName } from './child'

describe('gendered text', () => {
  it('picks the boy / girl / neutral form, all the way down', () => {
    const v = { a: { m: 'أَحْسَنْتَ', f: 'أَحْسَنْتِ' }, b: ['x', { m: 'he', f: 'she', n: 'they' }], c: 3 }
    expect(resolveGender(v, 'm')).toEqual({ a: 'أَحْسَنْتَ', b: ['x', 'he'], c: 3 })
    expect(resolveGender(v, 'f')).toEqual({ a: 'أَحْسَنْتِ', b: ['x', 'she'], c: 3 })
    expect(resolveGender(v, undefined)).toEqual({ a: 'أَحْسَنْتَ', b: ['x', 'they'], c: 3 })
  })

  it('only {m, f[, n]} objects count as gendered', () => {
    expect(isGendered({ m: 1, f: 2 })).toBe(true)
    expect(isGendered({ m: 1, f: 2, n: 3 })).toBe(true)
    expect(isGendered({ m: 1, f: 2, x: 3 })).toBe(false)
    expect(isGendered({ m: 1 })).toBe(false)
    expect(isGendered(['m', 'f'])).toBe(false)
  })

  it('dict() speaks to the child set by the app', () => {
    setDictGender('f')
    expect(dict('ar').games.say.done).toContain('أَحْسَنْتِ')
    setDictGender('m')
    expect(dict('ar').games.say.done).toContain('أَحْسَنْتَ')
    setDictGender(undefined)
    expect(dict('ar').voice.praise).not.toContain('أَنْتَ بَطَلٌ!')
  })
})

describe('the child’s name', () => {
  it('falls back to the other language, then to "our hero/heroine"', () => {
    expect(childName({ nameAr: 'مريم', nameEn: 'Mariam' }, 'en')).toBe('Mariam')
    expect(childName({ nameAr: 'مريم' }, 'en')).toBe('مريم')
    expect(fillName('شُكْرًا يَا @name!', 'ar', { nameAr: 'مريم', gender: 'f' })).toBe('شُكْرًا يَا مريم!')
    expect(fillName('@name sees the sun.', 'en', { gender: 'f' })).toBe('our heroine sees the sun.')
  })

  it('splits spoken text around the name slot (punctuation alone is dropped)', () => {
    expect(splitName('أَحْسَنْتِ يَا @name!')).toEqual(['أَحْسَنْتِ يَا', null])
    expect(splitName('@name يَرَى الشَّمْسَ.')).toEqual([null, 'يَرَى الشَّمْسَ.'])
    expect(splitName('no name here')).toEqual(['no name here'])
  })

  it('narration has a clip for every piece of both forms, never the raw slot', () => {
    const texts = new Set(collectNarration(content, rawDictionaries).map((l) => `${l.lang}|${l.text}`))
    expect([...texts].some((t) => t.includes('@name'))).toBe(false)
    expect(texts.has('ar|يَرَى الشَّمْسَ فِي السَّمَاءِ. الشَّمْسُ صَفْرَاءُ.')).toBe(true)
    expect(texts.has('ar|تَرَى الشَّمْسَ فِي السَّمَاءِ. الشَّمْسُ صَفْرَاءُ.')).toBe(true)
    expect(texts.has('ar|بَطَلَتُنَا')).toBe(true)
    expect(texts.has('en|our hero')).toBe(true)
  })
})

describe('name in narration', () => {
  afterEach(() => vi.restoreAllMocks())

  it('plays the parent’s recording in the name slot, else says "our hero/heroine"', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:name')
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const a = new AudioService()
    const played: string[] = []
    vi.spyOn(a as unknown as { playFile: (url: string) => Promise<boolean> }, 'playFile').mockImplementation(async (url: string) => {
      played.push(url)
      return true
    })
    a.setChild('f', { ar: new Blob(['x']) })
    await a.speak('أَحْسَنْتِ يَا @name!', 'ar')
    expect(played).toContain('blob:name')

    a.setChild('f', {})
    const said: string[] = []
    vi.spyOn(a as unknown as { sayText: (t: string) => Promise<string> }, 'sayText').mockImplementation(async (t: string) => {
      said.push(t)
      return 'none'
    })
    await a.speak('أَحْسَنْتِ يَا @name!', 'ar')
    expect(said).toEqual(['أَحْسَنْتِ يَا', 'بَطَلَتُنَا'])
  })
})

describe('database upgrade', () => {
  it('moves the old nickname to the Arabic or English name', async () => {
    const name = `upgrade-${Math.random()}`
    const v1 = new Dexie(name)
    v1.version(1).stores({ profile: 'id' })
    await v1.table('profile').put({ id: 'main', nickname: 'مريم' })
    v1.close()
    const db = new RawdaDB(name)
    expect(await db.profile.get('main')).toEqual({ id: 'main', nameAr: 'مريم' })
    db.close()
  })
})
