import { useEffect, useRef, useState } from 'react'
import { useOptionalApp } from '../../../app/AppState'
import { content } from '../../../content/loader'
import type { GiveItem } from '../../../content/schemas'
import { Icon } from '../../../design/Icon'
import { OpenMoji } from '../../../design/Visual'
import { dict, numeral } from '../../../i18n'
import { audio } from '../../../services/audio/AudioService'
import { numberWord, voice } from '../../common'
import s from '../activities.module.css'
import g from './give.module.css'
import type { TemplateProps } from './types'
import { useDrag } from './useDrag'

type From = 'pile' | 'plate'
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * "Give me N" (cardinality): a pile of objects and an empty plate. Tap (or drag) an object
 * to put it on the plate, where it gets its count number; tap it there to take it back.
 * "Done" checks the plate. A wrong count changes nothing on the plate, so the child can fix it:
 * from hint 1 Hala counts what is on the plate, from hint 3 the extra or missing ones glow.
 */
export function GiveTemplate({ item, lang, hintLevel, locked, onCorrect, onWrong }: TemplateProps<GiveItem>) {
  const app = useOptionalApp()
  const parentReads = app ? !app.settings.narration : false
  const labels = (app?.t ?? dict(lang)).give
  const entry = content.lexicon.get(item.object)
  const name = entry?.[lang] ?? ''
  /** Object indexes on the plate, in the order they were put there. */
  const [plate, setPlate] = useState<number[]>([])
  const [solved, setSolved] = useState(false)
  /** Plate position Hala is counting right now (hint). */
  const [counting, setCounting] = useState<number | null>(null)
  /** Wrong "Done" taps: each one re-runs the counting hint, also once hintLevel has reached its cap. */
  const [wrongs, setWrongs] = useState(0)
  const plateRef = useRef(plate)
  const speaking = useRef(false)

  useEffect(() => {
    plateRef.current = plate
  }, [plate])
  useEffect(() => audio.onSpeakingChange((on) => (speaking.current = on)), [])

  // Hint 1+: after every gentle "try again" (or a help tap), Hala counts what is on the plate (stops if it changes).
  useEffect(() => {
    if (hintLevel < 1) return
    let cancelled = false
    void (async () => {
      // Let the try-again line finish first (at most a few seconds).
      for (let quiet = 0, waited = 0; quiet < 400 && waited < 6000; waited += 100) {
        await wait(100)
        quiet = speaking.current ? 0 : quiet + 100
      }
      const counted = plateRef.current
      if (cancelled || counted.length === 0) return
      await audio.speak(voice(lang).countTogether, lang)
      for (let k = 0; k < counted.length; k++) {
        if (cancelled || plateRef.current !== counted) break
        setCounting(k)
        await Promise.all([audio.speak(numberWord(k + 1, lang), lang), wait(parentReads ? 1000 : 350)])
      }
      if (!cancelled) setCounting(null)
    })()
    return () => {
      cancelled = true
      setCounting(null)
    }
  }, [hintLevel, wrongs, lang, parentReads])

  const put = (i: number) => {
    if (locked || solved || plate.includes(i)) return
    const next = [...plate, i]
    setPlate(next)
    setCounting(null)
    audio.sfx('pop')
    void audio.speak(numberWord(next.length, lang), lang)
  }
  const takeBack = (i: number) => {
    if (locked || solved || !plate.includes(i)) return
    setPlate(plate.filter((x) => x !== i))
    setCounting(null)
    audio.sfx('tap')
  }

  const { drag, bind } = useDrag<{ i: number; from: From }>({
    disabled: locked || solved,
    onTap: ({ i, from }) => (from === 'pile' ? put(i) : takeBack(i)),
    onDrop: ({ i, from }, target) => {
      if (from === 'pile' && target === 'plate') put(i)
      else if (from === 'plate' && target === 'pile') takeBack(i)
    },
  })

  const done = () => {
    if (locked || solved) return
    audio.sfx('tap')
    if (plate.length === item.n) {
      setSolved(true)
      onCorrect(numberWord(item.n, lang))
    } else {
      setWrongs((w) => w + 1)
      onWrong()
    }
  }

  const pile = Array.from({ length: item.have }, (_, i) => i).filter((i) => !plate.includes(i))
  // Hint 3: the extra ones on the plate, or the missing ones in the pile, glow.
  const glowExtra = hintLevel >= 3 && !solved ? new Set(plate.slice(item.n)) : new Set<number>()
  const glowMissing = hintLevel >= 3 && !solved ? new Set(pile.slice(0, Math.max(0, item.n - plate.length))) : new Set<number>()
  const size = item.have > 7 ? 64 : 80
  // A fuller plate wraps into more rows: smaller items keep them inside the rim on a phone.
  const plateSize = plate.length > 4 ? Math.min(size - 8, 52) : size - 8
  const pic = (px: number) => (entry ? <OpenMoji hex={entry.image} alt="" size={px} /> : null)

  return (
    <div className={s.stage}>
      <div
        className={[g.plate, drag?.over === 'plate' && drag.payload.from === 'pile' ? s.dropOver : '', solved ? s.correct : ''].join(' ')}
        data-drop="plate"
        data-testid="plate"
        role="group"
        aria-label={labels.plate}
      >
        {plate.map((i, k) => {
          const b = bind({ i, from: 'plate' })
          return (
            <button
              key={i}
              type="button"
              {...b}
              className={[g.plateItem, counting === k ? g.counting : '', glowExtra.has(i) ? s.demo : '', drag?.payload.i === i ? s.lifted : ''].join(' ')}
              aria-label={`${name} ${numeral(k + 1, lang)}`}
              data-testid="plate-obj"
            >
              {pic(plateSize)}
              <span className={s.num}>{numeral(k + 1, lang)}</span>
            </button>
          )
        })}
      </div>

      <div className={[g.pile, drag?.over === 'pile' && drag.payload.from === 'plate' ? s.dropOver : ''].join(' ')} data-drop="pile" role="group">
        {pile.map((i) => {
          const b = bind({ i, from: 'pile' })
          return (
            <button
              key={i}
              type="button"
              {...b}
              className={[g.pileItem, glowMissing.has(i) ? s.demo : '', drag?.payload.i === i ? s.lifted : ''].join(' ')}
              aria-label={name}
              data-testid="pile-obj"
            >
              {pic(size)}
            </button>
          )
        })}
      </div>

      <button type="button" className={g.done} onClick={done} disabled={locked || solved} data-testid="give-done">
        <Icon name="check" size={36} />
        <span>{labels.done}</span>
      </button>

      {drag && (
        <div className={s.ghost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {pic(size)}
        </div>
      )}
    </div>
  )
}
