import { describe, expect, it } from 'vitest'
import { seededRng } from '../domain/rng'
import { dictionaries } from '../i18n'
import { AudioService, voiceScore } from './audio/AudioService'
import { hashPin, isValidPin, makeWordsChallenge, newSalt, verifyPin } from './parentGate'

describe('parent gate', () => {
  it('stores only a salted hash and verifies the PIN', async () => {
    const salt = newSalt()
    const hash = await hashPin('2580', salt)
    expect(hash).not.toContain('2580')
    expect(await verifyPin('2580', hash, salt)).toBe(true)
    expect(await verifyPin('0000', hash, salt)).toBe(false)
    expect(await verifyPin('2580', hash, newSalt())).toBe(false)
    expect(await verifyPin('2580', undefined, undefined)).toBe(false)
  })

  it('accepts exactly four digits', () => {
    expect(isValidPin('1234')).toBe(true)
    for (const bad of ['123', '12345', 'abcd', '12 4']) expect(isValidPin(bad)).toBe(false)
  })

  it('word challenge spells a 3-digit number a pre-reader cannot copy', () => {
    const c = makeWordsChallenge(dictionaries.en.digitWords, seededRng(42))
    expect(c.digits).toMatch(/^[1-9]\d\d$/)
    expect(c.words.split(', ')).toEqual([...c.digits].map((d) => dictionaries.en.digitWords[Number(d)]))
    expect(c.words).not.toMatch(/\d/)
  })
})

describe('audio service', () => {
  it('missing clip + no device voice → "none" (UI shows the text); never throws', async () => {
    const a = new AudioService()
    await expect(a.speak('a line that has no pre-rendered clip', 'ar')).resolves.toBe('none')
  })

  it('respects mute', async () => {
    const a = new AudioService()
    a.configure({ narration: false })
    await expect(a.speak('hello', 'en')).resolves.toBe('muted')
  })

  it('device-voice fallback prefers a woman’s voice (Hala), even over a "better" region', () => {
    const best = (voices: { name: string; lang: string }[], lang: 'ar' | 'en') => [...voices].sort((x, y) => voiceScore(y, lang) - voiceScore(x, lang))[0]?.name
    expect(best([{ name: 'Microsoft Naayf - Arabic (Saudi)', lang: 'ar-SA' }, { name: 'Microsoft Hoda - Arabic (Egypt)', lang: 'ar-EG' }], 'ar')).toMatch(/Hoda/)
    expect(best([{ name: 'Microsoft David - English (United States)', lang: 'en-US' }, { name: 'Microsoft Zira - English (United States)', lang: 'en-US' }], 'en')).toMatch(/Zira/)
    expect(best([{ name: 'Google UK English Male', lang: 'en-GB' }, { name: 'Google UK English Female', lang: 'en-GB' }], 'en')).toMatch(/Female/)
  })

  it('sound effects are safe without Web Audio', () => {
    const a = new AudioService()
    expect(() => a.sfx('correct')).not.toThrow()
  })

  it('reports speaking state to listeners', async () => {
    const a = new AudioService()
    const states: boolean[] = []
    a.onSpeakingChange((s) => states.push(s))
    await a.speak('x', 'en')
    expect(states).toContain(true)
    expect(states.at(-1)).toBe(false)
  })
})
