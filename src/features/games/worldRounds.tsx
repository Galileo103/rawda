import { type RefObject, useEffect, useRef, useState } from 'react'
import { assetUrl, openmojiUrl } from '../../content/assets'
import {
  ANIMAL_HEX,
  type AnimalId,
  CLOTHES,
  CLOTHES_IDS,
  type ClothesId,
  FOOD_HEX,
  FOOD_IDS,
  HOME_HEX,
  SOUND_ANIMAL_IDS,
  type SoundAnimal,
  WEATHER,
  dressBad,
  dressChange,
  dressGood,
  dressIntro,
  mixFood,
  mixFoodNo,
  mixFoodYes,
  mixHome,
  mixNot,
  mixNotHome,
  mixSound,
  mixYesAnd,
  soundPath,
} from '../../content/funGames'
import { FOOD_SKILL, type FoodAnimal, type FoodId, HABITAT_SKILL, type HabitatAnimal, type HomeId, type MixupMode, WEATHER_IDS, WEATHER_SKILL, type WeatherId, mixupModes } from '../../content/games'
import { OpenMoji } from '../../design/Visual'
import { pickOne, shuffle } from '../../domain/rng'
import { audio } from '../../services/audio/AudioService'
import { useDrag } from '../activities/templates/useDrag'
import { Ghost } from './drawings'
import { type RoundProps, cx, useLatest, useMount } from './engine'
import s from './games.module.css'

/** False once the round has gone (late timers and sounds then do nothing). */
function useAlive(): RefObject<boolean> {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}

/** Run `fn` once Hala has finished talking, so an animal's call never talks over her. */
function whenQuiet(fn: () => void, alive: RefObject<boolean>): void {
  let done = false
  let off = () => {}
  const go = () => {
    if (done) return
    done = true
    off()
    clearTimeout(cap)
    if (alive.current) fn()
  }
  const cap = window.setTimeout(go, 5000)
  window.setTimeout(() => {
    if (!audio.speaking) return go()
    off = audio.onSpeakingChange((speaking) => {
      if (!speaking) go()
    })
  }, 300)
}

/** An animal's real recorded call (the recorded ones only). */
const call = (a: AnimalId) => {
  const p = soundPath(a)
  return p ? audio.playSound(assetUrl(p)) : Promise.resolve()
}

// ---------- Dress the Hero ----------

const SLOT_CLASS = { umb: s.slotUmb, head: s.slotHead, eyes: s.slotEyes, neck: s.slotNeck, body: s.slotBody }
const SKY_CLASS: Record<WeatherId, string | undefined> = { rain: s.skyRain, snow: s.skySnow, sun: s.skySun }

