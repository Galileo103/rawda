import type { AreaId, Lang } from '../domain/types'
import { fmt } from '../i18n'
import type { Dict } from '../i18n'
import type { ColorKey, ShapeKey } from './schemas'

/**
 * Play World mini-games: the catalog and the fixed pools each game draws its rounds from.
 * Pure (no Vite APIs) so scripts/render-audio.ts can pre-render every line a game says.
 */

export const GAME_IDS = ['frog', 'balloons', 'count', 'train', 'butterflies', 'shapes', 'next', 'odd', 'silly', 'monster', 'dress', 'mixup'] as const
export type GameId = (typeof GAME_IDS)[number]

export interface GameDef {
  id: GameId
  /** Hub section: letters & numbers, colors, shapes & thinking, or the silly games. */
  section: 'ln' | 'csl' | 'fun'
  /** Learning area the game practises (parent history; hidden when the parent turns the area off). */
  areaId: AreaId
  /** OpenMoji icon. */
  hex: string
  color: string
}

export const GAMES: readonly GameDef[] = [
  { id: 'frog', section: 'ln', areaId: 'letters', hex: '1F438', color: '#13897f' },
  { id: 'balloons', section: 'ln', areaId: 'letters', hex: '1F388', color: '#e8613a' },
  { id: 'count', section: 'ln', areaId: 'numbers', hex: '1F955', color: '#e8a400' },
  { id: 'train', section: 'ln', areaId: 'numbers', hex: '1F682', color: '#2f8fdb' },
  { id: 'butterflies', section: 'csl', areaId: 'colors-shapes', hex: '1F98B', color: '#d94a86' },
  { id: 'shapes', section: 'csl', areaId: 'colors-shapes', hex: '1F3E0', color: '#7a5cd6' },
  { id: 'next', section: 'csl', areaId: 'logic', hex: '1F34E', color: '#3f9d33' },
  { id: 'odd', section: 'csl', areaId: 'logic', hex: '1F50D', color: '#e8613a' },
  { id: 'silly', section: 'fun', areaId: 'letters', hex: 'E004', color: '#7a5cd6' },
  { id: 'monster', section: 'fun', areaId: 'letters', hex: 'E003', color: '#3f9d33' },
  { id: 'dress', section: 'fun', areaId: 'science', hex: '1F9E5', color: '#2f8fdb' },
  { id: 'mixup', section: 'fun', areaId: 'science', hex: '1F404', color: '#e8a400' },
]

/** Game sessions are stored as completions under this activity-id prefix. */
export const GAME_ACTIVITY_PREFIX = 'game:'
export const gameActivityId = (id: GameId) => `${GAME_ACTIVITY_PREFIX}${id}`
export const gameById = (id: string | undefined) => GAMES.find((g) => g.id === id)
/** "Play World · Hungry Frog" for a stored game completion (parent history); undefined for other activities. */
export function gameTitle(activityId: string, d: Dict): string | undefined {
  const g = gameFromActivityId(activityId)
  return g && `${d.games.playWorld} · ${d.games.titles[g.id]}`
}
export function gameFromActivityId(activityId: string): GameDef | undefined {
  return activityId.startsWith(GAME_ACTIVITY_PREFIX) ? gameById(activityId.slice(GAME_ACTIVITY_PREFIX.length)) : undefined
}

// ---- pools ----

export type Stage = 1 | 2 | 3

export interface Letter {
  /** Lesson item id ("ba", "b"): the skill is `${lang}.letter.${id}`. */
  id: string
  glyph: string
  /** Spoken/display name ("البَاء"); English uses the glyph itself. */
  name: string
}

/** ar-discover item ids, in alphabet order (matches AR_LETTERS). */
const AR_LETTER_IDS = 'alif ba ta tha jim hha kha dal dhal ra zay sin shin sad dad tta dha ayn ghayn fa qaf kaf lam mim nun ha waw ya'.split(' ')

