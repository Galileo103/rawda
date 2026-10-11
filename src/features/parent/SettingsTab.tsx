import { type CSSProperties, type ReactNode, useState } from 'react'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import type { Area } from '../../content/schemas'
import { Icon, type IconName } from '../../design/Icon'
import { Button, Dialog, Field, Panel, Segmented, Switch } from '../../design/ui'
import { Visual } from '../../design/Visual'
import type { DifficultySetting } from '../../domain/engine/difficulty'
import type { Lang, LearningMode } from '../../domain/types'
import { fmt } from '../../i18n'
import type { ProfileRow } from '../../services/db'
import { hashPin, isValidPin, newSalt } from '../../services/parentGate'
import { updateProfile } from '../../services/repos/settings'
import { iconFor } from '../common'
import { type ChildDraft, ChildForm } from '../welcome/ChildForm'
import s from './parent.module.css'

/** A settings group: icon, heading, a one-line "Now: …" summary of its current values, then the controls. */
function Group({ id, icon, title, now, children }: { id: string; icon: IconName; title: string; now?: string; children: ReactNode }) {
  return (
    <Panel className={s.group}>
      <div className={s.section} id={id}>
        <div className={s.groupHead}>
          <span className={s.groupIcon} aria-hidden="true">
            <Icon name={icon} size={24} />
          </span>
          <div>
            <h2>{title}</h2>
            {now && <p className={s.now}>{now}</p>}
          </div>
        </div>
        {children}
      </div>
    </Panel>
  )
}

export function SettingsTab() {
  const { settings, profile, t, update } = useApp()
  const P = t.parent
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
    setPinMsg({ ok: true, text: P.pinChanged })
  }

  const onOff = (v: boolean) => (v ? P.on : P.off)
  const minutes = (m: number) => (m === 0 ? P.noLimit : fmt(P.minutes, { n: m }))
  const modeLabel = { both: t.setup.modeBoth, ar: t.setup.modeAr, en: t.setup.modeEn }[settings.learningMode]
  const name = (settings.uiLang === 'ar' ? profile.nameAr : profile.nameEn) ?? profile.nameAr ?? profile.nameEn
  const age = profile.ageBand ? `⁦${profile.ageBand.replace('-', '–')}⁩` : undefined

  const range = (label: string, value: number, onChange: (v: number) => void) => (
    <Field label={label}>
      <span className={s.rangeRow}>
        <input type="range" min={0} max={1} step={0.1} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-valuetext={`${Math.round(value * 100)}%`} />
        <bdi className={s.rangeVal}>{Math.round(value * 100)}%</bdi>
      </span>
    </Field>
  )

  return (
    <div className={s.settingsGrid}>
      <Group id="time" icon="clock" title={P.secTime} now={fmt(P.now, { v: `${minutes(settings.dailyLimitMin)} · ${P.rewardsOn}: ${onOff(settings.rewardsEnabled)}` })}>
        <Segmented<number> label={P.dailyLimit} value={settings.dailyLimitMin} options={[0, 15, 20, 30, 45, 60].map((m) => ({ value: m, label: minutes(m) }))} onChange={(v) => void update({ dailyLimitMin: v })} />
        <Switch label={P.rewardsOn} checked={settings.rewardsEnabled} onChange={(v) => void update({ rewardsEnabled: v })} />
      </Group>

      <Group id="sound" icon="speaker" title={P.secSound} now={fmt(P.now, { v: `${P.narration}: ${onOff(settings.narration)}` })}>
        <Switch label={P.narration} checked={settings.narration} onChange={(v) => void update({ narration: v })} />
        <p className={s.note}>{t.readAloud.settingHint}</p>
        {range(P.narrationVolume, settings.narrationVolume, (v) => void update({ narrationVolume: v }))}
        {range(P.sfxVolume, settings.sfxVolume, (v) => void update({ sfxVolume: v }))}
        <Segmented<number>
          label={P.speechRate}
          value={settings.speechRate}
          options={[
            { value: 0.8, label: P.slow },
            { value: 1, label: P.normal },
          ]}
          onChange={(v) => void update({ speechRate: v })}
        />
      </Group>

      <Group id="languages" icon="globe" title={P.secLanguages} now={fmt(P.now, { v: modeLabel })}>
        <Segmented<Lang>
          label={P.uiLang}
          value={settings.uiLang}
          options={[
            { value: 'ar', label: 'العربية' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(v) => void update({ practiceLang: v, learningMode: settings.learningMode === 'both' ? 'both' : v })}
        />
        <Segmented<LearningMode>
          label={P.learningMode}
          value={settings.learningMode}
          options={[
            { value: 'both', label: t.setup.modeBoth },
            { value: 'ar', label: t.setup.modeAr },
            { value: 'en', label: t.setup.modeEn },
          ]}
          onChange={(v) => void update({ learningMode: v, practiceLang: v === 'both' ? settings.practiceLang : v })}
        />
        <p className={s.muted}>{P.languageHint}</p>
      </Group>

      <Group id="child" icon="user" title={P.secChild} now={name ? fmt(P.now, { v: [name, age].filter(Boolean).join(' · ') }) : undefined}>
        <ChildForm
          value={child}
          onChange={(patch) => {
            setChild((c) => ({ ...c, ...patch }))
            if (patch.gender) void updateProfile({ gender: patch.gender })
          }}
          onNameBlur={() => void updateProfile({ ...(child.nameAr.trim() && { nameAr: child.nameAr }), ...(child.nameEn.trim() && { nameEn: child.nameEn }) })}
        />
        <Segmented<NonNullable<ProfileRow['ageBand']> | ''>
          label={P.ageBand}
          value={profile.ageBand ?? ''}
          options={[
            { value: '', label: '—' },
            // Isolated left-to-right so Arabic screens show 3–4, not 4–3.
            { value: '3-4', label: '⁦3–4⁩' },
            { value: '4-5', label: '⁦4–5⁩' },
            { value: '5-6', label: '⁦5–6⁩' },
          ]}
          onChange={(v) => void updateProfile({ ageBand: v || undefined })}
        />
      </Group>

      <Group
        id="access"
        icon="eye"
        title={P.secAccess}
        now={fmt(P.now, { v: [settings.captions && P.captions, settings.reducedMotion && P.reducedMotion, settings.highContrast && P.highContrast].filter(Boolean).join(' · ') || '—' })}
      >
        <Switch label={P.captions} checked={settings.captions} onChange={(v) => void update({ captions: v })} />
        <Switch label={P.reducedMotion} checked={settings.reducedMotion} onChange={(v) => void update({ reducedMotion: v })} />
        <Switch label={P.highContrast} checked={settings.highContrast} onChange={(v) => void update({ highContrast: v })} />
      </Group>

      <Group id="pin" icon="lock" title={P.secPin} now={fmt(P.now, { v: P.pinSet })}>
        <Field label={t.gate.newPin}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''))
              setPinMsg(null)
            }}
            dir="ltr"
            autoComplete="new-password"
          />
        </Field>
        <Field label={t.setup.pinRepeat}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin2}
            onChange={(e) => {
              setPin2(e.target.value.replace(/\D/g, ''))
              setPinMsg(null)
            }}
            dir="ltr"
            autoComplete="new-password"
          />
        </Field>
        {pinMsg && (
          <p className={pinMsg.ok ? s.ok : s.err} role="status">
            {pinMsg.text}
          </p>
        )}
        <div>
          <Button variant="teal" icon="check" onClick={() => void changePin()} disabled={pin.length < 4 || pin2.length < 4}>
            {t.common.save}
          </Button>
        </div>
      </Group>
    </div>
  )
}

