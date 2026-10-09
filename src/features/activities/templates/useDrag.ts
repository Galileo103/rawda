import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'

/** Movement (px) before a press becomes a drag; below it, it is a tap. Generous for small hands. */
const DRAG_THRESHOLD = 10

export interface DragState<P> {
  payload: P
  x: number
  y: number
  /** `data-drop` id of the target under the finger, if any. */
  over: string | null
}

/**
 * Touch-first drag and drop for preschoolers.
 * - Press and move a card → it follows the finger (a "ghost" the template renders).
 * - Release over an element with `data-drop="<id>"` → `onDrop(payload, id)`.
 * - A press without movement is a tap → `onTap(payload)`, so tap-tap still works
 *   (weaker motor control, keyboard, switch access).
 * The ghost has `pointer-events: none`, so `elementFromPoint` finds the target below it.
 */
export function useDrag<P>({ onDrop, onTap, disabled }: { onDrop: (payload: P, target: string) => void; onTap: (payload: P) => void; disabled?: boolean }) {
  const [drag, setDrag] = useState<DragState<P> | null>(null)
  const press = useRef<{ payload: P; x: number; y: number; id: number; moved: boolean } | null>(null)
  const handlers = useRef({ onDrop, onTap })
  useEffect(() => {
    handlers.current = { onDrop, onTap }
  })

  const end = useCallback((e: PointerEvent, cancelled: boolean) => {
    const p = press.current
    if (!p || e.pointerId !== p.id) return
    press.current = null
    setDrag(null)
    if (cancelled) return
    if (p.moved) {
      const target = targetAt(e.clientX, e.clientY)
      if (target) handlers.current.onDrop(p.payload, target)
    } else handlers.current.onTap(p.payload)
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p || e.pointerId !== p.id) return
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) return
      p.moved = true
      setDrag({ payload: p.payload, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY) })
    }
    const up = (e: PointerEvent) => end(e, false)
    const cancel = (e: PointerEvent) => end(e, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [end])

  /** Spread onto each draggable button. Keyboard activation (click with detail 0) counts as a tap. */
  const bind = (payload: P) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
      // Let the window listeners see the whole gesture even if the finger leaves the card.
      e.currentTarget.releasePointerCapture?.(e.pointerId)
      press.current = { payload, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
    },
    onClick: (e: { detail: number }) => {
      if (!disabled && e.detail === 0) handlers.current.onTap(payload)
    },
    style: { touchAction: 'none' as const },
  })

  return { drag, bind }
}

function targetAt(x: number, y: number): string | null {
  return document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
}