export const AR_LETTERS: readonly Letter[] = ([
  ['ا', 'الأَلِف'], ['ب', 'البَاء'], ['ت', 'التَّاء'], ['ث', 'الثَّاء'], ['ج', 'الجِيم'], ['ح', 'الحَاء'], ['خ', 'الخَاء'],
  ['د', 'الدَّال'], ['ذ', 'الذَّال'], ['ر', 'الرَّاء'], ['ز', 'الزَّاي'], ['س', 'السِّين'], ['ش', 'الشِّين'], ['ص', 'الصَّاد'],
  ['ض', 'الضَّاد'], ['ط', 'الطَّاء'], ['ظ', 'الظَّاء'], ['ع', 'العَيْن'], ['غ', 'الغَيْن'], ['ف', 'الفَاء'], ['ق', 'القَاف'],
  ['ك', 'الكَاف'], ['ل', 'اللَّام'], ['م', 'المِيم'], ['ن', 'النُّون'], ['ه', 'الهَاء'], ['و', 'الوَاو'], ['ي', 'اليَاء'],
] as [string, string][]).map(([glyph, name], i) => ({ id: AR_LETTER_IDS[i] ?? glyph, glyph, name }))

export const EN_LETTERS: readonly Letter[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ id: c.toLowerCase(), glyph: c, name: c }))

export const lettersFor = (lang: Lang) => (lang === 'ar' ? AR_LETTERS : EN_LETTERS)

export const GAME_COLORS: readonly ColorKey[] = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink']
export const ODD_SHAPES: readonly ShapeKey[] = ['circle', 'square', 'triangle', 'star', 'heart']
export const BUILD_SHAPES: readonly ShapeKey[] = ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart']

export const PUZZLE_IDS = ['tree', 'icecream', 'house', 'car', 'rocket'] as const
export type PuzzleId = (typeof PUZZLE_IDS)[number]
export interface PuzzleSlot {
  shape: ShapeKey
  /** Box on a square board, in percent. */
  x: number
  y: number
  w: number
  h: number
  fill: string
  rot?: number
}
export const PUZZLES: Record<PuzzleId, readonly PuzzleSlot[]> = {
  tree: [
    { shape: 'circle', x: 20, y: 4, w: 60, h: 58, fill: '#3f9d33' },
    { shape: 'rectangle', x: 42, y: 60, w: 16, h: 36, fill: '#9a6a3a' },
  ],
  icecream: [
    { shape: 'circle', x: 27, y: 6, w: 46, h: 44, fill: '#f27bb0' },
    { shape: 'triangle', x: 30, y: 44, w: 40, h: 52, fill: '#f2b45a', rot: 180 },
  ],
  house: [
    { shape: 'circle', x: 2, y: 2, w: 20, h: 20, fill: '#ffc83d' },
    { shape: 'triangle', x: 16, y: 6, w: 70, h: 36, fill: '#e5484d' },
    { shape: 'square', x: 25, y: 42, w: 52, h: 52, fill: '#f2b45a' },
  ],
  car: [
    { shape: 'rectangle', x: 8, y: 34, w: 84, h: 34, fill: '#2f8fdb' },
    { shape: 'circle', x: 16, y: 58, w: 24, h: 24, fill: '#33264a' },
    { shape: 'circle', x: 60, y: 58, w: 24, h: 24, fill: '#33264a' },
  ],
  rocket: [
    { shape: 'star', x: 72, y: 6, w: 22, h: 22, fill: '#ffc83d' },
    { shape: 'triangle', x: 35, y: 4, w: 30, h: 26, fill: '#e5484d' },
    { shape: 'rectangle', x: 35, y: 30, w: 30, h: 50, fill: '#7a5cd6' },
    { shape: 'heart', x: 6, y: 62, w: 22, h: 22, fill: '#f27bb0' },
  ],
}
export const PUZZLES_BY_STAGE: Record<Stage, readonly PuzzleId[]> = { 1: ['tree', 'icecream'], 2: ['house', 'car', 'tree'], 3: ['rocket', 'house', 'car'] }

/** Picture sets for "What comes next?" (OpenMoji hexes). */
export const PATTERN_SETS: readonly (readonly string[])[] = [
  ['1F34E', '1F34C', '1F347', '1F353', '1F34A', '1F349'],
  ['1F436', '1F431', '1F430', '1F43B', '1F438', '1F43C'],
  ['1F697', '1F68C', '1F6B2', '2708', '1F680', '26F5'],
]

