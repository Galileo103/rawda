import type { AreaId, Lang, Level } from '../types'

/** Adaptive difficulty per learning area and language. */
export interface LevelState {
  key: string
  areaId: AreaId
  lang: Lang
  level: Level
  streakCorrect: number
  streakMiss: number
}

export type DifficultySetting = 'auto' | Level

const UP_AFTER = 3
const DOWN_AFTER = 2

export function levelKey(areaId: AreaId, lang: Lang): string {
  return `${areaId}|${lang}`
}

export function initialLevelState(areaId: AreaId, lang: Lang): LevelState {
  return { key: levelKey(areaId, lang), areaId, lang, level: 1, streakCorrect: 0, streakMiss: 0 }
}

/** Up after 3 first-try successes in a row; down after 2 struggles in a row. */
export function nextLevelState(state: LevelState, firstTry: boolean): LevelState {
  if (firstTry) {
    const streakCorrect = state.streakCorrect + 1
    if (streakCorrect >= UP_AFTER && state.level < 5) {
      return { ...state, level: (state.level + 1) as Level, streakCorrect: 0, streakMiss: 0 }
    }
    return { ...state, streakCorrect, streakMiss: 0 }
  }
  const streakMiss = state.streakMiss + 1
  if (streakMiss >= DOWN_AFTER && state.level > 1) {
    return { ...state, level: (state.level - 1) as Level, streakCorrect: 0, streakMiss: 0 }
  }
  return { ...state, streakMiss, streakCorrect: 0 }
}

/** A parent override always wins over the automatic level. */
export function effectiveLevel(state: LevelState | undefined, setting: DifficultySetting): Level {
  if (setting !== 'auto') return setting
  return state?.level ?? 1
}

/** How many answer options to show for an item of a given difficulty. */
export function choiceCountFor(difficulty: number): number {
  if (difficulty <= 1) return 2
  if (difficulty <= 3) return 3
  return 4
}
