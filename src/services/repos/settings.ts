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
  // Hala starts silent: a grown-up reads the large captions, and can turn her voice on in settings.
  narration: false,
  narrationVolume: 0.9,
  sfxVolume: 0.5,
  speechRate: 1,
  captions: true,
  reducedMotion: false,
  highContrast: false,
  rewardsEnabled: true,
  dailyLimitMin: 0,
  quranPause: false,
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

const cleanName = (v: string | undefined) => (v === undefined ? undefined : v.trim().slice(0, 24) || undefined)

export async function updateProfile(patch: Partial<Omit<ProfileRow, 'id'>>): Promise<void> {
  const current = await getProfile()
  const next: ProfileRow = { ...current, ...patch, id: 'main' }
  for (const k of ['nickname', 'nameAr', 'nameEn'] as const) next[k] = k in patch ? cleanName(patch[k]) : current[k]
  await db.profile.put(next)
}
