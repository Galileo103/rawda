import Dexie, { type EntityTable } from 'dexie'
import type { LevelState, DifficultySetting } from '../domain/engine/difficulty'
import type { MasteryRecord } from '../domain/engine/mastery'
import type { AreaId, Lang, LearningMode } from '../domain/types'

/**
 * Local-first persistence (IndexedDB via Dexie). Nothing here ever leaves the
 * device unless a parent explicitly exports it.
 */

export interface SettingsRow {
  id: 'main'
  onboarded: boolean
  uiLang: Lang
  learningMode: LearningMode
  /** Language for language-neutral activities (counting, colours…). */
  practiceLang: Lang
  disabledAreas: AreaId[]
  areaDifficulty: Partial<Record<AreaId, DifficultySetting>>
  narration: boolean
  narrationVolume: number
  sfxVolume: number
  speechRate: number
  captions: boolean
  /** Speaking practice may use the microphone (parent opt-in; audio stays in memory, never saved or sent). */
  micEnabled: boolean
  reducedMotion: boolean
  highContrast: boolean
  rewardsEnabled: boolean
  /** 0 = no limit. */
  dailyLimitMin: number
  pinHash?: string
  pinSalt?: string
}

export interface ProfileRow {
  id: 'main'
  nickname?: string
  ageBand?: '3-4' | '4-5' | '5-6'
}

export interface AttemptRow {
  id?: number
  activityId: string
  itemId: string
  skill: string
  areaId: AreaId
  lang: Lang
  firstTry: boolean
  misses: number
  hintsUsed: number
  /** Recorded for parents only; never used for mastery. */
  durationMs: number
  /**
   * Optional 0..1 detail for the parent dashboard (tracing coverage, speech heard
   * on-device vs self-checked). Never used for mastery.
   */
  quality?: number
  ts: number
}

export interface CompletionRow {
  id?: number
  activityId: string
  areaId: AreaId
  lang: Lang
  items: number
  stars: number
  ts: number
}

export interface RewardRow {
  rewardId: string
  earnedAt: number
}

export interface DrawingRow {
  id: string
  /** Composite image (white background + drawing + coloring-page lines). */
  pngDataUrl: string
  /** Drawing layer only, so the artwork can be reopened and edited. */
  layerDataUrl: string
  pageId?: string
  createdAt: number
  updatedAt: number
}

export interface StoryProgressRow {
  storyId: string
  page: number
  finished: boolean
  lang: Lang
  updatedAt: number
}

export interface UsageRow {
  /** Local date, YYYY-MM-DD. */
  day: string
  seconds: number
  bonusSeconds: number
}

export class RawdaDB extends Dexie {
  settings!: EntityTable<SettingsRow, 'id'>
  profile!: EntityTable<ProfileRow, 'id'>
  attempts!: EntityTable<AttemptRow, 'id'>
  mastery!: EntityTable<MasteryRecord, 'key'>
  levels!: EntityTable<LevelState, 'key'>
  completions!: EntityTable<CompletionRow, 'id'>
  rewards!: EntityTable<RewardRow, 'rewardId'>
  drawings!: EntityTable<DrawingRow, 'id'>
  storyProgress!: EntityTable<StoryProgressRow, 'storyId'>
  usage!: EntityTable<UsageRow, 'day'>

  constructor(name = 'rawda') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      profile: 'id',
      attempts: '++id, activityId, skill, lang, ts',
      mastery: 'key, skillId, lang, dueAt',
      levels: 'key',
      completions: '++id, activityId, areaId, ts',
      rewards: 'rewardId, earnedAt',
      drawings: 'id, updatedAt',
      storyProgress: 'storyId',
      usage: 'day',
    })
  }
}

export const db = new RawdaDB()

/** Tables that make up "learning progress" (cleared by reset; drawings and settings kept). */
export const PROGRESS_TABLES = ['attempts', 'mastery', 'levels', 'completions', 'rewards', 'storyProgress'] as const

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

export function localDay(ts = Date.now()): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
