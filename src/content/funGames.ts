import type { Lang } from '../domain/types'
import { type Dict, fmt } from '../i18n'
import {
  FOOD_SKILL,
  type FoodAnimal,
  type FoodId,
  HABITAT_SKILL,
  type HabitatAnimal,
  type HomeId,
  type Letter,
  WEATHER_IDS,
  type WeatherId,
  firstLetterOf,
  lettersFor,
  numberName,
} from './games'
import type { Activity, LexEntry } from './schemas'

/**
 * The silly games (Silly Hala, Hungry Monster, Dress the Hero, Animal Mix-up) and the
 * Remember Box: their fixed tables and every line they say. Rounds build their lines
 * with these same helpers, and funGameLines() lists them all for the audio build, so
 * every line has a recorded clip. Pure (no Vite APIs).
 */

// ---- words ----

const TASHKEEL = /[ً-ٰٟـ]/g
const bare = (w: string) => w.replace(TASHKEEL, '').trim()

/** Feminine nouns with no ة ending (عَيْن، أُذُن، شَمْس، يَد), compared without tashkeel. */
const AR_FEMININE_WORDS = new Set(['عين', 'أذن', 'شمس', 'يد'])
/** Arabic nouns ending in ة / ات / اة (or listed above) take هَذِهِ and feminine verbs. */
export const arFeminine = (w: string) => AR_FEMININE_WORDS.has(bare(w)) || /(ة|ات|اة)$/.test(bare(w))
/** "قِطَّة" → "القِطَّة"; a noun and its adjective both take it ("شَكْل بَيْضَاوِيّ" → "الشَكْل البَيْضَاوِيّ"). */
export const arDef = (w: string) =>
  w
    .trim()
    .split(/\s+/)
    .map((x) => `ال${x.replace(/[ً-ٍ]$/, '')}`)
    .join(' ')
/** "القِرْد" → "لِلقِرْد". */
export const arFor = (def: string) => `لِل${def.slice(2)}`

const EN_BARE = new Set(['grapes', 'leaves', 'sunglasses', 'grass', 'water', 'corn', 'rain', 'snow', 'ice cream'])
export const enA = (w: string) => (EN_BARE.has(w) ? w : `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`)
export const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** Single, picturable words Silly Hala can name (and get wrong). */
export const sillyWordOk = (e: LexEntry | undefined): e is LexEntry => !!e && !!e.ar && !!e.en && !bare(e.ar).includes(' ')

/** Letter id → the words its Discover lesson showed (lexicon ids). */
export function letterLessonWords(activities: readonly Activity[], lang: Lang): Map<string, string[]> {
  const lesson = activities.find((a) => a.id === `${lang}-discover`)
  const out = new Map<string, string[]>()
  for (const item of lesson?.items ?? []) if ('examples' in item) out.set(item.id, [...(item.examples as string[])])
  return out
}

/** Hungry Monster only eats things: never people or body parts (a police officer, an eye, a tooth). */
const NOT_FOOD_TAGS = new Set(['person', 'body'])
export const monsterCanEat = (e: LexEntry) => !(e.tags ?? []).some((t) => NOT_FOOD_TAGS.has(t))

/** Lesson words that really start with the letter (a lesson may show a word with the letter inside, like "fox" for X), minus people and body parts. */
export function monsterWords(letter: Letter, words: readonly string[], lexicon: ReadonlyMap<string, LexEntry>, lang: Lang): LexEntry[] {
  return words
    .map((w) => lexicon.get(w))
    .filter((e): e is LexEntry => !!e && monsterCanEat(e) && firstLetterOf(e[lang], lang) === firstLetterOf(letter.glyph, lang))
}

// ---- Silly Hala ----

const fun = (d: Dict) => d.games.fun

