import { type KeyboardEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { Icon, type IconName } from '../../design/Icon'
import { Screen } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import { audio } from '../../services/audio/AudioService'
import { PICTURE } from '../welcome/ChildForm'
import { AboutTab } from './AboutTab'
import { DataTab } from './DataTab'
import { ParentGate } from './ParentGate'
import { ProgressTab } from './ProgressTab'
import { SettingsTab, SubjectsTab } from './SettingsTab'
import s from './parent.module.css'

const TABS = ['progress', 'settings', 'subjects', 'data', 'about'] as const
type Tab = (typeof TABS)[number]
const TAB_ICON: Record<Tab, IconName> = { progress: 'chart', settings: 'settings', subjects: 'book', data: 'save', about: 'shield' }

// Unlock lives in memory only: a reload, or 10 minutes, re-locks the parent area.
const UNLOCK_MS = 10 * 60 * 1000
let unlockedUntil = 0

export function lockParentArea(): void {
  unlockedUntil = 0
}

export function ParentArea() {
  const { settings, profile, t } = useApp()
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
  const go = (id: Tab) => navigate(`/parent/${id}`, { replace: true })
  const name = (settings.uiLang === 'ar' ? profile.nameAr : profile.nameEn) ?? profile.nameAr ?? profile.nameEn

  // Arrow keys move between tabs (left/right follow the reading direction).
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.indexOf(tab)
    const rtl = document.documentElement.dir === 'rtl'
    const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : step ? (i + step + TABS.length) % TABS.length : -1
    if (to < 0) return
    e.preventDefault()
    go(TABS[to] as Tab)
    requestAnimationFrame(() => document.getElementById(`ptab-${TABS[to]}`)?.focus())
  }

  return (
    <Screen child={false}>
      <div className={s.wrap}>
        <header className={s.head}>
          <div className={s.who}>
            {profile.gender && (
              <span className={s.avatar}>
                <OpenMoji hex={PICTURE[profile.gender]} alt="" size={44} />
              </span>
            )}
            <div>
              <h1>{t.parent.title}</h1>
              {name && <p className={s.whoName}>{name}</p>}
            </div>
          </div>
          <button
            type="button"
            className={s.lockBtn}
            onClick={() => {
              lockParentArea()
              navigate('/home')
            }}
          >
            <Icon name="lock" size={22} />
            <span>{t.parent.lock}</span>
          </button>
        </header>
        <div className={s.tabs} role="tablist" aria-label={t.parent.title} onKeyDown={onTabKey}>
          {TABS.map((id) => (
            <button
              key={id}
              id={`ptab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls="parent-panel"
              tabIndex={tab === id ? 0 : -1}
              className={s.tab}
              onClick={() => go(id)}
            >
              <Icon name={TAB_ICON[id]} size={22} />
              <span>{t.parent.tabs[id]}</span>
            </button>
          ))}
        </div>
        <div id="parent-panel" role="tabpanel" aria-labelledby={`ptab-${tab}`} className={s.panelBody}>
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
