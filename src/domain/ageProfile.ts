/** Optional age band set by the parent (no birthday stored). */
export type AgeBand = '3-4' | '4-5' | '5-6'

/**
 * How the experience adapts to the child's age. Younger children get fewer, bigger
 * options, shorter sessions, earlier gentle prompts and more forgiving tracing;
 * older children get a little more challenge. Used as defaults on top of the
 * adaptive engine — never as a judgement about the child.
 */
export interface AgeProfile {
  /** Most answer options shown at once. */
  maxChoices: number
  /** Most tasks in one sitting (practice activities). */
  sessionCap: number
  /** Quiet time before Hala gently repeats the question (ms). */
  idleMs: number
  /** Subtracted from the tracing coverage needed. */
  traceBonus: number
  /** A movement break after this many finished activities. */
  breakEvery: number
}

const PROFILES: Record<AgeBand, AgeProfile> = {
  '3-4': { maxChoices: 3, sessionCap: 4, idleMs: 7000, traceBonus: 0.12, breakEvery: 2 },
  '4-5': { maxChoices: 4, sessionCap: 6, idleMs: 9000, traceBonus: 0.05, breakEvery: 3 },
  '5-6': { maxChoices: 4, sessionCap: 8, idleMs: 12000, traceBonus: 0, breakEvery: 4 },
}

/** Unknown age → the middle profile (4–5). */
export function ageProfile(band: AgeBand | undefined): AgeProfile {
  return PROFILES[band ?? '4-5']
}