export function sillyClaimWord(e: LexEntry, lang: Lang, d: Dict): string {
  const f = fun(d)
  return lang === 'ar' ? fmt(arFeminine(e.ar) ? f.sillyThisF : f.sillyThisM, { thing: e.ar }) : fmt(f.sillyThisM, { thing: enA(e.en) })
}
export const sillyShowWord = (e: LexEntry, lang: Lang, d: Dict) => fmt(fun(d).sillyShow, { thing: lang === 'ar' ? arDef(e.ar) : `the ${e.en}` })
export function sillyRevealWord(e: LexEntry, lang: Lang, d: Dict): string {
  const f = fun(d)
  return lang === 'ar' ? fmt(arFeminine(e.ar) ? f.sillyRevealF : f.sillyRevealM, { thing: e.ar }) : fmt(f.sillyRevealM, { thing: enA(e.en) })
}
export const sillyClaimLetter = (l: Letter, d: Dict) => fmt(fun(d).sillyLetter, { letter: l.name })
export const sillyShowLetter = (l: Letter, d: Dict) => fmt(fun(d).sillyShowLetter, { letter: l.name })
export const sillyRevealLetter = (l: Letter, d: Dict) => fmt(fun(d).sillyRevealLetter, { letter: l.name })
export const sillyClaimCount = (n: number, d: Dict) => fmt(fun(d).sillyCount, { number: numberName(n, d) })
export const sillyRevealCount = (n: number, d: Dict) => fmt(fun(d).sillyRevealCount, { number: numberName(n, d) })

/** Letters that look alike, so Hala's mistakes are believable (ب/ت/ث/ن, b/d/p…). Shared with lesson checks. */
export { LOOKALIKE } from './confusables'

// ---- Hungry Monster ----

export const monsterWant = (l: Letter, d: Dict) => fmt(fun(d).monsterWant, { letter: l.name })
export const monsterWantTwo = (l: Letter, d: Dict) => fmt(fun(d).monsterWantTwo, { letter: l.name })
export const monsterYum = (e: LexEntry, l: Letter, lang: Lang, d: Dict) => fmt(fun(d).monsterYum, { thing: lang === 'ar' ? e.ar : cap(e.en), letter: l.name })
export const monsterNoThanks = (e: LexEntry, l: Letter, lang: Lang, d: Dict) => fmt(fun(d).monsterNoThanks, { thing: lang === 'ar' ? e.ar : cap(e.en), letter: l.name })

// ---- Dress the Hero ----

export type ClothesId = 'umbrella' | 'coat' | 'scarf' | 'hat' | 'sunglasses'
/** Where a garment sits on the hero picture (E001 / E002, 100×100). */
export type Slot = 'umb' | 'head' | 'eyes' | 'neck' | 'body'
export const CLOTHES: Record<ClothesId, { hex: string; slot: Slot }> = {
  umbrella: { hex: '2602', slot: 'umb' },
  coat: { hex: '1F9E5', slot: 'body' },
  scarf: { hex: '1F9E3', slot: 'neck' },
  hat: { hex: '1F452', slot: 'head' },
  sunglasses: { hex: '1F576', slot: 'eyes' },
}
export const CLOTHES_IDS = Object.keys(CLOTHES) as ClothesId[]

export const WEATHER: Record<WeatherId, { good: readonly ClothesId[]; bad: readonly ClothesId[]; start: readonly ClothesId[]; cold: boolean }> = {
  rain: { good: ['umbrella', 'coat'], bad: ['sunglasses', 'hat'], start: ['sunglasses'], cold: true },
  snow: { good: ['coat', 'scarf'], bad: ['sunglasses', 'hat'], start: ['sunglasses', 'hat'], cold: true },
  sun: { good: ['hat', 'sunglasses'], bad: ['coat', 'scarf'], start: ['coat', 'scarf'], cold: false },
}

export const dressIntro = (w: WeatherId, d: Dict) => fun(d).dressIntro[w]
export const dressChange = (w: WeatherId, d: Dict) => fun(d).dressChange[w]
export const dressGood = (c: ClothesId, more: boolean, d: Dict) => fmt(more ? fun(d).dressGoodMore : fun(d).dressGood, { item: fun(d).clothes[c].the })
export const dressBad = (c: ClothesId, w: WeatherId, d: Dict) => fmt(fun(d).dressBad, { item: fun(d).clothes[c].a, weather: fun(d).weather[w] })

