export type Lang = 'ar' | 'en'
export type LearningMode = 'ar' | 'en' | 'both'

export const AREA_IDS = [
  'letters',
  'numbers',
  'colors-shapes',
  'stories',
  'islamic',
  'science',
  'logic',
  'creativity',
] as const
export type AreaId = (typeof AREA_IDS)[number]

/** Organisational learning stages — never used as developmental milestones. */
export type Level = 1 | 2 | 3 | 4 | 5

/** Result of one task (item) once the child has solved it. */
export interface ItemOutcome {
  /** Solved on the first try without asking for help. */
  firstTry: boolean
  /** Wrong taps before solving. Never shown to the child. */
  misses: number
  /** Times help was requested or escalated automatically. */
  hintsUsed: number
}