/** Dress the Hero — the child's own hero went out dressed all wrong; drag on the right clothes. */
export function DressRound({ d, stage, locked, rng, ctl, hero: heroHex }: RoundProps) {
  const f = d.games.fun
  const [plan] = useState(() => {
    // Rain, snow and sun are everyday knowledge, so the game always plays with every weather: a child who has
    // discovered only one of them still gets the stage-3 weather switch, and the round never gets poorer after a lesson.
    const first = pickOne(WEATHER_IDS, rng)
    const others = WEATHER_IDS.filter((x) => x !== first)
    return { first, then: stage === 3 && others.length ? pickOne(others, rng) : null, order: shuffle(CLOTHES_IDS, rng) }
  })
  const [w, setW] = useState<WeatherId>(plan.first)
  const [worn, setWorn] = useState<ClothesId[]>(() => [...WEATHER[plan.first].start])
  const [needed, setNeeded] = useState(stage === 2 ? 2 : 1)
  const [switched, setSwitched] = useState(false)
  const busy = useRef(false)
  const hero = useRef<HTMLDivElement>(null)
  const items = useRef(new Map<ClothesId, HTMLButtonElement>())
  const now = useLatest({ w, worn })
  const alive = useAlive()

  useMount(() => {
    ctl.prompt(dressIntro(plan.first, d))
    ctl.mood('oops')
    ctl.practise(WEATHER_SKILL[plan.first].skill)
    ctl.hint(() => {
      const { w: wNow, worn: on } = now.current
      const g = WEATHER[wNow].good.find((c) => !on.includes(c))
      return g ? items.current.get(g) : null
    })
  })

  const put = (c: ClothesId) => {
    if (locked || busy.current) return
    const rule = WEATHER[w]
    if (!rule.good.includes(c)) return ctl.wrong(items.current.get(c), dressBad(c, w, d))
    setWorn([...worn.filter((x) => !rule.bad.includes(x)), c])
    audio.sfx('pop')
    const left = needed - 1
    setNeeded(left)
    if (left > 0) {
      ctl.step(hero.current)
      return ctl.say(dressGood(c, true, d))
    }
    if (plan.then && !switched) {
      const next = plan.then
      setSwitched(true)
      busy.current = true
      ctl.step(hero.current)
      ctl.say(dressGood(c, false, d))
      window.setTimeout(() => {
        if (!alive.current) return
        busy.current = false
        setW(next)
        setNeeded(1)
        audio.sfx('gasp')
        ctl.prompt(dressChange(next, d))
        ctl.mood('oops')
        ctl.practise(WEATHER_SKILL[next].skill)
      }, 2200)
      return
    }
    ctl.correct(hero.current, f.dressDone)
  }
  const { drag, bind } = useDrag<ClothesId>({ disabled: locked, onTap: put, onDrop: (c, target) => target === 'hero' && put(c) })

  const rule = WEATHER[w]
  const unhappy = worn.some((x) => rule.bad.includes(x)) || !rule.good.some((x) => worn.includes(x))
  const tray = plan.order.filter((c) => (rule.good.includes(c) || rule.bad.includes(c)) && !worn.includes(c))
  const nextGood = tray.find((c) => rule.good.includes(c))

  return (
    <div className={s.dressField}>
      <div className={cx(s.dressSky, SKY_CLASS[w], drag?.over === 'hero' && s.over)} data-drop="hero">
        <img className={s.weatherIcon} src={openmojiUrl(WEATHER_SKILL[w].hex)} alt="" draggable={false} />
        {unhappy && <span className={cx(s.feel, !rule.cold && s.feelHot)}>{rule.cold ? f.cold : f.hot}</span>}
        <div ref={hero} className={cx(s.hero, unhappy && (rule.cold ? s.shiver : s.sweat))}>
          <img src={openmojiUrl(heroHex)} alt="" draggable={false} />
          {worn.map((c) => (
            <img key={c} className={cx(s.wear, SLOT_CLASS[CLOTHES[c].slot])} src={openmojiUrl(CLOTHES[c].hex)} alt="" draggable={false} />
          ))}
          {unhappy && !rule.cold && <img className={s.sweatDrop} src={openmojiUrl('1F4A7')} alt="" draggable={false} />}
        </div>
      </div>
      <div className={s.tray}>
        {tray.map((c) => (
          <button
            key={c}
            ref={(el) => {
              if (el) items.current.set(c, el)
            }}
            type="button"
            className={cx(s.trayItem, drag?.payload === c && s.lifted)}
            aria-label={f.clothes[c].a}
            data-testid={c === nextGood ? 'game-answer' : undefined}
            {...bind(c)}
          >
            <OpenMoji hex={CLOTHES[c].hex} alt="" size={72} />
          </button>
        ))}
      </div>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <OpenMoji hex={CLOTHES[drag.payload].hex} alt="" size={72} />
        </Ghost>
      )}
    </div>
  )
}

// ---------- Animal Mix-up ----------

/** Animal Mix-up — real animal calls, animals in the wrong homes, and the wrong snacks: fix every silly mix-up. */
export function MixupRound(props: RoundProps) {
  const [mode] = useState<MixupMode>(() => {
    const modes = mixupModes(props.learned)
    const want = (['sounds', 'homes', 'food'] as const)[props.stage - 1] ?? 'sounds'
    return modes.includes(want) ? want : pickOne(modes, props.rng)
  })
  if (mode === 'homes') return <HomesRound {...props} />
  if (mode === 'food') return <FoodRound {...props} />
  return <SoundsRound {...props} />
}

