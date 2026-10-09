import { AREA_IDS } from '../../domain/types'
import { type ProfileRow, type SettingsRow, db } from '../db'

export const DEFAULT_SETTINGS: SettingsRow = {
  id: 'main',
  onboarded: false,
  uiLang: 'ar',
  learningMode: 'both',
  practiceLang: 'ar',
  disabledAreas: [],
  areaDifficulty: {},
  narration: true,
  narrationVolume: 0.9,
  sfxVolume: 0.5,
  speechRate: 1,
  captions: true,
  micEnabled: false,
  reducedMotion: false,
  highContrast: false,
  rewardsEnabled: true,
  dailyLimitMin: 0,
}

/** Settings with defaults filled in, so new fields added later never break old installs. */
export async function getSettings(): Promise<SettingsRow> {
  const row = await db.settings.get('main')
  return normalizeSettings(row)
}

export function normalizeSettings(row: Partial<SettingsRow> | undefined): SettingsRow {
  const merged = { ...DEFAULT_SETTINGS, ...(row ?? {}), id: 'main' as const }
  merged.disabledAreas = (merged.disabledAreas ?? []).filter((a) => (AREA_IDS as readonly string[]).includes(a))
  if (merged.learningMode !== 'both') merged.practiceLang = merged.learningMode
  // One language at a time: the screen language always follows the learning language.
  merged.uiLang = merged.practiceLang
  return merged
}

export async function updateSettings(patch: Partial<Omit<SettingsRow, 'id'>>): Promise<SettingsRow> {
  return db.transaction('rw', db.settings, async () => {
    const next = normalizeSettings({ ...(await getSettings()), ...patch })
    await db.settings.put(next)
    return next
  })
}

export async function getProfile(): Promise<ProfileRow> {
  return (await db.profile.get('main')) ?? { id: 'main' }
}

export async function updateProfile(patch: Partial<Omit<ProfileRow, 'id'>>): Promise<void> {
  const current = await getProfile()
  const nickname = patch.nickname !== undefined ? patch.nickname.trim().slice(0, 24) || undefined : current.nickname
  await db.profile.put({ ...current, ...patch, nickname, id: 'main' })
}
