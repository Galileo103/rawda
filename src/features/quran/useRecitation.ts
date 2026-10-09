import { useCallback, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../../content/assets'
import { audio } from '../../services/audio/AudioService'

export interface RecitationTrack {
  /** Stable id (e.g. "basmala", "1", "2"). */
  key: string
  /** Path under public/assets (verified recording). */
  file: string
}

/**
 * Plays verified recitation files only. Deliberately has NO text-to-speech fallback:
 * if a file can't play, the UI says so instead.
 */
export function useRecitation(volume: number) {
  const el = useRef<HTMLAudioElement | null>(null)
  const queue = useRef<RecitationTrack[]>([])
  const repeatRef = useRef(false)
  const [current, setCurrent] = useState<string | null>(null)
  const [repeat, setRepeatState] = useState(false)
  const [error, setError] = useState(false)

  const stop = useCallback(() => {
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
      a.onended = () => {
        if (el.current !== a) return
        if (repeatRef.current) {
          a.currentTime = 0
          void a.play().catch(() => undefined)
          return
        }
        const next = queue.current.shift()
        if (next) playTrack(next)
        else stop()
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

  return { current, error, repeat, setRepeat, play, stop }
}
