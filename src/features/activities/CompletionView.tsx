import { useState } from 'react'
import { content } from '../../content/loader'
import type { MovementBreak, Reward } from '../../content/schemas'
import { Mascot } from '../../design/Mascot'
import { Button, StarCount } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import type { Lang } from '../../domain/types'
import type { Dict } from '../../i18n'
import { fmt } from '../../i18n'
import s from './activities.module.css'

const CONFETTI = ['#e8613a', '#ffc83d', '#13897f', '#7a5cd6', '#2f8fdb', '#d94a86']

export function CompletionView({
  t,
  uiLang,
  practiced,
  stars,
  newRewards,
  showRewards,
  resting,
  hasNext,
  onAgain,
  onNext,
  onHome,
  movementBreak,
  lang,
}: {
  t: Dict
  uiLang: Lang
  practiced: string
  stars: number
  newRewards: Reward[]
  showRewards: boolean
  resting: boolean
  hasNext: boolean
  onAgain: () => void
  onNext: () => void
  onHome: () => void
  /** A short movement/calm break, shown until the child taps "Done". */
  movementBreak?: MovementBreak
  lang: Lang
}) {
  const [breakDone, setBreakDone] = useState(false)
  const lex = movementBreak ? content.lexicon.get(movementBreak.lex) : undefined
  if (movementBreak && !breakDone) {
    return (
      <div className={s.center}>
        <div className={s.breakCard} role="dialog" aria-label={movementBreak.say[lang]}>
          {lex && <OpenMoji hex={lex.image} alt="" size={170} className={s.breakImg} />}
          <p className={s.breakText} lang={lang} dir="auto">
            {movementBreak.say[lang]}
          </p>
          <Button size="lg" variant="teal" icon="check" onClick={() => setBreakDone(true)} autoFocus>
            {t.common.done}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className={s.center}>
      <div className={s.confetti} aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <i key={i} style={{ insetInlineStart: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 0.15}s` }} />
        ))}
      </div>
      <Mascot mood={resting ? 'sleep' : 'cheer'} size={170} />
      <h1 className={s.title}>{resting ? t.rest.title : t.completion.title}</h1>
      <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }} dir="auto">
        {fmt(t.completion.practiced, { what: practiced })}
      </p>
      {showRewards && <StarCount n={stars} label={fmt(t.completion.stars, { n: stars })} />}
      {showRewards && newRewards.length > 0 && (
        <div className={s.stickers}>
          {newRewards.map((r, i) => (
            <div key={r.id} className={s.sticker} style={{ animationDelay: `${0.3 + i * 0.2}s` }}>
              <OpenMoji hex={r.hex} alt={r.name[uiLang]} size={110} />
              <span>{t.completion.newSticker}</span>
              <span>{r.name[uiLang]}</span>
            </div>
          ))}
        </div>
      )}
      <div className={s.actions}>
        <Button variant="secondary" icon="again" onClick={onAgain}>
          {t.completion.again}
        </Button>
        {hasNext && !resting && (
          <Button icon="next" onClick={onNext} autoFocus>
            {t.completion.next}
          </Button>
        )}
        <Button variant="teal" icon="home" onClick={onHome}>
          {t.completion.home}
        </Button>
      </div>
    </div>
  )
}
