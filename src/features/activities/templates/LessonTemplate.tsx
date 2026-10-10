import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { ChoiceItem, LessonItem, TraceItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji, Visual } from '../../../design/Visual'
import { numeral } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { numberWord } from '../../common'
import { ChoiceTemplate } from './ChoiceTemplate'
import s from './lesson.module.css'
import { TraceTemplate } from './TraceTemplate'
import type { TemplateProps } from './types'

type Stage = 'meet' | 'examples' | 'count' | 'trace' | 'check'

const MARKS = /[ً-ْٰـ]/

/** Split a word around the first occurrence of `letter` (with its diacritics) so it can be coloured. */
export function highlightParts(word: string, letter: string | undefined): [string, string, string] {
  if (!letter) return [word, '', '']
  const chars = [...word]
  const target = letter.toLowerCase()
  const i = chars.findIndex((c) => c.toLowerCase() === target)
  if (i < 0) return [word, '', '']
  let end = i + 1
  while (end < chars.length && MARKS.test(chars[end] as string)) end++
  return [chars.slice(0, i).join(''), chars.slice(i, end).join(''), chars.slice(end).join('')]
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A row of pictures (a pattern, a sequence) stays on one line, sized to the screen. */
function rowSize(n: number): number {
  const room = Math.min(typeof window === 'undefined' ? 720 : window.innerWidth - 72, 720)
  // Each picture is drawn at 62% of the row size, with 10px gaps.
  return Math.max(60, Math.min(200, Math.floor((room - (n - 1) * 10 - 40) / (n * 0.62))))
}

/**
 * Discover lesson: teaches ONE new concept before any testing.
 * meet it → see it in familiar words → (count it) → (trace it) → (gentle check).
 * The child moves on with a big "next" button at her own pace; nothing is timed.
 */
export function LessonTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, onInstruction, rng }: TemplateProps<LessonItem>) {
  const { t, settings } = useApp()
  // Voice off: a grown-up reads along, so nothing races ahead silently.
  const parentReads = !settings.narration
  const stages = useMemo<Stage[]>(
    () => ['meet', ...(item.examples.length ? (['examples'] as const) : []), ...(item.count ? (['count'] as const) : []), ...(item.trace ? (['trace'] as const) : []), ...(item.check ? (['check'] as const) : [])],
    [item],
  )
  const [index, setIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [counted, setCounted] = useState(0)
  const finished = useRef(false)
  const stage = stages[index] ?? 'meet'

  // Narrate each stage once when it starts; "next" becomes available when the narration ends.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    const stepText = stage === 'check' ? item.check?.say[lang] : stage === 'meet' || stage === 'count' ? item.meet[lang] : item.say[lang]
    if (stepText) onInstruction?.(stepText)
    void (async () => {
      if (stage === 'meet') {
        await audio.speakAll([
          { text: item.say[lang] ?? '', lang },
          { text: item.meet[lang] ?? '', lang },
        ])
      } else if (stage === 'examples' && parentReads) {
        setActive(null) // all words stay on screen; the grown-up reads them, the child taps each one
      } else if (stage === 'examples') {
        for (const id of item.examples) {
          if (cancelled) return
          setActive(id)
          await audio.speak(content.lexicon.get(id)?.[lang] ?? '', lang)
          await wait(350)
        }
        if (!cancelled) setActive(null)
      } else if (stage === 'count' && item.count) {
        setCounted(0)
        for (let n = 1; n <= item.count.n && !cancelled; n++) {
          setCounted(n)
          audio.sfx('pop')
          await audio.speak(numberWord(n, lang), lang)
          await wait(parentReads ? 1000 : 300) // slow enough to count along out loud
        }
      } else if (stage === 'check' && item.check) {
        await audio.speak(item.check.say[lang] ?? '', lang)
      }
      if (!cancelled) setReady(true)
    })()
    const fallback = setTimeout(() => !cancelled && setReady(true), 6000) // never block on audio
    return () => {
      cancelled = true
      clearTimeout(fallback)
    }
    // onInstruction is a stable callback from the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, item, lang, parentReads])

  const advance = () => {
    audio.sfx('tap')
    audio.stop()
    if (index + 1 < stages.length) setIndex(index + 1)
    else if (!finished.current) {
      finished.current = true
      onCorrect()
    }
  }

  let body: ReactNode = null
  let showNext = true
  switch (stage) {
    case 'meet':
      body = (
        <button type="button" className={[s.meet, item.focus.kind === 'row' ? s.meetWide : ''].join(' ')} onClick={() => void audio.speak(item.meet[lang] ?? '', lang)} aria-label={item.meet[lang]}>
          <Visual v={item.focus} lang={lang} size={item.focus.kind === 'row' ? rowSize(item.focus.items.length) : 200} />
        </button>
      )
      break
    case 'examples':
      body = (
        <div className={s.examples}>
          {item.examples.map((id, i) => {
            const e = content.lexicon.get(id)
            if (!e) return null
            const [a, hl, b] = highlightParts(e[lang], item.highlight)
            return (
              <button
                key={id}
                type="button"
                className={[s.example, active === id ? s.exampleOn : ''].join(' ')}
                style={{ animationDelay: `${i * 0.25}s` }}
                onClick={() => {
                  setActive(id)
                  void audio.speak(e[lang], lang)
                }}
              >
                <OpenMoji hex={e.image} alt="" size={110} />
                <span className={s.word} lang={lang} dir="auto">
                  {a}
                  <span className={s.hl}>{hl}</span>
                  {b}
                </span>
              </button>
            )
          })}
        </div>
      )
      break
    case 'count': {
      const e = item.count ? content.lexicon.get(item.count.object) : undefined
      body = (
        <>
          <Visual v={item.focus} lang={lang} size={110} />
          <div className={s.counting}>
            {Array.from({ length: counted }, (_, i) => (
              <span key={i} className={s.countItem}>
                {e && <OpenMoji hex={e.image} alt="" size={90} />}
                <span className={s.countNum}>{numeral(i + 1, lang)}</span>
              </span>
            ))}
          </div>
        </>
      )
      break
    }
    case 'trace': {
      showNext = false
      const traceItem: TraceItem = { id: `${item.id}-trace`, skill: item.skill, difficulty: 1, say: item.say, glyph: item.trace ?? '' }
      body = <TraceTemplate item={traceItem} lang={lang} hintLevel={hintLevel} locked={locked} onCorrect={advance} onWrong={onWrong} rng={rng} />
      break
    }
    case 'check': {
      showNext = false
      const c = item.check!
      const checkItem: ChoiceItem = { id: `${item.id}-check`, skill: item.skill, difficulty: 1, say: c.say, answer: c.answer, choices: c.choices, ...(c.show ? { show: c.show } : {}) }
      body = <ChoiceTemplate item={checkItem} pool={[]} lang={lang} hintLevel={hintLevel} locked={locked} onCorrect={onCorrect} onWrong={onWrong} rng={rng} />
      break
    }
  }

  return (
    <div className={s.lesson}>
      <div className={s.steps} aria-hidden="true">
        {stages.map((st, i) => (
          <span key={st} className={[s.step, i < index ? s.stepDone : '', i === index ? s.stepNow : ''].join(' ')} />
        ))}
      </div>
      {body}
      {showNext && (
        <button type="button" className={[s.next, ready ? s.ready : ''].join(' ')} onClick={advance} disabled={!ready || locked} aria-label={t.common.next} data-testid="lesson-next">
          <Icon name="next" size={56} />
        </button>
      )}
    </div>
  )
}
