import { useEffect, useRef, useState } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { SyllablesItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji } from '../../../design/Visual'
import { ageProfile } from '../../../domain/ageProfile'
import { dict, numeral } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { numberWord, voice } from '../../common'
import s from '../activities.module.css'
import { optionsToHide } from '../choices'
import y from './syllables.module.css'
import type { TemplateProps } from './types'

const DRUM_HEX = '1F941'
/** Pause between parts when Hala claps them slowly (hint). */
const SLOW_MS = 700
/** Before the hint demo talks: let the player's try-again / hint line start, then wait for quiet. */
const LEAD_MS = 400
const QUIET_MAX_MS = 8000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Waits until Hala is quiet (or `stop()` says to give up), so the demo never cuts off another line. */
async function waitForQuiet(stop: () => boolean): Promise<void> {
  await sleep(LEAD_MS)
  const start = Date.now()
  while (!stop() && audio.speaking && Date.now() - start < QUIET_MAX_MS) await sleep(150)
}

/** The numeral options: explicit `choices` or 1–4, trimmed for younger children to the answer and its nearest numbers. */
export function clapChoices(item: Pick<SyllablesItem, 'parts' | 'choices'>, maxChoices: number): number[] {
  const answer = item.parts.length
  const all = [...new Set(item.choices ?? [1, 2, 3, 4])]
  const others = all.filter((n) => n !== answer).sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || a - b)
  return [answer, ...others.slice(0, Math.max(1, maxChoices - 1))].sort((a, b) => a - b)
}

/**
 * Syllable clapping (phonological awareness): a big picture, the word split into parts, and a drum.
 * Each drum tap lights the next part (pop; with voice on, Hala says it). When every part is lit, the
 * child picks how many claps that was. Hint ≥ 1: Hala lights the parts again, one by one, slowly.
 */
export function SyllablesTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, onInstruction }: TemplateProps<SyllablesItem>) {
  const app = useOptionalApp()
  const t = app?.t ?? dict(lang)
  const age = app?.age ?? ageProfile(undefined)
  const entry = content.lexicon.get(item.word)
  const word = entry?.[lang] ?? item.parts.join('')
  const answer = item.parts.length
  const [options] = useState(() => clapChoices(item, age.maxChoices))
  const [lit, setLit] = useState(0)
  const [ready, setReady] = useState(false)
  const [tried, setTried] = useState<Set<number>>(new Set())
  const [solved, setSolved] = useState(false)
  const demoing = useRef(false)
  const shownHint = useRef(0)
  const solvedRef = useRef(false)
  const lockedRef = useRef(locked)
  useEffect(() => {
    lockedRef.current = locked
  }, [locked])

  const allLit = () => {
    setReady(true)
    onInstruction?.(voice(lang).clapHowMany)
  }

  // Hint: clap the parts together again, one by one and slowly (each time more help is asked for).
  useEffect(() => {
    if (hintLevel < 1 || hintLevel <= shownHint.current) return
    shownHint.current = hintLevel
    if (solvedRef.current) return
    let cancelled = false
    // Stop as soon as the item is answered (the numbers stay tappable during the demo).
    const stopped = () => cancelled || solvedRef.current || lockedRef.current
    demoing.current = true
    void (async () => {
      setLit(0)
      // Voice off: the grown-up reads the caption, so say there what Hala is doing now.
      onInstruction?.(voice(lang).clapTogether)
      await waitForQuiet(stopped)
      if (!stopped()) await audio.speak(voice(lang).clapTogether, lang)
      for (let i = 0; i < item.parts.length && !stopped(); i++) {
        setLit(i + 1)
        audio.sfx('pop')
        await audio.speak(item.parts[i]!, lang)
        await sleep(SLOW_MS)
      }
      if (cancelled) return // a newer demo (or unmount) owns `demoing` now
      demoing.current = false
      if (stopped()) return
      allLit()
    })()
    return () => {
      cancelled = true
      demoing.current = false
    }
    // allLit / onInstruction only report the caption; the demo runs once per new hint level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintLevel, item.parts, lang])

  const drum = () => {
    if (locked || solved || demoing.current || lit >= item.parts.length) return
    const part = item.parts[lit]!
    audio.sfx('pop')
    setLit(lit + 1)
    if (lit + 1 < item.parts.length) {
      void audio.speak(part, lang)
      return
    }
    allLit()
    void audio.speakAll([
      { text: part, lang },
      { text: voice(lang).clapHowMany, lang },
    ])
  }

  const hearWord = () => {
    audio.sfx('tap')
    void audio.speak(word, lang)
  }

  const pickCount = (n: number) => {
    if (locked || solved || tried.has(n)) return
    audio.sfx('tap')
    if (n === answer) {
      solvedRef.current = true
      setSolved(true)
      onCorrect(word)
    } else {
      setTried(new Set(tried).add(n))
      onWrong()
    }
  }

  const hidden = optionsToHide(options.map(String), String(answer), new Set([...tried].map(String)), hintLevel)
  const drumDone = lit >= item.parts.length

  return (
    <div className={s.stage}>
      <button type="button" className={y.picture} onClick={hearWord} aria-label={word} data-testid="syllables-word">
        {entry && <OpenMoji hex={entry.image} alt="" size={150} />}
      </button>

      <div className={y.parts} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} role="list">
        {item.parts.map((part, i) => (
          <span key={i} role="listitem" className={[y.part, i < lit ? y.lit : ''].join(' ')} data-lit={i < lit ? 'true' : 'false'}>
            {part}
          </span>
        ))}
      </div>

      {!ready ? (
        <button
          type="button"
          className={[y.drum, !drumDone ? y.drumReady : ''].join(' ')}
          onClick={drum}
          disabled={locked || drumDone}
          aria-label={t.syllables.drum}
          data-testid="syllables-drum"
        >
          <OpenMoji hex={DRUM_HEX} alt="" size={120} />
        </button>
      ) : (
        <div className={s.choices} role="group">
          {options.map((n) => {
            if (hidden.has(String(n))) return null
            const isAnswer = n === answer
            return (
              <button
                key={n}
                type="button"
                className={[s.choice, tried.has(n) ? s.wrong : '', solved && isAnswer ? s.correct : '', !solved && isAnswer && hintLevel >= 3 ? s.demo : ''].join(' ')}
                onClick={() => pickCount(n)}
                aria-label={numberWord(n, lang)}
                aria-disabled={tried.has(n) || undefined}
                data-testid={isAnswer ? 'choice-answer' : 'choice-other'}
                style={{ minWidth: 110, minHeight: 110 }}
              >
                <span style={{ fontSize: '3.6rem', fontWeight: 800, lineHeight: 1 }}>{numeral(n, lang)}</span>
                {solved && isAnswer && (
                  <span className={s.checkBadge}>
                    <Icon name="check" size={28} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
