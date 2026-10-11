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
 * (`waiting` names that ayah meanwhile).
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
  const [current, setCurrent] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)
  const [repeat, setRepeatState] = useState(false)
  const [error, setError] = useState(false)

  const stop = useCallback(() => {
    clearTimeout(timer.current)
    setWaiting(null)
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
    (track: RecitationTrack) => {
      const a = new Audio(assetUrl(track.file))
      el.current = a
      a.volume = Math.max(0.2, Math.min(1, volume))
      setCurrent(track.key)
      setError(false)
      const after = () => {
        if (el.current !== a) return
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
      a.onended = () => {
        if (el.current !== a) return
        if (!pauseRef.current) return after()
        // The child's turn: the ayah stays highlighted while they say it.
        setWaiting(track.key)
        timer.current = setTimeout(after, pauseFor(a.duration))
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
      playTrack(first)
    },
    [playTrack, stop],
  )

  const setRepeat = useCallback((v: boolean) => {
    repeatRef.current = v
    setRepeatState(v)
  }, [])

  useEffect(() => stop, [stop])

  return { current, waiting, error, repeat, setRepeat, play, stop }
}