export const CATEGORY_IDS = ['animals', 'fruits', 'vehicles'] as const
export type CategoryId = (typeof CATEGORY_IDS)[number]
export const CATEGORIES: Record<CategoryId, readonly string[]> = {
  animals: ['1F436', '1F431', '1F430', '1F42E', '1F434', '1F411'],
  fruits: ['1F34E', '1F34C', '1F347', '1F353', '1F34A', '1F349'],
  vehicles: ['1F697', '1F68C', '1F6B2', '2708', '1F682', '1F680'],
}

// ---- Hala's garden ----

export const GARDEN_IDS = [
  'sprout', 'tulip', 'sunflower', 'ladybug', 'tree', 'butterfly', 'daisy', 'bee', 'mushroom', 'bunny',
  'bird', 'blossom', 'turtle', 'snail', 'palm', 'duck', 'squirrel', 'rainbow', 'house', 'cat',
] as const
export type GardenId = (typeof GARDEN_IDS)[number]
export interface GardenItem {
  id: GardenId
  hex: string
  /** Position in the scene, percent. */
  x: number
  y: number
  size: 'sm' | 'md' | 'lg'
}
/** In growing order (see domain/garden.ts). */
export const GARDEN: readonly GardenItem[] = [
  { id: 'sprout', hex: '1F331', x: 50, y: 80, size: 'sm' },
  { id: 'tulip', hex: '1F337', x: 22, y: 82, size: 'sm' },
  { id: 'sunflower', hex: '1F33B', x: 76, y: 74, size: 'md' },
  { id: 'ladybug', hex: '1F41E', x: 33, y: 91, size: 'sm' },
  { id: 'tree', hex: '1F333', x: 11, y: 56, size: 'lg' },
  { id: 'butterfly', hex: '1F98B', x: 60, y: 40, size: 'sm' },
  { id: 'daisy', hex: '1F33C', x: 89, y: 88, size: 'sm' },
  { id: 'bee', hex: '1F41D', x: 36, y: 44, size: 'sm' },
  { id: 'mushroom', hex: '1F344', x: 7, y: 90, size: 'sm' },
  { id: 'bunny', hex: '1F407', x: 63, y: 86, size: 'md' },
  { id: 'bird', hex: '1F426', x: 80, y: 28, size: 'sm' },
  { id: 'blossom', hex: '1F338', x: 42, y: 70, size: 'sm' },
  { id: 'turtle', hex: '1F422', x: 79, y: 93, size: 'sm' },
  { id: 'snail', hex: '1F40C', x: 50, y: 94, size: 'sm' },
  { id: 'palm', hex: '1F334', x: 91, y: 54, size: 'lg' },
  { id: 'duck', hex: '1F986', x: 25, y: 68, size: 'sm' },
  { id: 'squirrel', hex: '1F43F', x: 17, y: 72, size: 'sm' },
  { id: 'rainbow', hex: '1F308', x: 46, y: 18, size: 'lg' },
  { id: 'house', hex: '1F3E1', x: 68, y: 60, size: 'lg' },
  { id: 'cat', hex: '1F431', x: 39, y: 85, size: 'sm' },
]

/** Props drawn in the games' scenes. */
export const PROP_HEX = { playWorld: '1F3A1', bunny: '1F430', carrot: '1F955', engine: '1F682', frog: '1F438', drop: '1F4A7' } as const
/** Thumbs up / thumbs down on Silly Hala's judge buttons, so a child who can't read yet knows which is which. */
export const JUDGE_HEX = { yes: 'E006', no: 'E007' } as const

// ---- science the fun games play with (skills come from science-discover) ----

export type WeatherId = 'rain' | 'snow' | 'sun'
export const WEATHER_IDS: readonly WeatherId[] = ['rain', 'snow', 'sun']
export const WEATHER_SKILL: Record<WeatherId, { skill: string; hex: string }> = {
  rain: { skill: 'sci.weather.rain', hex: '1F327' },
  snow: { skill: 'sci.weather.cold', hex: '2744' },
  sun: { skill: 'sci.weather.hot', hex: '2600' },
}
/** Umbrella, coat, scarf, sun hat, sunglasses (Dress the Hero). */
export const CLOTHES_HEX: readonly string[] = ['2602', '1F9E5', '1F9E3', '1F452', '1F576']
/** Animals with a real recorded call (Animal Mix-up): cow, cat, dog, duck, sheep, hen, frog, chick. */
export const SOUND_ANIMAL_HEX: readonly string[] = ['1F404', '1F431', '1F436', '1F986', '1F411', '1F414', '1F438', '1F423']

