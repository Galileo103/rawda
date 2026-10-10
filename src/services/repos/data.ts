import { z } from 'zod'
import { AREA_IDS } from '../../domain/types'
import { PROGRESS_TABLES, db } from '../db'
import { DEFAULT_SETTINGS } from './settings'

/**
 * Parent-only data management: export / import / reset / delete.
 * Exports contain learning progress only (no drawings, no PIN, no voice recordings).
 */

const EXPORT_FORMAT = 'rawda-progress'
const EXPORT_VERSION = 1

const LangZ = z.enum(['ar', 'en'])
const AreaZ = z.enum(AREA_IDS)
const ExportZ = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  profile: z
    .object({
      nickname: z.string().optional(),
      nameAr: z.string().max(24).optional(),
      nameEn: z.string().max(24).optional(),
      gender: z.enum(['m', 'f']).optional(),
      ageBand: z.enum(['3-4', '4-5', '5-6']).optional(),
    })
    .optional(),
  attempts: z.array(
    z.object({
      activityId: z.string(),
      itemId: z.string(),
      skill: z.string(),
      areaId: AreaZ,
      lang: LangZ,
      firstTry: z.boolean(),
      misses: z.number(),
      hintsUsed: z.number(),
      durationMs: z.number(),
      quality: z.number().min(0).max(1).optional(),
      ts: z.number(),
    }),
  ),
  mastery: z.array(
    z.object({
      key: z.string(),
      skillId: z.string(),
      lang: LangZ,
      score: z.number().min(0).max(1),
      box: z.number().int().min(1).max(5),
      attempts: z.number(),
      firstTryCorrect: z.number(),
      lastSeen: z.number(),
      dueAt: z.number(),
    }),
  ),
  levels: z.array(
    z.object({
      key: z.string(),
      areaId: AreaZ,
      lang: LangZ,
      level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
      streakCorrect: z.number(),
      streakMiss: z.number(),
    }),
  ),
  completions: z.array(
    z.object({ activityId: z.string(), areaId: AreaZ, lang: LangZ, items: z.number(), stars: z.number(), ts: z.number() }),
  ),
  rewards: z.array(z.object({ rewardId: z.string(), earnedAt: z.number() })),
  storyProgress: z.array(
    z.object({ storyId: z.string(), page: z.number(), finished: z.boolean(), lang: LangZ, updatedAt: z.number() }),
  ),
})
export type ProgressExport = z.infer<typeof ExportZ>

export async function exportProgress(): Promise<ProgressExport> {
  const profile = await db.profile.get('main')
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    // The name recordings stay on this device: they are never part of an export.
    profile: profile ? { nameAr: profile.nameAr, nameEn: profile.nameEn, gender: profile.gender, ageBand: profile.ageBand } : undefined,
    attempts: (await db.attempts.toArray()).map(({ id: _id, ...rest }) => rest),
    mastery: await db.mastery.toArray(),
    levels: await db.levels.toArray(),
    completions: (await db.completions.toArray()).map(({ id: _id, ...rest }) => rest),
    rewards: await db.rewards.toArray(),
    storyProgress: await db.storyProgress.toArray(),
  }
}

/** Replaces current progress with the file's contents. Throws on invalid files (nothing is changed). */
export async function importProgress(json: unknown): Promise<void> {
  const data = ExportZ.parse(json)
  await db.transaction('rw', [db.attempts, db.mastery, db.levels, db.completions, db.rewards, db.storyProgress, db.profile], async () => {
    for (const t of PROGRESS_TABLES) await db.table(t).clear()
    await db.attempts.bulkAdd(data.attempts)
    await db.mastery.bulkPut(data.mastery)
    await db.levels.bulkPut(data.levels)
    await db.completions.bulkAdd(data.completions)
    await db.rewards.bulkPut(data.rewards)
    await db.storyProgress.bulkPut(data.storyProgress)
    if (data.profile) await db.profile.put({ id: 'main', ...data.profile })
  })
}

/** Clears learning progress, stars, stickers and history. Keeps drawings, settings, PIN. */
export async function resetProgress(): Promise<void> {
  await db.transaction('rw', PROGRESS_TABLES.map((t) => db.table(t)), async () => {
    for (const t of PROGRESS_TABLES) await db.table(t).clear()
  })
}

/** Removes everything this app stored on the device. The app returns to first-run setup. */
export async function deleteAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear()
  })
  await db.settings.put({ ...DEFAULT_SETTINGS })
  try {
    localStorage.clear()
  } catch {
    // storage may be unavailable (private mode); nothing else to clear
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | undefined> {
  try {
    const e = await navigator.storage?.estimate?.()
    if (!e || e.usage === undefined || e.quota === undefined) return undefined
    return { usage: e.usage, quota: e.quota }
  } catch {
    return undefined
  }
}
