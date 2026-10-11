import { useCallback, useEffect, useRef, useState } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import { ageProfile } from '../../../domain/ageProfile'
import type { CountItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji } from '../../../design/Visual'
import { dict, numeral } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { numberWord, voice } from '../../common'
import s from '../activities.module.css'
import { numberChoices, optionsToHide } from '../choices'
import type { TemplateProps } from './types'

/** Standard dice positions on a 3×3 grid ([row, column], 1-based) for 1–6 objects. */
export const DICE_SPOTS: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [2, 1], [3, 1], [1, 3], [2, 3], [3, 3]],
}

/**
 * Count objects (tap each one to count aloud), then pick the number.
 * `layout: "dice"` is a quick look instead: the objects sit in dice positions and, with
 * `flashMs`, start covered: the first "look" (after the grown-up has read the question)
 * shows them for `flashMs` and is free; "peek again" after that counts as a help.
 */
export function CountTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong, onHelp, rng }: TemplateProps<CountItem>) {
  const entry = content.lexicon.get(item.object)
  const age = useOptionalApp()?.age ?? ageProfile(undefined)
  const [options] = useState(() => numberChoices(item.count, item.difficulty, rng, 10, age.maxChoices))
  const [order, setOrder] = useState<number[]>([]) // object indexes in the order they were counted
  const [tried, setTried] = useState<Set<number>>(new Set())
  const [solved, setSolved] = useState(false)
  const demoDone = useRef(false)
  const dice = item.layout === 'dice'
  const flash = dice ? item.flashMs : undefined
  const [covered, setCovered] = useState(flash !== undefined)
  const [looked, setLooked] = useState(false)
  const coverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Quick look: show the objects for `flashMs`, then cover them (again after each peek).
  const peek = useCallback(() => {
    if (!flash) return
    clearTimeout(coverTimer.current)
    setLooked(true)
    setCovered(false)
    coverTimer.current = setTimeout(() => setCovered(true), flash)
  }, [flash])
  useEffect(() => () => clearTimeout(coverTimer.current), [])
  // Any help (a miss, the help button, "peek again") shows the objects once more.
  const lastHint = useRef(hintLevel)
  useEffect(() => {
    if (hintLevel > lastHint.current) peek()
    lastHint.current = hintLevel
  }, [hintLevel, peek])

  const peekAgain = () => {
    if (locked || solved) return
    audio.sfx('tap')
    const first = !looked
    peek()
    if (!first) onHelp?.()
  }

  // Hint level 1: Hala counts them all together with the child (not on a quick look).
  useEffect(() => {
    if (dice || hintLevel < 1 || demoDone.current) return
    demoDone.current = true
    let cancelled = false
    void (async () => {
      setOrder([])
      await audio.speak(voice(lang).countTogether, lang)
      for (let i = 0; i < item.count && !cancelled; i++) {
        setOrder((o) => [...o, i])
        audio.sfx('pop')
        await audio.speak(numberWord(i + 1, lang), lang)
        await new Promise((r) => setTimeout(r, 250))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dice, hintLevel, item.count, lang])

  const countObject = (i: number) => {
    if (order.includes(i) || solved) return
    const n = order.length + 1
    setOrder([...order, i])
    audio.sfx('pop')
    void audio.speak(numberWord(n, lang), lang)
  }

  const answer = (n: number) => {
    if (locked || solved || tried.has(n)) return
    audio.sfx('tap')
    if (n === item.count) {
      setSolved(true)
      clearTimeout(coverTimer.current)
      setCovered(false)
      onCorrect(numberWord(n, lang))
    } else {
      setTried(new Set(tried).add(n))
      onWrong()
    }
  }

  const keys = options.map(String)
  const hidden = optionsToHide(keys, String(item.count), new Set([...tried].map(String)), hintLevel)
  const size = item.count > 6 ? 76 : 96

  const label = entry?.[lang] ?? ''

  return (
    <div className={s.stage}>
      {dice ? (
        <div className={s.diceWrap}>
          <div className={s.dice} role="group" data-testid="dice" data-covered={covered ? 'true' : 'false'} aria-hidden={covered || undefined}>
            {(DICE_SPOTS[item.count] ?? []).map(([row, col], i) => (
              <span key={i} className={s.diceSpot} style={{ gridRow: row, gridColumn: col }} role="img" aria-label={label}>
                {entry && <OpenMoji hex={entry.image} alt="" size={72} />}
              </span>
            ))}
          </div>
          {flash !== undefined && (
            <div className={[s.diceCover, covered ? s.diceCoverOn : ''].join(' ')} aria-hidden={!covered || undefined}>
              {covered && !solved && (
                <button type="button" className={s.peek} onClick={peekAgain} disabled={locked}>
                  <Icon name="eye" size={36} />
                  <span>{looked ? dict(lang).player.peek : dict(lang).player.look}</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
      <div className={s.objects} role="group">
        {Array.from({ length: item.count }, (_, i) => {
          const pos = order.indexOf(i)
          return (
            <button key={i} type="button" className={[s.obj, pos >= 0 ? s.objCounted : ''].join(' ')} onClick={() => countObject(i)} aria-label={entry?.[lang] ?? ''}>
              {entry && <OpenMoji hex={entry.image} alt="" size={size} />}
              {pos >= 0 && <span className={s.num}>{numeral(pos + 1, lang)}</span>}
            </button>
          )
        })}
      </div>
      )}
      <div className={s.choices} role="group">
        {options.map((n) => {
          if (hidden.has(String(n))) return null
          const isAnswer = n === item.count
          return (
            <button
              key={n}
              type="button"
              className={[s.choice, tried.has(n) ? s.wrong : '', solved && isAnswer ? s.correct : '', !solved && isAnswer && hintLevel >= 3 ? s.demo : ''].join(' ')}
              onClick={() => answer(n)}
              aria-label={numberWord(n, lang)}
              data-testid={isAnswer ? 'choice-answer' : 'choice-other'}
              style={{ minWidth: 120, minHeight: 120 }}
            >
              <span style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1 }}>{numeral(n, lang)}</span>
              {solved && isAnswer && (
                <span className={s.checkBadge}>
                  <Icon name="check" size={28} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