export type HabitatAnimal = 'fish' | 'whale' | 'camel' | 'bird' | 'monkey' | 'penguin'
export type HomeId = 'sea' | 'desert' | 'nest' | 'trees' | 'ice'
export const HABITAT_SKILL: Record<HabitatAnimal, { skill: string; home: HomeId; hex: string; homeHex: string }> = {
  fish: { skill: 'sci.habitat.fish', home: 'sea', hex: '1F41F', homeHex: '1F30A' },
  whale: { skill: 'sci.habitat.whale', home: 'sea', hex: '1F40B', homeHex: '1F30A' },
  camel: { skill: 'sci.habitat.camel', home: 'desert', hex: '1F42A', homeHex: '1F3DC' },
  bird: { skill: 'sci.habitat.bird', home: 'nest', hex: '1F426', homeHex: '1FAB9' },
  monkey: { skill: 'sci.habitat.monkey', home: 'trees', hex: '1F412', homeHex: '1F333' },
  penguin: { skill: 'sci.habitat.penguin', home: 'ice', hex: '1F427', homeHex: '2744' },
}

export type FoodAnimal = 'rabbit' | 'monkey' | 'cow' | 'bee' | 'chicken' | 'giraffe' | 'penguin'
export type FoodId = 'carrot' | 'banana' | 'grass' | 'flower' | 'corn' | 'leaves' | 'fish'
export const FOOD_SKILL: Record<FoodAnimal, { skill: string; food: FoodId; hex: string; foodHex: string }> = {
  rabbit: { skill: 'sci.food.rabbit', food: 'carrot', hex: '1F407', foodHex: '1F955' },
  monkey: { skill: 'sci.food.monkey', food: 'banana', hex: '1F412', foodHex: '1F34C' },
  cow: { skill: 'sci.food.cow', food: 'grass', hex: '1F404', foodHex: '1F33F' },
  bee: { skill: 'sci.food.bee', food: 'flower', hex: '1F41D', foodHex: '1F33C' },
  chicken: { skill: 'sci.food.chicken', food: 'corn', hex: '1F414', foodHex: '1F33D' },
  giraffe: { skill: 'sci.food.giraffe', food: 'leaves', hex: '1F992', foodHex: '1F343' },
  penguin: { skill: 'sci.food.penguin', food: 'fish', hex: '1F427', foodHex: '1F41F' },
}

/** Every OpenMoji the Play World needs offline (fetched by scripts/fetch-assets.ts). */
export const GAME_HEXES: readonly string[] = [
  ...new Set([
    ...GAMES.map((g) => g.hex),
    ...PATTERN_SETS.flat(),
    ...Object.values(CATEGORIES).flat(),
    ...GARDEN.map((g) => g.hex),
    ...Object.values(PROP_HEX),
    ...Object.values(JUDGE_HEX),
    ...Object.values(WEATHER_SKILL).map((w) => w.hex),
    ...Object.values(HABITAT_SKILL).flatMap((h) => [h.hex, h.homeHex]),
    ...Object.values(FOOD_SKILL).flatMap((f) => [f.hex, f.foodHex]),
    ...CLOTHES_HEX,
    ...SOUND_ANIMAL_HEX,
  ]),
]

// ---- what the child has discovered ----

/** The letters, numbers, colours, shapes and ideas a child has met in Discover lessons. Games play only with these. */
export interface LearnedPools {
  letters: readonly Letter[]
  numbers: readonly number[]
  colors: readonly ColorKey[]
  shapes: readonly ShapeKey[]
  patternAB: boolean
  patternABB: boolean
  odd: boolean
  /** Picture words (lexicon ids) the child met in Discover lessons. */
  words: readonly string[]
  /** For each discovered letter (by id), the words its lesson showed. */
  letterWords: ReadonlyMap<string, readonly string[]>
  weathers: readonly WeatherId[]
  habitats: readonly HabitatAnimal[]
  foods: readonly FoodAnimal[]
}

/** Words the child met in lessons: all of them, and per letter lesson (built by useLearnedPools). */
export interface LearnedWords {
  words: readonly string[]
  letterWords: ReadonlyMap<string, readonly string[]>
}