// ---- Animal Mix-up ----

export type SoundAnimal = 'cow' | 'cat' | 'dog' | 'duck' | 'sheep' | 'chicken' | 'frog' | 'chick'
export type AnimalId = SoundAnimal | HabitatAnimal | FoodAnimal
/** Real recordings (BigSoundBank, CC0), one short call each, in public/assets/sounds/animals. */
export const SOUND_ANIMALS: Record<SoundAnimal, { hex: string; file: string }> = {
  cow: { hex: '1F404', file: 'cow' },
  cat: { hex: '1F431', file: 'cat' },
  dog: { hex: '1F436', file: 'dog' },
  duck: { hex: '1F986', file: 'duck' },
  sheep: { hex: '1F411', file: 'sheep' },
  chicken: { hex: '1F414', file: 'hen' },
  frog: { hex: '1F438', file: 'frog' },
  chick: { hex: '1F423', file: 'chick' },
}
export const SOUND_ANIMAL_IDS = Object.keys(SOUND_ANIMALS) as SoundAnimal[]
export const soundPath = (a: AnimalId) => (a in SOUND_ANIMALS ? `sounds/animals/${SOUND_ANIMALS[a as SoundAnimal].file}.mp3` : undefined)
export const HOME_IDS: readonly HomeId[] = ['sea', 'desert', 'nest', 'trees', 'ice']
export const HOME_HEX: Record<HomeId, string> = { sea: '1F30A', desert: '1F3DC', nest: '1FAB9', trees: '1F333', ice: '2744' }
export const FOOD_HEX: Record<FoodId, string> = { carrot: '1F955', banana: '1F34C', grass: '1F33F', flower: '1F33C', corn: '1F33D', leaves: '1F343', fish: '1F41F' }
export const FOOD_IDS = Object.keys(FOOD_HEX) as FoodId[]
export const ANIMAL_HEX = {
  ...Object.fromEntries(SOUND_ANIMAL_IDS.map((a) => [a, SOUND_ANIMALS[a].hex])),
  ...Object.fromEntries((Object.keys(HABITAT_SKILL) as HabitatAnimal[]).map((a) => [a, HABITAT_SKILL[a].hex])),
  ...Object.fromEntries((Object.keys(FOOD_SKILL) as FoodAnimal[]).map((a) => [a, FOOD_SKILL[a].hex])),
} as Record<AnimalId, string>
const FEMININE: ReadonlySet<AnimalId> = new Set<AnimalId>(['cow', 'cat', 'duck', 'chicken', 'fish', 'bee', 'giraffe'])
const fem = (a: AnimalId) => FEMININE.has(a)

const animal = (a: AnimalId, d: Dict) => fun(d).animals[a]
export const mixSound = (a: SoundAnimal, d: Dict) => fmt(fem(a) ? fun(d).mixSoundF : fun(d).mixSoundM, { animal: animal(a, d) })
export const mixNot = (a: SoundAnimal, d: Dict) => fmt(fem(a) ? fun(d).mixNotF : fun(d).mixNotM, { animal: animal(a, d) })
export const mixYesAnd = (shown: SoundAnimal, real: SoundAnimal, d: Dict) => fmt(fem(shown) ? fun(d).mixYesAndF : fun(d).mixYesAndM, { a: animal(shown, d), b: animal(real, d) })
export const mixHome = (a: HabitatAnimal, d: Dict) => fmt(fem(a) ? fun(d).mixHomeF : fun(d).mixHomeM, { animal: animal(a, d) })
export const mixNotHome = (a: HabitatAnimal, h: HomeId, d: Dict) => fmt(fun(d).mixNotHome, { animal: animal(a, d), home: fun(d).homes[h] })
export function mixFood(a: FoodAnimal, food: FoodId, lang: Lang, d: Dict): string {
  const name = animal(a, d)
  const some = fun(d).foods[food].some
  return fmt(fem(a) ? fun(d).mixFoodF : fun(d).mixFoodM, { animal: name, animalFor: lang === 'ar' ? arFor(name) : name, food: lang === 'ar' ? some : cap(some) })
}
export const mixFoodYes = (a: FoodAnimal, d: Dict) => fmt(fem(a) ? fun(d).mixFoodYesF : fun(d).mixFoodYesM, { animal: animal(a, d), food: fun(d).foods[FOOD_SKILL[a].food].the })
export const mixFoodNo = (a: FoodAnimal, food: FoodId, d: Dict) => fmt(fem(a) ? fun(d).mixFoodNoF : fun(d).mixFoodNoM, { animal: animal(a, d), food: fun(d).foods[food].the })

