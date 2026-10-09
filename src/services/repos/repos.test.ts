import { beforeEach, describe, expect, it } from 'vitest'
import { RawdaDB, db } from '../db'
import { deleteAllData, exportProgress, importProgress, resetProgress } from './data'
import { getDrawing, listDrawings, saveDrawing } from './drawings'
import { completedActivityIds, getMasteryMap, ownedRewardIds, recordCompletion, recordItemResult, totalStars } from './progress'
import { getSettings, updateSettings } from './settings'

const result = (over: Partial<Parameters<typeof recordItemResult>[0]> = {}) =>
  recordItemResult({ activityId: 'act', itemId: 'i1', skill: 'color.red', areaId: 'colors-shapes', lang: 'ar', firstTry: true, misses: 0, hintsUsed: 0, durationMs: 900, ...over })

const DEFS = [
  { id: 'sticker-act', rule: { type: 'activity' as const, activityId: 'act' } },
  { id: 'stars-5', rule: { type: 'stars' as const, total: 5 } },
  { id: 'first-drawing', rule: { type: 'drawings' as const, count: 1 } },
]

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('progress persistence', () => {
  it('records attempts, mastery and level atomically', async () => {
    const { mastery, level } = await result()
    expect(mastery.key).toBe('color.red|ar')
    expect(level.key).toBe('colors-shapes|ar')
    expect(await db.attempts.count()).toBe(1)
  })

  it('keeps Arabic and English progress independent', async () => {
    await result({ lang: 'ar' })
    await result({ lang: 'ar' })
    await result({ lang: 'en', firstTry: false, misses: 2 })
    const m = await getMasteryMap()
    expect(m.get('color.red|ar')?.attempts).toBe(2)
    expect(m.get('color.red|en')?.attempts).toBe(1)
    expect(m.get('color.red|en')!.score).toBeLessThan(m.get('color.red|ar')!.score)
  })

  it('survives an app restart (a fresh connection sees the same data)', async () => {
    await result()
    await recordCompletion({ activityId: 'act', areaId: 'colors-shapes', lang: 'ar', items: 5 }, DEFS)
    const reopened = new RawdaDB('rawda')
    await reopened.open()
    expect(await reopened.mastery.count()).toBe(1)
    expect(await reopened.completions.count()).toBe(1)
    expect(await reopened.rewards.count()).toBe(2)
    reopened.close()
  })

  it('the screen language always follows the learning language', async () => {
    expect((await updateSettings({ learningMode: 'both', practiceLang: 'en' })).uiLang).toBe('en')
    expect((await updateSettings({ practiceLang: 'ar' })).uiLang).toBe('ar')
    expect((await updateSettings({ learningMode: 'en' })).uiLang).toBe('en')
  })

  it('switching languages does not touch progress', async () => {
    await result()
    const before = await getMasteryMap()
    await updateSettings({ uiLang: 'en', practiceLang: 'en' })
    await updateSettings({ uiLang: 'ar', learningMode: 'ar' })
    expect(await getMasteryMap()).toEqual(before)
  })
})

describe('rewards', () => {
  it('are granted once and never duplicated', async () => {
    const r1 = await recordCompletion({ activityId: 'act', areaId: 'colors-shapes', lang: 'ar', items: 5 }, DEFS)
    expect(r1.stars).toBe(5)
    expect(r1.newRewards.map((r) => r.id).sort()).toEqual(['stars-5', 'sticker-act'])
    const r2 = await recordCompletion({ activityId: 'act', areaId: 'colors-shapes', lang: 'en', items: 5 }, DEFS)
    expect(r2.newRewards).toEqual([])
    expect(await db.rewards.count()).toBe(2)
    expect(await totalStars()).toBe(10)
  })

  it('a first saved drawing earns its sticker', async () => {
    await saveDrawing({ pngDataUrl: 'data:image/png;base64,AA==', layerDataUrl: 'data:image/png;base64,AA==' })
    await recordCompletion({ activityId: 'other', areaId: 'logic', lang: 'ar', items: 1 }, DEFS)
    expect((await ownedRewardIds()).has('first-drawing')).toBe(true)
  })
})

describe('drawings', () => {
  it('save, update in place, list and reopen', async () => {
    const d = await saveDrawing({ pngDataUrl: 'data:a', layerDataUrl: 'data:l1', pageId: 'fish' }, 1000)
    await saveDrawing({ id: d.id, pngDataUrl: 'data:b', layerDataUrl: 'data:l2', pageId: 'fish' }, 2000)
    const all = await listDrawings()
    expect(all).toHaveLength(1)
    const again = await getDrawing(d.id)
    expect(again?.layerDataUrl).toBe('data:l2')
    expect(again?.createdAt).toBe(1000)
    expect(again?.updatedAt).toBe(2000)
  })
})

describe('parent data controls', () => {
  it('reset clears learning progress but keeps drawings and settings', async () => {
    await updateSettings({ onboarded: true, practiceLang: 'en' })
    await result()
    await recordCompletion({ activityId: 'act', areaId: 'colors-shapes', lang: 'ar', items: 3 }, DEFS)
    await saveDrawing({ pngDataUrl: 'data:a', layerDataUrl: 'data:l' })
    await resetProgress()
    expect(await db.mastery.count()).toBe(0)
    expect(await db.completions.count()).toBe(0)
    expect(await db.rewards.count()).toBe(0)
    expect(await db.drawings.count()).toBe(1)
    expect((await getSettings()).uiLang).toBe('en')
  })

  it('delete-all removes everything and returns to first-run', async () => {
    await updateSettings({ onboarded: true, pinHash: 'x', pinSalt: 'y' })
    await result()
    await saveDrawing({ pngDataUrl: 'data:a', layerDataUrl: 'data:l' })
    await deleteAllData()
    expect(await db.drawings.count()).toBe(0)
    expect(await db.attempts.count()).toBe(0)
    const s = await getSettings()
    expect(s.onboarded).toBe(false)
    expect(s.pinHash).toBeUndefined()
  })

  it('export → import round-trips progress (and rejects invalid files untouched)', async () => {
    await result()
    await recordCompletion({ activityId: 'act', areaId: 'colors-shapes', lang: 'ar', items: 4 }, DEFS)
    const file = JSON.parse(JSON.stringify(await exportProgress()))
    expect(file).not.toHaveProperty('drawings')
    await resetProgress()
    await importProgress(file)
    expect((await completedActivityIds()).has('act')).toBe(true)
    expect((await getMasteryMap()).get('color.red|ar')?.attempts).toBe(1)
    await expect(importProgress({ format: 'something-else' })).rejects.toThrow()
    expect(await db.completions.count()).toBe(1)
  })
})
