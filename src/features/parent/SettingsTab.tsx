import { useEffect, useState } from 'react'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Button, Field, Panel, Segmented, Switch } from '../../design/ui'
import type { DifficultySetting } from '../../domain/engine/difficulty'
import type { AreaId, Lang, LearningMode } from '../../domain/types'
import type { ProfileRow } from '../../services/db'
import { hashPin, isValidPin, newSalt } from '../../services/parentGate'
import { updateProfile } from '../../services/repos/settings'
import { type ChildDraft, ChildForm } from '../welcome/ChildForm'
import { type OnDeviceStatus, installOnDevice, micSupported, onDeviceStatus } from '../speech/speechService'
import s from './parent.module.css'

export function SettingsTab() {
  const { settings, profile, t, update } = useApp()
  const [child, setChild] = useState<ChildDraft>({ gender: profile.gender, nameAr: profile.nameAr ?? '', nameEn: profile.nameEn ?? '' })
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinMsg, setPinMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const changePin = async () => {
    if (!isValidPin(pin)) return setPinMsg({ ok: false, text: t.setup.pinInvalid })
    if (pin !== pin2) return setPinMsg({ ok: false, text: t.setup.pinMismatch })
    const salt = newSalt()
    await update({ pinSalt: salt, pinHash: await hashPin(pin, salt) })
    setPin('')
    setPin2('')
    setPinMsg({ ok: true, text: t.parent.pinChanged })
  }

  const range = (label: string, value: number, onChange: (v: number) => void) => (
    <Field label={`${label}: ${Math.round(value * 100)}%`}>
      <input type="range" min={0} max={1} step={0.1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )

  return (
    <div className={s.grid2}>
      <Panel>
        <div className={s.section} id="child">
          <h2>{t.parent.child}</h2>
          <ChildForm
            value={child}
            onChange={(patch) => {
              setChild((c) => ({ ...c, ...patch }))
              if (patch.gender) void updateProfile({ gender: patch.gender })
            }}
            onNameBlur={() => void updateProfile({ ...(child.nameAr.trim() && { nameAr: child.nameAr }), ...(child.nameEn.trim() && { nameEn: child.nameEn }) })}
          />
        </div>
      </Panel>
      <Panel>
        <div className={s.section}>
          <Segmented<Lang>
            label={t.parent.uiLang}
            value={settings.uiLang}
            options={[
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(v) => void update({ practiceLang: v, learningMode: settings.learningMode === 'both' ? 'both' : v })}
          />
          <Segmented<LearningMode>
            label={t.parent.learningMode}
            value={settings.learningMode}
            options={[
              { value: 'both', label: t.setup.modeBoth },
              { value: 'ar', label: t.setup.modeAr },
              { value: 'en', label: t.setup.modeEn },
            ]}
            onChange={(v) => void update({ learningMode: v, practiceLang: v === 'both' ? settings.practiceLang : v })}
          />
          <Segmented<NonNullable<ProfileRow['ageBand']> | ''>
            label={t.parent.ageBand}
            value={profile.ageBand ?? ''}
            options={[
              { value: '', label: '—' },
              { value: '3-4', label: '3–4' },
              { value: '4-5', label: '4–5' },
              { value: '5-6', label: '5–6' },
            ]}
            onChange={(v) => void updateProfile({ ageBand: v || undefined })}
          />
        </div>
      </Panel>

      <Panel>
        <div className={s.section}>
          <Switch label={t.parent.narration} checked={settings.narration} onChange={(v) => void update({ narration: v })} />
          <p className={s.note}>{t.readAloud.settingHint}</p>
          {range(t.parent.narrationVolume, settings.narrationVolume, (v) => void update({ narrationVolume: v }))}
          {range(t.parent.sfxVolume, settings.sfxVolume, (v) => void update({ sfxVolume: v }))}
          <Segmented<number>
            label={t.parent.speechRate}
            value={settings.speechRate}
            options={[
              { value: 0.8, label: t.parent.slow },
              { value: 1, label: t.parent.normal },
            ]}
            onChange={(v) => void update({ speechRate: v })}
          />
          <Switch label={t.parent.captions} checked={settings.captions} onChange={(v) => void update({ captions: v })} />
          <MicSetting />
          <Switch label={t.parent.reducedMotion} checked={settings.reducedMotion} onChange={(v) => void update({ reducedMotion: v })} />
          <Switch label={t.parent.highContrast} checked={settings.highContrast} onChange={(v) => void update({ highContrast: v })} />
          <Switch label={t.parent.rewardsOn} checked={settings.rewardsEnabled} onChange={(v) => void update({ rewardsEnabled: v })} />
          <Segmented<number>
            label={t.parent.dailyLimit}
            value={settings.dailyLimitMin}
            options={[0, 15, 20, 30, 45, 60].map((m) => ({ value: m, label: m === 0 ? t.parent.noLimit : String(m) }))}
            onChange={(v) => void update({ dailyLimitMin: v })}
          />
        </div>
      </Panel>

      <Panel>
        <div className={s.section}>
          <h2>{t.parent.changePin}</h2>
          <Field label={t.gate.newPin}>
            <input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} dir="ltr" autoComplete="new-password" />
          </Field>
          <Field label={t.setup.pinRepeat}>
            <input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} dir="ltr" autoComplete="new-password" />
          </Field>
          {pinMsg && <p className={pinMsg.ok ? s.ok : s.err}>{pinMsg.text}</p>}
          <Button variant="teal" icon="check" onClick={() => void changePin()}>
            {t.common.save}
          </Button>
        </div>
      </Panel>
    </div>
  )
}

