import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOptionalApp } from '../app/AppState'
import { Icon, type IconName } from './Icon'
import s from './ui.module.css'

export function Screen({ children, className, child = true }: { children: ReactNode; className?: string; child?: boolean }) {
  return <main className={[s.screen, child ? 'child-mode' : '', className].filter(Boolean).join(' ')}>{children}</main>
}

export function TopBar({ title, backTo, onBack, backLabel, end }: { title?: ReactNode; backTo?: string; onBack?: () => void; backLabel: string; end?: ReactNode }) {
  const navigate = useNavigate()
  return (
    <header className={s.topBar}>
      <IconButton icon={backTo === '/home' ? 'home' : 'back'} label={backLabel} onClick={onBack ?? (() => navigate(backTo ?? '/home'))} />
      <h1 className={s.topTitle}>{title}</h1>
      <div className={s.topEnd}>{end}</div>
    </header>
  )
}

type Variant = 'primary' | 'secondary' | 'teal' | 'grape' | 'danger' | 'ghost'
export function Button({ variant = 'primary', size, icon, children, className, ...rest }: { variant?: Variant; size?: 'lg'; icon?: IconName } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={[s.btn, variant !== 'primary' ? s[variant] : '', size === 'lg' ? s.lg : '', className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 34 : 26} />}
      {children}
    </button>
  )
}

/** Large round icon button; the label is always available to screen readers and optionally shown. */
export function IconButton({ icon, label, showLabel, size = 30, className, ...rest }: { icon: IconName; label: string; showLabel?: boolean; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className={[s.iconBtn, className].filter(Boolean).join(' ')} {...rest}>
      <Icon name={icon} size={size} />
      {showLabel && <span className={s.iconLabel}>{label}</span>}
    </button>
  )
}

/** `readAloud`: voice is off and a grown-up reads this line to the child, so it is shown larger. */
export function SpeechBubble({ text, lang, className, readAloud }: { text: string; lang?: string; className?: string; readAloud?: boolean }) {
  const app = useOptionalApp()
  if (!text) return null
  // Hala's lines may name the child (@name); the bubble shows the written name.
  if (app && (lang === 'ar' || lang === 'en')) text = app.named(text, lang)
  return (
    <p className={[s.bubble, readAloud ? s.readAloud : '', className].filter(Boolean).join(' ')} lang={lang} dir="auto" aria-live="polite" data-testid={readAloud ? 'read-aloud' : undefined}>
      {text}
    </p>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={[s.panel, className].filter(Boolean).join(' ')}>{children}</section>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      {label}
      {children}
      {hint && <span className={s.hint}>{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className={s.field}>
      <span>{label}</span>
      <div role="radiogroup" aria-label={label} className={s.segmented}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className={s.switchRow}>
      <span id={id}>{label}</span>
      <button type="button" role="switch" aria-labelledby={id} aria-checked={checked} className={s.switch} onClick={() => onChange(!checked)} />
    </div>
  )
}

export function StarCount({ n, label }: { n: number; label: string }) {
  return (
    <span className={s.stars} aria-label={`${label}: ${n}`}>
      <Icon name="star" size={24} />
      {n}
    </span>
  )
}

/** Parent-only confirmation for destructive actions: the parent must type a word. */
export function TypedConfirm({ title, body, word, prompt, confirmLabel, cancelLabel, onConfirm, onCancel }: { title: string; body: string; word: string; prompt: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  return (
    <div className={s.backdrop} role="presentation" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className={s.dialog} role="alertdialog" aria-modal="true" aria-label={title}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={{ margin: 0 }}>{body}</p>
        <Field label={prompt}>
          <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" autoComplete="off" dir="ltr" />
        </Field>
        <div className={s.dialogActions}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" disabled={typed.trim().toUpperCase() !== word} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Dialog({ label, children, onClose }: { label: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className={s.backdrop} role="presentation" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}
