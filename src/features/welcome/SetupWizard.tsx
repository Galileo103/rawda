import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { Button, Field, Panel, Screen, Segmented } from '../../design/ui'
import { type ChildDraft, ChildForm, childComplete } from './ChildForm'
import type { Lang, LearningMode } from '../../domain/types'
import { fmt } from '../../i18n'
import type { ProfileRow } from '../../services/db'
import { hashPin, isValidPin, newSalt } from '../../services/parentGate'
import { updateProfile, updateSettings } from '../../services/repos/settings'
import s from './welcome.module.css'

/** First-run setup for the grown-up: languages, the child (boy/girl and name required, age), parent PIN. */
export function SetupWizard() {
  const { settings, t, update } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [child, setChild] = useState<ChildDraft>({ nameAr: '', nameEn: '' })
  const [ageBand, setAgeBand] = useState<NonNullable<ProfileRow['ageBand']> | ''>('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')

  if (settings.onboarded) return <Navigate to="/home" replace />
  const childOk = childComplete(child, settings.learningMode)

  const finish = async () => {
    if (!isValidPin(pin)) return setError(t.setup.pinInvalid)
    if (pin !== pin2) return setError(t.setup.pinMismatch)
    const salt = newSalt()
    await updateProfile({ ...child, ageBand: ageBand || undefined })
    await updateSettings({ onboarded: true, pinSalt: salt, pinHash: await hashPin(pin, salt) })
    navigate('/home', { replace: true })
  }

  const setMode = (mode: LearningMode) => {
    const practiceLang: Lang = mode === 'both' ? settings.uiLang : mode
    void update({ learningMode: mode, practiceLang })
  }

  return (
    <Screen child={false}>
      <div className={s.wizard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mascot mood="happy" size={96} />
          <div>
            <h1>{t.setup.title}</h1>
            <span className={s.step}>{fmt(t.setup.step, { n: step, total: 3 })}</span>
          </div>
        </div>

        {step === 1 && (
          <Panel>
            <div style={{ display: 'grid', gap: 18 }}>
              <p style={{ margin: 0 }}>{t.setup.intro}</p>
              <Segmented<Lang>
                label={t.setup.uiLang}
                value={settings.uiLang}
                options={[
                  { value: 'ar', label: 'العربية' },
                  { value: 'en', label: 'English' },
                ]}
                onChange={(v) => void update({ practiceLang: v, learningMode: settings.learningMode === 'both' ? 'both' : v })}
              />
              <Segmented<LearningMode>
                label={t.setup.learningMode}
                value={settings.learningMode}
                options={[
                  { value: 'both', label: t.setup.modeBoth },
                  { value: 'ar', label: t.setup.modeAr },
                  { value: 'en', label: t.setup.modeEn },
                ]}
                onChange={setMode}
              />
              <div className={s.privacy}>
                <Icon name="lock" />
                {t.setup.privacy}
              </div>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel>
            <div style={{ display: 'grid', gap: 18 }}>
              <h2 style={{ margin: 0 }}>{t.setup.aboutChild}</h2>
              <ChildForm value={child} onChange={(patch) => setChild((c) => ({ ...c, ...patch }))} />
              {!childOk && <p className={s.step}>{t.setup.needChild}</p>}
              <Segmented<NonNullable<ProfileRow['ageBand']> | ''>
                label={t.setup.ageBand}
                value={ageBand}
                options={[
                  { value: '', label: '—' },
                  { value: '3-4', label: '3–4' },
                  { value: '4-5', label: '4–5' },
                  { value: '5-6', label: '5–6' },
                ]}
                onChange={setAgeBand}
              />
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel>
            <div style={{ display: 'grid', gap: 18 }}>
              <Field label={t.setup.pinTitle} hint={t.setup.pinHint}>
                <input
                  className={s.pinInput}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, ''))
                    setError('')
                  }}
                  dir="ltr"
                />
              </Field>
              <Field label={t.setup.pinRepeat}>
                <input
                  className={s.pinInput}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={pin2}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setPin2(e.target.value.replace(/\D/g, ''))
                    setError('')
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && void finish()}
                  dir="ltr"
                />
              </Field>
              {error && (
                <p className={s.error} role="alert">
                  {error}
                </p>
              )}
            </div>
          </Panel>
        )}

        <div className={s.actions}>
          {step > 1 ? (
            <Button variant="secondary" icon="back" onClick={() => setStep(step - 1)}>
              {t.common.back}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button icon="next" onClick={() => setStep(step + 1)} disabled={step === 2 && !childOk} data-testid="setup-next">
              {t.common.next}
            </Button>
          ) : (
            <Button variant="teal" icon="check" onClick={() => void finish()}>
              {t.setup.finish}
            </Button>
          )}
        </div>
      </div>
    </Screen>
  )
}
