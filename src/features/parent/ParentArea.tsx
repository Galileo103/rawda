import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { Button, Screen } from '../../design/ui'
import { audio } from '../../services/audio/AudioService'
import { AboutTab } from './AboutTab'
import { DataTab } from './DataTab'
import { ParentGate } from './ParentGate'
import { ProgressTab } from './ProgressTab'
import { SettingsTab, SubjectsTab } from './SettingsTab'
import s from './parent.module.css'

const TABS = ['progress', 'settings', 'subjects', 'data', 'about'] as const
type Tab = (typeof TABS)[number]

// Unlock lives in memory only: a reload, or 10 minutes, re-locks the parent area.
const UNLOCK_MS = 10 * 60 * 1000
let unlockedUntil = 0

export function lockParentArea(): void {
  unlockedUntil = 0
}

export function ParentArea() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const params = useParams()
  const [unlocked, setUnlocked] = useState(() => unlockedUntil > Date.now())

  useEffect(() => {
    audio.stop()
  }, [])

  if (!settings.onboarded) return <Navigate to="/setup" replace />
  if (!unlocked)
    return (
      <ParentGate
        onUnlock={() => {
          unlockedUntil = Date.now() + UNLOCK_MS
          setUnlocked(true)
        }}
      />
    )

  const tab: Tab = (TABS as readonly string[]).includes(params['*'] ?? '') ? (params['*'] as Tab) : 'progress'

  return (
    <Screen child={false}>
      <div className={s.wrap}>
        <div className={s.head}>
          <h1>{t.parent.title}</h1>
          <Button
            variant="secondary"
            icon="lock"
            onClick={() => {
              lockParentArea()
              navigate('/home')
            }}
          >
            {t.parent.lock}
          </Button>
        </div>
        <div className={s.tabs} role="tablist">
          {TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={s.tab} onClick={() => navigate(`/parent/${id}`, { replace: true })}>
              {t.parent.tabs[id]}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === 'progress' && <ProgressTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'subjects' && <SubjectsTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </Screen>
  )
}
