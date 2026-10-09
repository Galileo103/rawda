/**
 * Activities finished since the app was opened (in memory only — not progress data).
 * Used to offer a movement break every few activities.
 */
let finished = 0

export function countFinishedActivity(): number {
  finished += 1
  return finished
}

export function isBreakDue(count: number, every: number): boolean {
  return every > 0 && count > 0 && count % every === 0
}
