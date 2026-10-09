import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, createContext, useContext, useLayoutEffect, useMemo } from 'react'
import { Mascot } from '../design/Mascot'
import { type AgeProfile, ageProfile } from '../domain/ageProfile'
import type { Lang } from '../domain/types'
import { type Dict, dict, dirOf } from '../i18n'
import { audio } from '../services/audio/AudioService'
import { type ProfileRow, type SettingsRow, db, localDay } from '../services/db'
import { getProfile, getSettings, updateSettings } from '../services/repos/settings'

export interface AppState {
  settings: SettingsRow
  profile: ProfileRow
  /** UI dictionary for the app language. */
  t: Dict
  /**
   * The language the child is learning RIGHT NOW (one at a time): only its content is shown.
   * Switching language (ع / A) changes both the screen text and the content.
   */
  langs: Lang[]
  update: (patch: Partial<Omit<SettingsRow, 'id'>>) => Promise<void>
  usage: { secondsToday: number; limitReached: boolean }
  /** Age-adapted defaults (options, session length, prompts, breaks). */
  age: AgeProfile
}

const Ctx = createContext<AppState | null>(null)

/** Same as useApp, but null outside the provider (lets templates render standalone). */
export function useOptionalApp(): AppState | null {
  return useContext(Ctx)
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppStateProvider')
  return v
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(getSettings, [])
  const profile = useLiveQuery(getProfile, [])
  const usageRow = useLiveQuery(() => db.usage.get(localDay()), [])

  // Reflect settings on <html>: language, direction, motion and contrast.
  // Layout effect: direction is applied before paint, so there's no LTR flash on Arabic screens.
  useLayoutEffect(() => {
    if (!settings) return
    const html = document.documentElement
    html.lang = settings.uiLang
    html.dir = dirOf(settings.uiLang)
    html.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'
    html.dataset.contrast = settings.highContrast ? 'high' : 'normal'
    audio.configure({
      narration: settings.narration,
      narrationVolume: settings.narrationVolume,
      sfxVolume: settings.sfxVolume,
      speechRate: settings.speechRate,
    })
  }, [settings])

  const value = useMemo<AppState | null>(() => {
    if (!settings || !profile) return null
    const seconds = usageRow?.seconds ?? 0
    const allowance = settings.dailyLimitMin * 60 + (usageRow?.bonusSeconds ?? 0)
    return {
      settings,
      profile,
      t: dict(settings.uiLang),
      langs: [settings.practiceLang],
      update: async (patch) => {
        await updateSettings(patch)
      },
      usage: { secondsToday: seconds, limitReached: settings.dailyLimitMin > 0 && seconds >= allowance },
      age: ageProfile(profile.ageBand),
    }
  }, [settings, profile, usageRow])

  if (!value) return <Splash />
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

function Splash() {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }} aria-busy="true">
      <Mascot mood="sleep" size={140} />
    </div>
  )
}
