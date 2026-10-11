import { useCallback, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../../content/assets'
import { audio } from '../../services/audio/AudioService'
import { pauseFor } from './sequence'

export interface RecitationTrack {
  /** Stable id (e.g. "basmala", "1", "2"). */
  key: string
  /** Path under public/assets (verified recording). */
  file: string
}

/**
 * Plays verified recitation files only. Deliberately has NO text-to-speech fallback:
 * if a file can't play, the UI says so instead.
 * With `pause`, a quiet gap as long as the ayah follows each one, for the child to repeat it
 * (`waiting` names that ayah meanwhile, `waitMs` is how long the gap lasts).
 * `step` / `total` tell how far through the current run we are; `paused` holds it where it is.
 */
export function useRecitation(volume: number, pause = false) {
  const el = useRef<HTMLAudioElement | null>(null)
  const queue = useRef<RecitationTrack[]>([])
  const repeatRef = useRef(false)
  const pauseRef = useRef(pause)
  useEffect(() => {
    pauseRef.current = pause
  }, [pause])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** What happens when the current ayah (and its repeat gap) is done. */
  const afterRef = useRef<(() => void) | null>(null)
  /** True while the child's turn is running: holding then cancels the gap, resuming moves on. */
  const inGap = useRef(false)
  const pausedInGap = useRef(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)
  const [waitMs, setWaitMs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState(0)
  const [total, setTotal] = useState(0)
  const [repeat, setRepeatState] = useState(false)
  const [error, setError] = useState(false)

  const stop = useCallback(() => {
    clearTimeout(timer.current)
    afterRef.current = null
    inGap.current = false
    pausedInGap.current = false
    setWaiting(null)
    setPaused(false)
    setStep(0)
    setTotal(0)
    queue.current = []
    if (el.current) {
      el.current.onended = null
      el.current.onerror = null
      el.current.pause()
      el.current = null
    }
    setCurrent(null)
  }, [])

  const playTrack = useCallback(
    function playTrack(track: RecitationTrack) {
      const a = new Audio(assetUrl(track.file))
      el.current = a
      a.volume = Math.max(0.2, Math.min(1, volume))
      setCurrent(track.key)
      setStep((n) => n + 1)
      setError(false)
      const after = () => {
        if (el.current !== a) return
        inGap.current = false
        setWaiting(null)
        if (repeatRef.current) {
          a.currentTime = 0
          void a.play().catch(() => undefined)
          return
        }
        const next = queue.current.shift()
        if (next) playTrack(next)
        else stop()
      }
      afterRef.current = after
      a.onended = () => {
        if (el.current !== a) return
        if (!pauseRef.current) return after()
        // The child's turn: the ayah stays highlighted while they say it.
        const ms = pauseFor(a.duration)
        inGap.current = true
        setWaitMs(ms)
        setWaiting(track.key)
        timer.current = setTimeout(after, ms)
      }
      a.onerror = () => {
        if (el.current !== a) return
        setError(true)
        stop()
      }
      a.play().catch(() => {
        if (el.current !== a) return
        setError(true)
        stop()
      })
    },
    [volume, stop],
  )

  const play = useCallback(
    (tracks: RecitationTrack[]) => {
      stop()
      audio.stop() // never talk over the recitation
      const [first, ...rest] = tracks
      if (!first) return
      queue.current = rest
      setTotal(tracks.length)
      playTrack(first)
    },
    [playTrack, stop],
  )

  /** Hold the recitation (or the child's turn) exactly where it is. */
  const hold = useCallback(() => {
    if (!el.current) return
    if (inGap.current) {
      clearTimeout(timer.current)
      pausedInGap.current = true
    } else {
      el.current.pause()
    }
    setPaused(true)
  }, [])

  const resume = useCallback(() => {
    if (!el.current) return
    setPaused(false)
    if (pausedInGap.current) {
      pausedInGap.current = false
      afterRef.current?.()
      return
    }
    void el.current.play().catch(() => undefined)
  }, [])

  const setRepeat = useCallback((v: boolean) => {
    repeatRef.current = v
    setRepeatState(v)
  }, [])

  useEffect(() => stop, [stop])

  return { current, waiting, waitMs, paused, step, total, error, repeat, setRepeat, play, stop, hold, resume }
}