/** Turn discovered skills (see introducedSkills) into game pools for one language. */
export function learnedPools(skills: ReadonlySet<string>, lang: Lang, met: LearnedWords = { words: [], letterWords: new Map() }): LearnedPools {
  const letters = lettersFor(lang).filter((l) => skills.has(`${lang}.letter.${l.id}`))
  return {
    letters,
    words: met.words,
    letterWords: new Map(letters.map((l) => [l.id, met.letterWords.get(l.id) ?? []])),
    weathers: WEATHER_IDS.filter((w) => skills.has(WEATHER_SKILL[w].skill)),
    habitats: (Object.keys(HABITAT_SKILL) as HabitatAnimal[]).filter((a) => skills.has(HABITAT_SKILL[a].skill)),
    foods: (Object.keys(FOOD_SKILL) as FoodAnimal[]).filter((a) => skills.has(FOOD_SKILL[a].skill)),
    numbers: Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => skills.has(`num.count.${n}`)),
    colors: GAME_COLORS.filter((c) => skills.has(`color.${c}`)),
    shapes: BUILD_SHAPES.filter((s) => skills.has(`shape.${s}`)),
    patternAB: skills.has('logic.pattern.ab'),
    patternABB: skills.has('logic.pattern.abb'),
    odd: skills.has('logic.odd'),
  }
}

/** Longest run of consecutive numbers (1, 2, 3, 5 → [1, 2, 3]). */
export function longestRun(nums: readonly number[]): number[] {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  let best: number[] = []
  let cur: number[] = []
  for (const n of sorted) {
    cur = cur.length && cur[cur.length - 1] === n - 1 ? [...cur, n] : [n]
    if (cur.length > best.length) best = cur
  }
  return best
}

/** Shape-builder pictures made only of shapes the child knows. */
export function playablePuzzles(shapes: readonly ShapeKey[]): PuzzleId[] {
  return PUZZLE_IDS.filter((id) => PUZZLES[id].every((s) => shapes.includes(s.shape)))
}

/** What a game still needs the child to discover (picks the "Discover first" message). */
export type NeedKey = 'letters' | 'numbers' | 'run' | 'colors' | 'shapes' | 'patterns' | 'odd' | 'weather' | 'animals'

export interface Readiness {
  ready: boolean
  need: NeedKey
  /** The Discover lesson that teaches what's missing. */
  lessonId: string
  /** How many learned things the game plays with (shown on its card). */
  learned: number
}

export function gameReadiness(id: GameId, p: LearnedPools, lang: Lang): Readiness {
  const letterLesson = lang === 'ar' ? 'ar-discover' : 'en-discover'
  switch (id) {
    case 'frog':
      return { ready: p.letters.length >= 2, need: 'letters', lessonId: letterLesson, learned: p.letters.length }
    case 'balloons': {
      const ready = p.letters.length >= 2 || p.numbers.length >= 2
      return { ready, need: 'letters', lessonId: letterLesson, learned: (p.letters.length >= 2 ? p.letters.length : 0) + (p.numbers.length >= 2 ? p.numbers.length : 0) }
    }
    case 'count':
      return { ready: p.numbers.length >= 1, need: 'numbers', lessonId: 'num-discover', learned: p.numbers.length }
    case 'train':
      return { ready: longestRun(p.numbers).length >= 3, need: 'run', lessonId: 'num-discover', learned: longestRun(p.numbers).length }
    case 'butterflies':
      return { ready: p.colors.length >= 2, need: 'colors', lessonId: 'colors-discover', learned: p.colors.length }
    case 'shapes':
      return { ready: playablePuzzles(p.shapes).length > 0, need: 'shapes', lessonId: 'shapes-discover', learned: p.shapes.length }
    case 'next':
      return { ready: p.patternAB, need: 'patterns', lessonId: 'logic-discover', learned: (p.patternAB ? 1 : 0) + (p.patternABB ? 1 : 0) }
    case 'odd':
      return { ready: p.odd, need: 'odd', lessonId: 'logic-discover', learned: 1 + (p.colors.length >= 2 ? 1 : 0) + (p.shapes.length >= 2 ? 1 : 0) }
    case 'silly':
      return { ready: sillyKinds(p).length > 0, need: 'letters', lessonId: letterLesson, learned: p.words.length + p.letters.length + p.numbers.length }
    case 'monster': {
      const n = monsterLetters(p).length
      return { ready: n >= 2, need: 'letters', lessonId: letterLesson, learned: n }
    }
    // Weather clothes and animal sounds are everyday knowledge: these two open on day one, so a
    // brand-new child always has something to play. Dress the Hero plays every weather whatever was
    // learned (the lesson only counts towards the card's goal); lessons add homes and food to the Mix-up.
    case 'dress':
      return { ready: true, need: 'weather', lessonId: 'science-discover', learned: p.weathers.length }
    case 'mixup':
      return { ready: true, need: 'animals', lessonId: 'science-discover', learned: p.habitats.length + p.foods.length }
  }
}