// ---- Remember Box ----

export const rememberLetter = (l: Letter, d: Dict) => fmt(fun(d).remLetter, { letter: l.name })
export const rememberNumber = (n: number, d: Dict) => fmt(fun(d).remNumber, { number: numberName(n, d) })
export const rememberColor = (color: string, lang: Lang, d: Dict) => fmt(fun(d).remColor, { color: lang === 'ar' ? arDef(color) : color })
export const rememberShape = (shape: string, lang: Lang, d: Dict) => fmt(fun(d).remShape, { shape: lang === 'ar' ? arDef(shape) : shape })

// ---- everything they say (for scripts/render-audio.ts) ----

export function funGameLines(lang: Lang, d: Dict, lexicon: ReadonlyMap<string, LexEntry>, activities: readonly Activity[]): string[] {
  const f = fun(d)
  const out: string[] = [f.sillyOopsCount, f.sillyLookAgain, f.sillyImRight, f.sillyRightYes, f.monsterMore, f.dressDone, f.mixHomes, f.mixHomesDone]
  out.push(f.remIntro, f.remYes, f.remTry, f.remDone, f.remSleep)
  for (const e of lexicon.values()) if (sillyWordOk(e)) out.push(sillyClaimWord(e, lang, d), sillyShowWord(e, lang, d), sillyRevealWord(e, lang, d))
  const letters = lettersFor(lang)
  for (const l of letters) out.push(sillyClaimLetter(l, d), sillyShowLetter(l, d), sillyRevealLetter(l, d), monsterWant(l, d), monsterWantTwo(l, d), rememberLetter(l, d))
  for (let n = 1; n <= 10; n++) out.push(sillyClaimCount(n, d), sillyRevealCount(n, d), rememberNumber(n, d))
  for (const [id, words] of letterLessonWords(activities, lang)) {
    const l = letters.find((x) => x.id === id)
    if (!l) continue
    for (const e of monsterWords(l, words, lexicon, lang)) out.push(monsterYum(e, l, lang, d), monsterNoThanks(e, l, lang, d))
  }
  for (const w of WEATHER_IDS) {
    out.push(dressIntro(w, d), dressChange(w, d))
    for (const c of CLOTHES_IDS) out.push(dressBad(c, w, d))
  }
  for (const c of CLOTHES_IDS) out.push(dressGood(c, false, d), dressGood(c, true, d))
  for (const a of SOUND_ANIMAL_IDS) {
    out.push(mixSound(a, d), mixNot(a, d))
    for (const b of SOUND_ANIMAL_IDS) if (a !== b) out.push(mixYesAnd(a, b, d))
  }
  for (const a of Object.keys(HABITAT_SKILL) as HabitatAnimal[]) {
    out.push(mixHome(a, d))
    for (const h of HOME_IDS) if (h !== HABITAT_SKILL[a].home) out.push(mixNotHome(a, h, d))
  }
  for (const a of Object.keys(FOOD_SKILL) as FoodAnimal[]) {
    out.push(mixFoodYes(a, d))
    for (const food of FOOD_IDS) if (food !== FOOD_SKILL[a].food) out.push(mixFood(a, food, lang, d), mixFoodNo(a, food, d))
  }
  for (const c of Object.values(d.colors)) out.push(rememberColor(c, lang, d))
  for (const s of Object.values(d.shapes)) out.push(rememberShape(s, lang, d))
  return out
}
