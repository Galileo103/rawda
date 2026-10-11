import { useApp } from '../../app/AppState'
import { Field } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import type { Gender } from '../../domain/child'
import type { Lang, LearningMode } from '../../domain/types'
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
 * Who the child is: boy or girl, and their name in Arabic and English.
 * Used by first-run setup and parent settings.
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
    </div>
  )
}