/** "Does the cow sound like THIS?" — the child listens and finds who really makes the sound. */
function SoundsRound({ lang, d, choices, locked, rng, ctl }: RoundProps) {
  const [r] = useState(() => {
    const [shown, real, ...rest] = shuffle(SOUND_ANIMAL_IDS, rng) as [SoundAnimal, SoundAnimal, ...SoundAnimal[]]
    return { shown, real, opts: shuffle([real, ...rest.slice(0, Math.max(1, Math.min(3, choices) - 1))], rng) }
  })
  const voice = useRef<SoundAnimal>(r.real)
  const [solved, setSolved] = useState(false)
  const [playing, setPlaying] = useState(false)
  const opts = useRef(new Map<SoundAnimal, HTMLButtonElement>())
  const alive = useAlive()
  const f = d.games.fun

  const listen = (a: SoundAnimal = voice.current) => {
    setPlaying(true)
    void call(a).then(() => alive.current && setPlaying(false))
  }
  useMount(() => {
    ctl.prompt(mixSound(r.shown, d))
    ctl.mood('oops')
    ctl.hint(() => opts.current.get(r.real))
    whenQuiet(() => listen(r.real), alive)
  })

  const choose = (x: SoundAnimal) => {
    if (locked || solved) return
    const el = opts.current.get(x)
    if (x !== r.real) {
      ctl.wrong(el, mixNot(x, d))
      return whenQuiet(() => listen(x), alive)
    }
    setSolved(true)
    ctl.say(mixYesAnd(r.shown, r.real, d))
    whenQuiet(() => {
      voice.current = r.shown
      setPlaying(true)
      void call(r.shown).then(() => {
        if (!alive.current) return
        setPlaying(false)
        ctl.correct(el)
      })
    }, alive)
  }

  return (
    <div className={s.mixField}>
      <div className={s.animalCard}>
        <OpenMoji hex={ANIMAL_HEX[r.shown]} alt={f.animals[r.shown]} size={170} />
        <button type="button" className={cx(s.listen, playing && s.listening)} aria-label={f.listen} onClick={() => listen()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={s.mixOptions}>
        {r.opts.map((x) => (
          <button
            key={x}
            ref={(el) => {
              if (el) opts.current.set(x, el)
            }}
            type="button"
            lang={lang}
            className={s.mixOption}
            aria-label={f.animals[x]}
            data-testid={x === r.real ? 'game-answer' : undefined}
            onClick={() => choose(x)}
          >
            <OpenMoji hex={ANIMAL_HEX[x]} alt="" size={84} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** Animals sit in the wrong homes (the fish up a tree!) — take each one home. */
function HomesRound({ lang, d, choices, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    const byHome = new Map<HomeId, HabitatAnimal[]>()
    for (const a of learned.habitats) byHome.set(HABITAT_SKILL[a].home, [...(byHome.get(HABITAT_SKILL[a].home) ?? []), a])
    const homes = shuffle([...byHome.keys()], rng).slice(0, Math.max(2, Math.min(3, choices)))
    const animals = homes.map((h) => pickOne(byHome.get(h) ?? [], rng))
    return { homes, animals }
  })
  const [home, setHome] = useState<HabitatAnimal[]>([])
  const [picked, setPicked] = useState<HabitatAnimal | null>(null)
  const homeEls = useRef(new Map<HomeId, HTMLDivElement>())
  const animalEls = useRef(new Map<HabitatAnimal, HTMLButtonElement>())
  const atHome = useLatest(home)
  const f = d.games.fun

  useMount(() => {
    ctl.prompt(f.mixHomes)
    ctl.mood('oops')
    if (r.animals[0]) ctl.practise(HABITAT_SKILL[r.animals[0]].skill)
    ctl.hint(() => animalEls.current.get(r.animals.find((a) => !atHome.current.includes(a)) ?? r.animals[0]!))
  })

  const place = (a: HabitatAnimal, h: HomeId) => {
    setPicked(null)
    if (locked || home.includes(a)) return
    if (HABITAT_SKILL[a].home !== h) return ctl.wrong(animalEls.current.get(a), mixNotHome(a, h, d))
    const now = [...home, a]
    setHome(now)
    const el = homeEls.current.get(h)
    if (now.length === r.animals.length) ctl.correct(el, f.mixHomesDone)
    else {
      ctl.step(el)
      ctl.say(mixHome(a, d))
    }
  }
  const { drag, bind } = useDrag<HabitatAnimal>({
    disabled: locked,
    onTap: (a) => setPicked((p) => (p === a ? null : a)),
    onDrop: (a, target) => target.startsWith('home:') && place(a, target.slice(5) as HomeId),
  })
  // Each animal starts one home along (never its own); it moves home once placed.
  const whereIs = (a: HabitatAnimal, i: number) => (home.includes(a) ? HABITAT_SKILL[a].home : r.homes[(i + 1) % r.homes.length])
  const nextAnimal = r.animals.find((a) => !home.includes(a))

  return (
    <div className={s.homes}>
      {r.homes.map((h) => (
        <div
          key={h}
          ref={(el) => {
            if (el) homeEls.current.set(h, el)
          }}
          className={cx(s.homeCard, drag?.over === `home:${h}` && s.over)}
          data-drop={`home:${h}`}
          onClick={() => picked && place(picked, h)}
        >
          <OpenMoji hex={HOME_HEX[h]} alt="" size={84} />
          <span className={s.homeLabel} lang={lang}>
            {f.homeLabels[h]}
          </span>
          <div className={s.homeSpot}>
            {r.animals.map((a, i) =>
              whereIs(a, i) === h ? (
                <button
                  key={a}
                  ref={(el) => {
                    if (el) animalEls.current.set(a, el)
                  }}
                  type="button"
                  className={cx(s.homeAnimal, !home.includes(a) && s.lost, picked === a && s.selected, drag?.payload === a && s.lifted)}
                  aria-label={f.animals[a]}
                  data-testid={a === nextAnimal ? 'game-answer' : undefined}
                  disabled={home.includes(a)}
                  {...bind(a)}
                >
                  <OpenMoji hex={ANIMAL_HEX[a]} alt="" size={64} />
                </button>
              ) : null,
            )}
          </div>
        </div>
      ))}
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <OpenMoji hex={ANIMAL_HEX[drag.payload]} alt="" size={64} />
        </Ghost>
      )}
    </div>
  )
}

/** The monkey is holding a fish?! Give each animal the food it really eats. */
function FoodRound({ lang, d, choices, locked, rng, ctl, learned }: RoundProps) {
  const [r] = useState(() => {
    const a: FoodAnimal = pickOne(learned.foods, rng)
    const good = FOOD_SKILL[a].food
    const others = FOOD_IDS.filter((x) => x !== good)
    const wrong = pickOne(others, rng)
    const tray = shuffle([good, ...shuffle(others.filter((x) => x !== wrong), rng).slice(0, Math.max(1, Math.min(3, choices) - 1))], rng)
    return { a, good, wrong, tray }
  })
  const [fed, setFed] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const items = useRef(new Map<FoodId, HTMLButtonElement>())
  const f = d.games.fun

  useMount(() => {
    ctl.prompt(mixFood(r.a, r.wrong, lang, d))
    ctl.mood('oops')
    ctl.practise(FOOD_SKILL[r.a].skill)
    ctl.hint(() => items.current.get(r.good))
  })

  const give = (food: FoodId) => {
    if (locked || fed) return
    if (food !== r.good) {
      audio.sfx('nope')
      return ctl.wrong(items.current.get(food), mixFoodNo(r.a, food, d))
    }
    setFed(true)
    audio.sfx('munch')
    void call(r.a)
    ctl.correct(card.current, mixFoodYes(r.a, d))
  }
  const { drag, bind } = useDrag<FoodId>({ disabled: locked, onTap: give, onDrop: (food, target) => target === 'animal' && give(food) })

  return (
    <div className={s.mixField}>
      <div ref={card} className={cx(s.animalCard, drag?.over === 'animal' && s.over)} data-drop="animal">
        <OpenMoji hex={ANIMAL_HEX[r.a]} alt={f.animals[r.a]} size={170} />
        <img className={s.held} src={openmojiUrl(FOOD_HEX[fed ? r.good : r.wrong])} alt="" draggable={false} />
      </div>
      <div className={s.tray}>
        {r.tray
          .filter((x) => !(fed && x === r.good))
          .map((x) => (
            <button
              key={x}
              ref={(el) => {
                if (el) items.current.set(x, el)
              }}
              type="button"
              className={cx(s.trayItem, drag?.payload === x && s.lifted)}
              aria-label={f.foods[x].the}
              data-testid={x === r.good ? 'game-answer' : undefined}
              {...bind(x)}
            >
              <OpenMoji hex={FOOD_HEX[x]} alt="" size={72} />
            </button>
          ))}
      </div>
      {drag && (
        <Ghost x={drag.x} y={drag.y}>
          <OpenMoji hex={FOOD_HEX[drag.payload]} alt="" size={72} />
        </Ghost>
      )}
    </div>
  )
}