/**
 * Speaking practice opt-in. The browser asks for microphone permission on first use in an
 * activity; recordings stay in memory. Shows whether word recognition can run on this device.
 */
function MicSetting() {
  const { settings, t, update } = useApp()
  const lang = settings.practiceLang
  const [status, setStatus] = useState<OnDeviceStatus | 'working' | null>(null)
  useEffect(() => {
    let cancelled = false
    if (settings.micEnabled) void onDeviceStatus(lang).then((st) => !cancelled && setStatus(st))
    return () => {
      cancelled = true
    }
  }, [settings.micEnabled, lang])

  const prepare = async () => {
    setStatus('working')
    await installOnDevice(lang)
    setStatus(await onDeviceStatus(lang))
  }

  return (
    <>
      <Switch label={t.parent.mic} checked={settings.micEnabled} onChange={(v) => void update({ micEnabled: v })} />
      <p className={s.note}>{t.parent.micHint}</p>
      {settings.micEnabled && !micSupported() && <p className={s.err}>{t.parent.micUnsupported}</p>}
      {settings.micEnabled && micSupported() && status === 'available' && <p className={s.ok}>{t.parent.onDeviceReady}</p>}
      {settings.micEnabled && micSupported() && status === 'unavailable' && <p className={s.note}>{t.parent.onDeviceNone}</p>}
      {settings.micEnabled && micSupported() && (status === 'downloadable' || status === 'downloading' || status === 'working') && (
        <Button variant="secondary" icon="save" onClick={() => void prepare()} disabled={status === 'working' || status === 'downloading'}>
          {status === 'downloadable' ? t.parent.onDeviceDownload : t.parent.onDeviceWorking}
        </Button>
      )}
    </>
  )
}

/** Turn learning areas on/off and pin difficulty per area. Hidden areas keep their progress. */
export function SubjectsTab() {
  const { settings, t, update } = useApp()
  const toggle = (id: AreaId, on: boolean) => {
    const set = new Set(settings.disabledAreas)
    if (on) set.delete(id)
    else set.add(id)
    void update({ disabledAreas: [...set] })
  }
  const setDifficulty = (id: AreaId, v: DifficultySetting) => void update({ areaDifficulty: { ...settings.areaDifficulty, [id]: v } })

  return (
    <div className={s.section}>
      <p className={s.note}>{t.parent.subjectsHint}</p>
      <div className={s.grid2}>
        {content.areas.map((a) => {
          const on = !settings.disabledAreas.includes(a.id)
          return (
            <Panel key={a.id}>
              <div className={s.section}>
                <Switch label={a.title[settings.uiLang]} checked={on} onChange={(v) => toggle(a.id, v)} />
                {on && a.route === 'map' && (
                  <Segmented<string>
                    label={t.parent.difficulty}
                    value={String(settings.areaDifficulty[a.id] ?? 'auto')}
                    options={[{ value: 'auto', label: t.parent.auto }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]}
                    onChange={(v) => setDifficulty(a.id, v === 'auto' ? 'auto' : (Number(v) as DifficultySetting))}
                  />
                )}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
