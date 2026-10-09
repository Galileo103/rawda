import type { Lang } from '../../domain/types'
import { audio } from '../../services/audio/AudioService'

/**
 * Speaking practice: microphone + ON-DEVICE speech recognition only.
 *
 * Privacy rules (see docs/PRIVACY.md):
 * - The microphone is used only after a parent turns on "Speaking practice" in the parent area.
 * - The child's recording lives in memory (a blob URL) for the "hear yourself" step, then is
 *   discarded. It is never saved to the device and never uploaded.
 * - Recognition runs only when the browser can do it locally (`processLocally`). Cloud speech
 *   services are never used, so on many devices there is no recognition at all — the activity
 *   then works as listen → say → hear yourself → compare, which is the core of the practice anyway.
 */

const TAGS: Record<Lang, string> = { ar: 'ar-SA', en: 'en-US' }

export type OnDeviceStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable'

interface RecognitionResultList {
  length: number
  [i: number]: { length: number; [j: number]: { transcript: string } }
}
interface Recognition {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  processLocally?: boolean
  onresult: ((e: { results: RecognitionResultList }) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
interface RecognitionCtor {
  new (): Recognition
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<OnDeviceStatus>
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>
}

function recognitionCtor(): RecognitionCtor | undefined {
  const g = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return g.SpeechRecognition ?? g.webkitSpeechRecognition
}

export function micSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

/** Whether this browser can recognise `lang` without sending audio anywhere. */
export async function onDeviceStatus(lang: Lang): Promise<OnDeviceStatus> {
  const SR = recognitionCtor()
  if (!SR?.available) return 'unavailable'
  try {
    return await SR.available({ langs: [TAGS[lang]], processLocally: true })
  } catch {
    return 'unavailable'
  }
}

/** Parent-initiated: ask the browser to download its on-device language pack. */
export async function installOnDevice(lang: Lang): Promise<boolean> {
  const SR = recognitionCtor()
  if (!SR?.install) return false
  try {
    return await SR.install({ langs: [TAGS[lang]], processLocally: true })
  } catch {
    return false
  }
}

export interface SpeechAttempt {
  /** In-memory recording for "hear yourself"; revoke with `URL.revokeObjectURL` when done. */
  recordingUrl?: string
  /** Recogniser alternatives (empty when on-device recognition is unavailable). */
  heard: string[]
  /** True when on-device recognition actually ran. */
  recognized: boolean
}

export interface Listening {
  stop(): void
  result: Promise<SpeechAttempt>
}

/** Record (and, when possible, recognise on-device) for up to `maxMs`. Never throws. */
export function listen(lang: Lang, maxMs = 3500): Listening {
  let stopFn = () => {}
  const result = (async (): Promise<SpeechAttempt> => {
    audio.stop()
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch {
      return { heard: [], recognized: false }
    }
    const SR = (await onDeviceStatus(lang)) === 'available' ? recognitionCtor() : undefined
    return new Promise<SpeechAttempt>((resolve) => {
      const chunks: Blob[] = []
      const heard: string[] = []
      let recorder: MediaRecorder | undefined
      let rec: Recognition | undefined
      let finished = false
      let pending = 0

      const done = () => {
        if (--pending > 0) return
        stream.getTracks().forEach((t) => t.stop())
        const blob = chunks.length ? new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' }) : undefined
        resolve({ recordingUrl: blob ? URL.createObjectURL(blob) : undefined, heard, recognized: !!rec })
      }

      try {
        recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
        recorder.onstop = done
        recorder.start()
        pending++
      } catch {
        recorder = undefined
      }
      if (SR) {
        try {
          rec = new SR()
          rec.lang = TAGS[lang]
          rec.processLocally = true
          rec.interimResults = false
          rec.continuous = false
          rec.maxAlternatives = 5
          rec.onresult = (e) => {
            for (let i = 0; i < e.results.length; i++) {
              const r = e.results[i]
              if (r) for (let j = 0; j < r.length; j++) if (r[j]?.transcript) heard.push(r[j]!.transcript)
            }
          }
          rec.onerror = () => undefined
          rec.onend = () => {
            done()
            // The child finished speaking: stop recording too.
            stopFn()
          }
          rec.start()
          pending++
        } catch {
          rec = undefined
        }
      }
      if (pending === 0) {
        pending = 1
        done()
        return
      }
      stopFn = () => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        try {
          if (recorder?.state === 'recording') recorder.stop()
        } catch {
          /* ignore */
        }
        try {
          rec?.stop()
        } catch {
          /* ignore */
        }
      }
      const timer = setTimeout(stopFn, maxMs)
    })
  })()
  return { stop: () => stopFn(), result }
}

/** Play an in-memory recording; resolves when it ends (or fails). */
export function playRecording(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const el = new Audio(url)
      el.onended = el.onerror = () => resolve()
      void el.play().catch(() => resolve())
    } catch {
      resolve()
    }
  })
}
