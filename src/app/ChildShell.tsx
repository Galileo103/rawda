import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { addUsage } from '../services/repos/progress'
import { useApp } from './AppState'

const TICK_SECONDS = 15

/** Wraps all child-facing screens: requires first-run setup and counts visible time (for the optional daily limit). */
export function ChildShell() {
  const { settings } = useApp()

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void addUsage(TICK_SECONDS).catch(() => undefined)
    }, TICK_SECONDS * 1000)
    return () => clearInterval(id)
  }, [])

  if (!settings.onboarded) return <Navigate to="/setup" replace />
  return <Outlet />
}