/** What Silly Hala can mix up: pictures, letters and counting, each once there is enough of it. */
export type SillyKind = 'pictures' | 'letters' | 'counting'
export function sillyKinds(p: LearnedPools): SillyKind[] {
  const out: SillyKind[] = []
  if (p.words.length >= 3) out.push('pictures')
  if (p.letters.length >= 3) out.push('letters')
  if (p.numbers.length >= 2) out.push('counting')
  return out
}

/** The first letter of a word, ignoring tashkeel and a leading "ال" (Hungry Monster checks its menu with it). */
export function firstLetterOf(word: string, lang: Lang): string {
  if (lang === 'en') return word.trim().charAt(0).toUpperCase()
  let w = word.normalize('NFC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').trim()
  if (w.startsWith('ال') && w.length > 3) w = w.slice(2)
  return w.charAt(0).replace(/[أإآ]/, 'ا')
}

/**
 * What Animal Mix-up can play: real animal sounds always (they need no lesson), homes once two
 * different homes are known, and food once one animal's food is.
 */
export type MixupMode = 'sounds' | 'homes' | 'food'
export function mixupModes(p: LearnedPools): MixupMode[] {
  const homes = new Set(p.habitats.map((a) => HABITAT_SKILL[a].home)).size >= 2
  const food = p.foods.length > 0
  return ['sounds', ...(homes ? (['homes'] as const) : []), ...(food ? (['food'] as const) : [])]
}

/** Discovered letters that have lesson words to feed Hungry Monster. */
export function monsterLetters(p: LearnedPools): Letter[] {
  return p.letters.filter((l) => (p.letterWords.get(l.id) ?? []).length > 0)
}

// ---- what the games say ----

/** Spoken name of a number 1..10 (falls back to digits). */
export function numberName(n: number, d: Dict): string {
  return d.voice.numbers[n - 1] ?? String(n)
}

export function countPrompt(n: number, d: Dict): string {
  const s = d.games.say
  return n === 1 ? s.countOne : n === 2 ? s.countTwo : fmt(s.countMany, { number: numberName(n, d) })
}

/** Every line a game can say in one language (fed into collectNarration). */
export function gameLines(lang: Lang, d: Dict): string[] {
  const g = d.games
  const s = g.say
  const out: string[] = [g.hubHello, ...Object.values(g.titles), ...Object.values(g.gardenItems)]
  for (const key of ['countMore', 'countLess', 'train', 'trainDone', 'butterflies', 'butterfliesDone', 'shapes', 'next', 'odd', 'done', 'grew', 'garden', 'discoverFirst'] as const) out.push(s[key])
  for (const l of lettersFor(lang)) out.push(fmt(s.frog, { letter: l.name }), fmt(s.balloonLetter, { letter: l.name }))
  for (let n = 1; n <= 10; n++) {
    out.push(fmt(s.balloonNumber, { number: numberName(n, d) }), countPrompt(n, d), fmt(s.countDone, { number: numberName(n, d) }))
  }
  for (const id of PUZZLE_IDS) out.push(fmt(s.shapesDone, { thing: g.things[id] }))
  for (const c of GAME_COLORS) out.push(fmt(s.oddColor, { color: d.colors[c] }))
  for (const sh of ODD_SHAPES) out.push(fmt(s.oddShape, { shape: d.shapes[sh] }))
  for (const a of CATEGORY_IDS)
    for (const b of CATEGORY_IDS) if (a !== b) out.push(fmt(s.oddCategory, { odd: g.categories[b], rest: g.categories[a] }))
  return out
}
