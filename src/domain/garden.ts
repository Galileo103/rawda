/**
 * Hala's garden and Play World progression. Everything is derived from stars and play
 * counts the child already earned, so nothing can ever be lost or taken away.
 */

/** A new plant or friend appears for every few stars. */
export const STARS_PER_PLANT = 3

/** The first game finished each day plants a surprise seed. Missing a day costs nothing. */
export const DAILY_SEED_BONUS = 2

/** How many garden items are out (the first sprout is there from the start). */
export function gardenUnlocked(stars: number, total: number): number {
  return Math.min(total, 1 + Math.floor(Math.max(0, stars) / STARS_PER_PLANT))
}

/** Stars still needed for the next item; 0 once the garden is full. */
export function starsToNextPlant(stars: number, total: number): number {
  const out = gardenUnlocked(stars, total)
  return out >= total ? 0 : out * STARS_PER_PLANT - Math.max(0, stars)
}

/** Each game opens a little more with every finished session (1 → 3). */
export function gameStage(plays: number): 1 | 2 | 3 {
  return plays >= 2 ? 3 : plays >= 1 ? 2 : 1
}

/** One star per round finished, plus the daily seed. */
export function gameStars(rounds: number, firstGameToday: boolean): number {
  return Math.max(1, rounds) + (firstGameToday ? DAILY_SEED_BONUS : 0)
}

/** Rounds per session: short for the youngest (3), up to 5 for the oldest. */
export function gameRounds(sessionCap: number): number {
  return Math.max(3, Math.min(5, Math.floor(sessionCap / 2) + 1))
}
