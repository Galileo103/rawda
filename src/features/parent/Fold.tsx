import { type ReactNode, useState } from 'react'
import s from './parent.module.css'

const KEY = 'rawda.parent.folds'

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/**
 * A titled section the parent can fold away. Remembers open/closed per section on this
 * device (a convenience only: without storage it simply uses `defaultOpen`).
 */
export function Fold({ id, title, defaultOpen = false, children, testId }: { id: string; title: string; defaultOpen?: boolean; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? defaultOpen)
  return (
    <details
      className={s.fold}
      open={open}
      data-testid={testId}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open
        setOpen(now)
        try {
          localStorage.setItem(KEY, JSON.stringify({ ...readOpen(), [id]: now }))
        } catch {
          /* storage unavailable: still works for this visit */
        }
      }}
    >
      <summary>
        <h2>{title}</h2>
        <svg className={s.foldChevron} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <div className={s.foldBody}>{children}</div>
    </details>
  )
}