/** Difficulty in words: Easy / Medium / Hard stand for levels 1, 3 and 5 (2 and 4 show as their neighbours). */
const LEVEL_OF = { easy: 1, medium: 3, hard: 5 } as const
type Named = 'auto' | keyof typeof LEVEL_OF
const named = (d: DifficultySetting | undefined): Named => (d === undefined || d === 'auto' ? 'auto' : d <= 2 ? 'easy' : d === 3 ? 'medium' : 'hard')

/** Turn learning areas on/off and set difficulty per area. Hidden areas keep their progress. */
export function SubjectsTab() {
  const { settings, t, update } = useApp()
  const P = t.parent
  const ui = settings.uiLang
  const [asking, setAsking] = useState<Area | null>(null)
  const setOn = (id: Area['id'], on: boolean) => {
    const set = new Set(settings.disabledAreas)
    if (on) set.delete(id)
    else set.add(id)
    void update({ disabledAreas: [...set] })
  }
  const setDifficulty = (id: Area['id'], v: Named) => void update({ areaDifficulty: { ...settings.areaDifficulty, [id]: v === 'auto' ? 'auto' : LEVEL_OF[v] } })

  return (
    <div className={s.stack}>
      <p className={s.note}>{P.subjectsHint}</p>
      <div className={s.subjectList}>
        {content.areas.map((a) => {
          const on = !settings.disabledAreas.includes(a.id)
          const icon = iconFor(a, ui)
          return (
            <Panel key={a.id} className={[s.subject, on ? '' : s.subjectOff].join(' ')}>
              <div className={s.subjectRow}>
                <span className={s.subjectIcon} style={{ '--ac': a.color } as CSSProperties} aria-hidden="true">
                  <Visual v={icon} lang={ui} size={icon.kind === 'glyph' ? 30 : 40} />
                </span>
                <div className={s.subjectSwitch}>
                  <Switch label={a.title[ui]} checked={on} onChange={(v) => (v ? setOn(a.id, true) : setAsking(a))} />
                  {!on && <span className={s.hiddenChip}>{P.hidden}</span>}
                </div>
              </div>
              {on && a.route === 'map' && (
                <div className={s.subjectMore}>
                  <Segmented<Named>
                    label={P.difficulty}
                    value={named(settings.areaDifficulty[a.id])}
                    options={[
                      { value: 'auto', label: P.auto },
                      { value: 'easy', label: P.easy },
                      { value: 'medium', label: P.medium },
                      { value: 'hard', label: P.hard },
                    ]}
                    onChange={(v) => setDifficulty(a.id, v)}
                  />
                </div>
              )}
            </Panel>
          )
        })}
      </div>
      <p className={s.muted}>{P.difficultyHint}</p>

      {asking && (
        <Dialog label={fmt(P.hideTitle, { subject: asking.title[ui] })} onClose={() => setAsking(null)}>
          <h2 className={s.dialogTitle}>{fmt(P.hideTitle, { subject: asking.title[ui] })}</h2>
          <p>{P.hideBody}</p>
          <div className={s.row}>
            <Button
              variant="teal"
              onClick={() => {
                setOn(asking.id, false)
                setAsking(null)
              }}
              data-testid="hide-subject-confirm"
            >
              {P.hideConfirm}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
