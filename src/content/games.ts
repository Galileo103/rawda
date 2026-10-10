import type { AreaId, Lang } from '../domain/types'
import { fmt } from '../i18n'
import type { Dict } from '../i18n'
import type { ColorKey, ShapeKey } from './schemas'

/**
 * Play World mini-games: the catalog and the fixed pools each game draws its rounds from.
 * Pure (no Vite APIs) so scripts/render-audio.ts can pre-render every line a game says.
 */

export const GAME_IDS = ['frog', 'balloons', 'count', 'train', 'butterflies', 'shapes', 'next', 'odd'] as const
export type GameId = (typeof GAME_IDS)[number]

export interface GameDef {
  id: GameId
  /** Hub section: letters & numbers, or colors, shapes & thinking. */
  section: 'ln' | 'csl'
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
  glyph: string
  /** Spoken/display name ("البَاء"); English uses the glyph itself. */
  name: string
}

export const AR_LETTERS: readonly Letter[] = ([
  ['ا', 'الأَلِف'], ['ب', 'البَاء'], ['ت', 'التَّاء'], ['ث', 'الثَّاء'], ['ج', 'الجِيم'], ['ح', 'الحَاء'], ['خ', 'الخَاء'],
  ['د', 'الدَّال'], ['ذ', 'الذَّال'], ['ر', 'الرَّاء'], ['ز', 'الزَّاي'], ['س', 'السِّين'], ['ش', 'الشِّين'], ['ص', 'الصَّاد'],
  ['ض', 'الضَّاد'], ['ط', 'الطَّاء'], ['ظ', 'الظَّاء'], ['ع', 'العَيْن'], ['غ', 'الغَيْن'], ['ف', 'الفَاء'], ['ق', 'القَاف'],
  ['ك', 'الكَاف'], ['ل', 'اللَّام'], ['م', 'المِيم'], ['ن', 'النُّون'], ['ه', 'الهَاء'], ['و', 'الوَاو'], ['ي', 'اليَاء'],
] as [string, string][]).map(([glyph, name]) => ({ glyph, name }))

export const EN_LETTERS: readonly Letter[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({ glyph: c, name: c }))

export const lettersFor = (lang: Lang) => (lang === 'ar' ? AR_LETTERS : EN_LETTERS)

/** Letters in play per stage (alphabet order, so early stages meet the first letters). */
export function letterPool(lang: Lang, stage: Stage): readonly Letter[] {
  const cut = lang === 'ar' ? [7, 16, 28] : [8, 16, 26]
  return lettersFor(lang).slice(0, cut[stage - 1])
}

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
export const PATTERN_KINDS: Record<Stage, readonly string[]> = { 1: ['AB'], 2: ['AAB', 'ABB'], 3: ['ABC', 'AABB'] }

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
  { id: 'cat', hex: '1F408', x: 39, y: 85, size: 'sm' },
]

/** Props drawn in the games' scenes. */
export const PROP_HEX = { fly: '1FAB0', bunny: '1F430', carrot: '1F955', engine: '1F682', frog: '1F438' } as const

/** Every OpenMoji the Play World needs offline (fetched by scripts/fetch-assets.ts). */
export const GAME_HEXES: readonly string[] = [
  ...new Set([
    ...GAMES.map((g) => g.hex),
    ...PATTERN_SETS.flat(),
    ...Object.values(CATEGORIES).flat(),
    ...GARDEN.map((g) => g.hex),
    ...Object.values(PROP_HEX),
  ]),
]

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
  for (const key of ['countMore', 'countLess', 'train', 'trainDone', 'butterflies', 'butterfliesDone', 'shapes', 'next', 'odd', 'done', 'grew', 'garden'] as const) out.push(s[key])
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
