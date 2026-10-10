import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/AppState'
import { Button, Field } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import type { Gender } from '../../domain/child'
import type { Lang, LearningMode } from '../../domain/types'
import { deleteNameClip, getNameClips, saveNameClip } from '../../services/repos/settings'
import { micSupported } from '../speech/speechService'
import s from './welcome.module.css'

export interface ChildDraft {
  gender?: Gender
  nameAr: string
  nameEn: string
}

/** The child's name is needed in every language they learn (it is said in stories and greetings). */
export function nameLangs(mode: LearningMode): Lang[] {
  return mode === 'both' ? ['ar', 'en'] : [mode]
}

export function childComplete(c: ChildDraft, mode: LearningMode): boolean {
  return !!c.gender && nameLangs(mode).every((l) => (l === 'ar' ? c.nameAr : c.nameEn).trim())
}

/** Boy / girl pictures (Rawda's own drawings; see content/pictureSources.ts). */
const PICTURE: Record<Gender, string> = { m: 'E001', f: 'E002' }

/**
 * Who the child is: boy or girl, and their name in Arabic and English, each with an
 * optional recording of a grown-up saying it. Used by first-run setup and parent settings.
 */
export function ChildForm({ value, onChange, onNameBlur }: { value: ChildDraft; onChange: (patch: Partial<ChildDraft>) => void; onNameBlur?: () => void }) {
  const { t, settings } = useApp()
  const langs = nameLangs(settings.learningMode)
  return (
    <div className={s.childForm}>
      <div className={s.genderField}>
        <span className={s.label}>{t.setup.childIs}</span>
        <div className={s.genderRow} role="radiogroup" aria-label={t.setup.childIs}>
          {(['m', 'f'] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={value.gender === g}
              className={[s.genderBtn, value.gender === g ? s.genderOn : ''].join(' ')}
              onClick={() => onChange({ gender: g })}
              data-testid={`gender-${g}`}
            >
              <OpenMoji hex={PICTURE[g]} alt="" size={96} />
              {g === 'm' ? t.setup.boy : t.setup.girl}
            </button>
          ))}
        </div>
        <span className={s.hint}>{t.setup.genderHint}</span>
      </div>
      {langs.includes('ar') && <NameField lang="ar" label={t.setup.nameAr} value={value.nameAr} onChange={(nameAr) => onChange({ nameAr })} onBlur={onNameBlur} />}
      {langs.includes('en') && <NameField lang="en" label={t.setup.nameEn} value={value.nameEn} onChange={(nameEn) => onChange({ nameEn })} onBlur={onNameBlur} />}
      <p className={s.hint}>{t.setup.nameHint}</p>
    </div>
  )
}

function NameField({ lang, label, value, onChange, onBlur }: { lang: Lang; label: string; value: string; onChange: (v: string) => void; onBlur?: () => void }) {
  return (
    <div className={s.nameRow}>
      <Field label={label}>
        <input value={value} required maxLength={24} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} autoComplete="off" lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-testid={`name-${lang}`} />
      </Field>
      <NameRecorder lang={lang} />
    </div>
  )
}

/** Longest recording: a name, not a sentence. */
const MAX_MS = 3000

/** Record, play back, re-record or delete a grown-up saying the child's name. Stays on this device. */
function NameRecorder({ lang }: { lang: Lang }) {
  const { t } = useApp()
  const clips = useLiveQuery(getNameClips, [], {} as Partial<Record<Lang, Blob>>)
  const clip = clips[lang]
  const [state, setState] = useState<'idle' | 'recording' | 'denied'>('idle')
  const stopRef = useRef<() => void>(undefined)
  useEffect(() => () => stopRef.current?.(), [])

  if (!micSupported()) return <p className={s.hint}>{t.setup.recordUnsupported}</p>

  const record = async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      setState('denied')
      return
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop())
      clearTimeout(timer)
      stopRef.current = undefined
      setState('idle')
      if (chunks.length) void saveNameClip(lang, new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type }))
    }
    const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_MS)
    stopRef.current = () => recorder.state === 'recording' && recorder.stop()
    recorder.start()
    setState('recording')
  }

  const play = () => {
    if (!clip) return
    const url = URL.createObjectURL(clip)
    const el = new Audio(url)
    el.onended = el.onerror = () => URL.revokeObjectURL(url)
    void el.play().catch(() => URL.revokeObjectURL(url))
  }

  return (
    <div className={s.recorder}>
      {state === 'recording' ? (
        <>
          <span className={s.recDot} aria-hidden="true" />
          <span className={s.hint}>{t.setup.recording}</span>
          <Button variant="secondary" icon="check" onClick={() => stopRef.current?.()}>
            {t.setup.stopRecording}
          </Button>
        </>
      ) : (
        <>
          <Button variant="secondary" icon="mic" onClick={() => void record()} data-testid={`record-${lang}`}>
            {clip ? t.setup.recordAgain : t.setup.recordName}
          </Button>
          {clip && (
            <>
              <Button variant="secondary" icon="speaker" onClick={play}>
                {t.setup.listenName}
              </Button>
              <Button variant="secondary" icon="trash" onClick={() => void deleteNameClip(lang)}>
                {t.setup.deleteRecording}
              </Button>
            </>
          )}
        </>
      )}
      {state === 'denied' ? <p className={s.error}>{t.setup.recordDenied}</p> : !clip && state === 'idle' && <span className={s.hint}>{t.setup.recordHint}</span>}
    </div>
  )
}
