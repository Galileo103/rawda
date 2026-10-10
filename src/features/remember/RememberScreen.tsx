import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { rememberColor, rememberLetter, rememberNumber, rememberShape } from '../../content/funGames'
import { BUILD_SHAPES, GAME_COLORS, lettersFor } from '../../content/games'
import { content } from '../../content/loader'
import type { ColorKey, ShapeKey } from '../../content/schemas'
import { Mascot, type MascotMood } from '../../design/Mascot'
import { Button, Screen, TopBar } from '../../design/ui'
import { COLOR_HEX, ShapeSvg } from '../../design/Visual'
import { REMEMBER_ACTIVITY, type ReviewCard, daysAgo, pickReview } from '../../domain/remember'
import { defaultRng, shuffle } from '../../domain/rng'
import type { AreaId, Lang } from '../../domain/types'
import { type Dict, dict, fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { recordItemResult, recordRemember } from '../../services/repos/progress'
import { useReview } from './useReview'
import s from './remember.module.css'

interface Option {
  key: string
  card: ReviewCard
}

const areaOf = (c: ReviewCard): AreaId => (c.kind === 'letter' ? 'letters' : c.kind === 'number' ? 'numbers' : 'colors-shapes')

/** The card's question, and two other options of the same kind. */
function deal(card: ReviewCard, lang: Lang, d: Dict): { question: string; answer: string; options: Option[] } {
  const rng = defaultRng
  const others = <T,>(all: readonly T[], not: T) => shuffle(all.filter((x) => x !== not), rng).slice(0, 2)
  switch (card.kind) {
    case 'letter': {
      const letters = lettersFor(lang)
      const l = letters.find((x) => x.id === card.id) ?? letters[0]!
      const opts = [l, ...others(letters, l)].map((x) => ({ key: x.glyph, card: { skill: `${lang}.letter.${x.id}`, kind: 'letter' as const, id: x.id } }))
      return { question: rememberLetter(l, d), answer: l.glyph, options: shuffle(opts, rng) }
    }
    case 'number': {
      const opts = [card.n, ...others([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], card.n)].map((n) => ({ key: String(n), card: { skill: `num.count.${n}`, kind: 'number' as const, n } }))
      return { question: rememberNumber(card.n, d), answer: String(card.n), options: shuffle(opts, rng) }
    }
    case 'color': {
      const c = card.color as ColorKey
      const opts = [c, ...others(GAME_COLORS, c)].map((x) => ({ key: x, card: { skill: `color.${x}`, kind: 'color' as const, color: x } }))
      return { question: rememberColor(d.colors[c] ?? c, lang, d), answer: c, options: shuffle(opts, rng) }
    }
    case 'shape': {
      const sh = card.shape as ShapeKey
      const opts = [sh, ...others(BUILD_SHAPES, sh)].map((x) => ({ key: x, card: { skill: `shape.${x}`, kind: 'shape' as const, shape: x } }))
      return { question: rememberShape(d.shapes[sh] ?? sh, lang, d), answer: sh, options: shuffle(opts, rng) }
    }
  }
}

function OptionFace({ card, lang }: { card: ReviewCard; lang: Lang }) {
  switch (card.kind) {
    case 'letter':
      return <span lang={lang}>{lettersFor(lang).find((l) => l.id === card.id)?.glyph}</span>
    case 'number':
      return <span>{numeral(card.n, lang)}</span>
    case 'color':
      return <span className={s.swatch} style={{ background: COLOR_HEX[card.color as ColorKey] }} />
    case 'shape':
      return <ShapeSvg shape={card.shape as ShapeKey} size={76} />
  }
}

function Gift({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <rect x="34" y="92" width="132" height="92" rx="10" fill="#ec4f7c" />
      <rect x="92" y="92" width="16" height="92" fill="#ffc83d" />
      <g className={s.lid} style={open ? { transform: 'translate(40px, -90px) rotate(28deg)' } : undefined}>
        <rect x="24" y="66" width="152" height="32" rx="8" fill="#f06a92" />
        <rect x="92" y="66" width="16" height="32" fill="#ffc83d" />
        <path d="M100 66c-16-34-54-28-44-6 8 14 44 6 44 6zm0 0c16-34 54-28 44-6-8 14-44 6-44 6z" fill="#ffc83d" />
      </g>
    </svg>
  )
}

/** The Remember Box: once a day, three quick cards with things learned on earlier days. */
export function RememberScreen() {
  const { settings, t, named } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang
  const d = dict(lang)
  const f = d.games.fun
  const review = useReview()
  // The deck is fixed once opened: answering moves the cards' review dates, but not under the child's fingers.
  const [deck, setDeck] = useState<ReturnType<typeof pickReview> | null>(null)
  const [phase, setPhase] = useState<'closed' | 'opening' | 'card' | 'done' | 'sleep'>('closed')
  const [i, setI] = useState(0)
  const [bubble, setBubble] = useState('')
  const [mood, setMood] = useState<MascotMood>('happy')
  const [shakeKey, setShakeKey] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  const st = useRef({ misses: 0, started: Date.now(), alive: true, busy: false })

  const say = (text: string, m: MascotMood = mood) => {
    setBubble(text)
    setMood(m)
    void audio.speak(text, lang)
  }

  useEffect(() => {
    const cur = st.current
    cur.alive = true
    return () => {
      cur.alive = false
      audio.stop()
    }
  }, [])

  useEffect(() => {
    if (!review || deck) return
    if (review.done || review.cards.length === 0) {
      setPhase('sleep')
      say(f.remSleep, 'sleep')
    } else {
      setDeck(review.cards)
      say(f.remIntro, 'oops')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review, deck])

  const card = deck?.[i]
  const [dealt, setDealt] = useState<ReturnType<typeof deal> | null>(null)

  const show = (k: number) => {
    const c = deck?.[k]
    if (!c) return
    const dl = deal(c.card, lang, d)
    setDealt(dl)
    setI(k)
    setHint(false)
    st.current.misses = 0
    st.current.started = Date.now()
    st.current.busy = false
    setPhase('card')
    say(dl.question, 'think')
  }

  const open = () => {
    if (phase !== 'closed' || !deck) return
    setPhase('opening')
    audio.sfx('sparkle')
    window.setTimeout(() => st.current.alive && show(0), 900)
  }

  const answer = (o: Option) => {
    if (!card || !dealt || st.current.busy) return
    if (o.key !== dealt.answer) {
      st.current.misses++
      audio.sfx('try')
      setShakeKey(null)
      requestAnimationFrame(() => setShakeKey(o.key))
      if (st.current.misses >= 2) setHint(true)
      return say(f.remTry, 'think')
    }
    st.current.busy = true
    audio.sfx('correct')
    void recordItemResult({
      activityId: REMEMBER_ACTIVITY,
      itemId: card.card.skill,
      skill: card.card.skill,
      areaId: areaOf(card.card),
      lang,
      firstTry: st.current.misses === 0,
      misses: st.current.misses,
      hintsUsed: hint ? 1 : 0,
      durationMs: Date.now() - st.current.started,
    })
    say(f.remYes, 'cheer')
    window.setTimeout(async () => {
      if (!st.current.alive || !deck) return
      if (i + 1 < deck.length) return show(i + 1)
      await recordRemember({ areaId: areaOf(deck[0]!.card), lang, items: deck.length }, content.rewards)
      if (!st.current.alive) return
      setPhase('done')
      audio.sfx('complete')
      say(f.remDone, 'cheer')
    }, 1400)
  }

  return (
    <Screen className={s.screen}>
      <TopBar title={t.games.remember} backTo="/home" backLabel={t.common.home} />
      <div className={s.talk}>
        <Mascot mood={mood} size={90} />
        <p className={s.bubble} lang={lang} dir="auto" aria-live="polite">
          {named(bubble, lang)}
        </p>
      </div>
      <div className={s.stage} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-testid="remember-stage">
        {(phase === 'closed' || phase === 'opening') && deck && (
          <button type="button" className={[s.gift, phase === 'closed' ? s.due : ''].join(' ')} onClick={open} aria-label={t.games.remember} data-testid="remember-open">
            <Gift open={phase === 'opening'} />
          </button>
        )}
        {phase === 'sleep' && (
          <>
            <div className={s.gift}>
              <Gift open={false} />
            </div>
            <div className={s.zzz}>z z z</div>
            <span className={s.days}>{t.games.rememberSleep}</span>
          </>
        )}
        {phase === 'card' && card && dealt && (
          <>
            <span className={s.days}>
              {(() => {
                const n = daysAgo(card.record.lastSeen, Date.now())
                return n === 1 ? t.games.learnedYesterday : fmt(t.games.learnedAgo, { n: numeral(n, settings.uiLang) })
              })()}
            </span>
            <div className={s.options}>
              {dealt.options.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className={[s.option, shakeKey === o.key ? s.wiggle : '', hint && o.key === dealt.answer ? s.hint : ''].join(' ')}
                  onClick={() => answer(o)}
                  data-testid={o.key === dealt.answer ? 'remember-answer' : undefined}
                  aria-label={o.key}
                >
                  <OptionFace card={o.card} lang={lang} />
                </button>
              ))}
            </div>
          </>
        )}
        {phase === 'done' && (
          <div className={s.done} data-testid="remember-done">
            <div className={s.bigStars}>⭐ +{numeral(2, settings.uiLang)}</div>
            <Button size="lg" onClick={() => navigate('/home')}>
              {t.common.home}
            </Button>
          </div>
        )}
      </div>
    </Screen>
  )
}
