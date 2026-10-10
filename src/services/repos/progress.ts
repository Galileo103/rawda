import { type LevelState, initialLevelState, levelKey, nextLevelState } from '../../domain/engine/difficulty'
import { type MasteryRecord, applyOutcome, masteryKey } from '../../domain/engine/mastery'
import { GAME_ACTIVITY_PREFIX, type GameId, gameActivityId, gameFromActivityId } from '../../content/games'
import { DAILY_SEED_BONUS, gameStars } from '../../domain/garden'
import { type RewardDefLike, rewardsToGrant, starsForSession } from '../../domain/rewards'
import type { AreaId, ItemOutcome, Lang } from '../../domain/types'
import { db, localDay } from '../db'

export interface ItemResult extends ItemOutcome {
  activityId: string
  itemId: string
  skill: string
  areaId: AreaId
  lang: Lang
  durationMs: number
  /** Optional 0..1 detail for the parent dashboard (never used for mastery). */
  quality?: number
}

/** One finished task: attempt log + mastery + adaptive level, atomically. */
export async function recordItemResult(r: ItemResult, now = Date.now()): Promise<{ mastery: MasteryRecord; level: LevelState }> {
  return db.transaction('rw', db.attempts, db.mastery, db.levels, async () => {
    await db.attempts.add({
      activityId: r.activityId,
      itemId: r.itemId,
      skill: r.skill,
      areaId: r.areaId,
      lang: r.lang,
      firstTry: r.firstTry,
      misses: r.misses,
      hintsUsed: r.hintsUsed,
      durationMs: r.durationMs,
      ...(r.quality !== undefined ? { quality: Math.max(0, Math.min(1, r.quality)) } : {}),
      ts: now,
    })
    const prev = await db.mastery.get(masteryKey(r.skill, r.lang))
    const mastery = applyOutcome(prev, r.skill, r.lang, r, now)
    await db.mastery.put(mastery)
    const lvPrev = (await db.levels.get(levelKey(r.areaId, r.lang))) ?? initialLevelState(r.areaId, r.lang)
    const level = nextLevelState(lvPrev, r.firstTry)
    await db.levels.put(level)
    return { mastery, level }
  })
}

export async function getMasteryMap(): Promise<Map<string, MasteryRecord>> {
  const all = await db.mastery.toArray()
  return new Map(all.map((m) => [m.key, m]))
}

export async function getLevelState(areaId: AreaId, lang: Lang): Promise<LevelState | undefined> {
  return db.levels.get(levelKey(areaId, lang))
}

export async function totalStars(): Promise<number> {
  let sum = 0
  await db.completions.each((c) => {
    sum += c.stars
  })
  return sum
}

export async function completedActivityIds(): Promise<Set<string>> {
  return new Set((await db.completions.toArray()).map((c) => c.activityId))
}

/**
 * Grant every reward whose rule is now satisfied. Safe to call repeatedly:
 * rewards are keyed by id, so the same sticker can never be granted twice,
 * and nothing is ever removed.
 */
export async function grantEarnedRewards<T extends RewardDefLike>(defs: readonly T[], now = Date.now()): Promise<T[]> {
  return db.transaction('rw', [db.rewards, db.completions, db.storyProgress, db.drawings], async () => {
    const owned = new Set((await db.rewards.toArray()).map((r) => r.rewardId))
    const completions = await db.completions.toArray()
    const ctx = {
      completedActivityIds: new Set(completions.map((c) => c.activityId)),
      finishedStoryIds: new Set((await db.storyProgress.toArray()).filter((s) => s.finished).map((s) => s.storyId)),
      totalStars: completions.reduce((s, c) => s + c.stars, 0),
      drawingsCount: await db.drawings.count(),
    }
    const fresh = rewardsToGrant(defs, ctx, owned)
    for (const d of fresh) await db.rewards.put({ rewardId: d.id, earnedAt: now })
    return fresh
  })
}

export interface CompletionInput {
  activityId: string
  areaId: AreaId
  lang: Lang
  items: number
}

export async function recordCompletion<T extends RewardDefLike>(
  input: CompletionInput,
  rewardDefs: readonly T[],
  now = Date.now(),
): Promise<{ stars: number; newRewards: T[] }> {
  const stars = starsForSession(input.items)
  await db.completions.add({ ...input, stars, ts: now })
  const newRewards = await grantEarnedRewards(rewardDefs, now)
  return { stars, newRewards }
}

// ---- Play World games ----

/**
 * One finished game session. Stored as a completion (activity id `game:<id>`) so its
 * stars count everywhere stars count: the stars pill, star stickers and the garden.
 * The first game of the day adds the surprise-seed bonus.
 */
export async function recordGameCompletion<T extends RewardDefLike>(
  input: { gameId: GameId; areaId: AreaId; lang: Lang; rounds: number },
  rewardDefs: readonly T[],
  now = Date.now(),
): Promise<{ stars: number; bonus: number; starsBefore: number; newRewards: T[] }> {
  const { stars, bonus, starsBefore } = await db.transaction('rw', db.completions, async () => {
    const dayStart = new Date(now).setHours(0, 0, 0, 0)
    const gamesToday = await db.completions
      .where('ts')
      .aboveOrEqual(dayStart)
      .filter((c) => c.activityId.startsWith(GAME_ACTIVITY_PREFIX))
      .count()
    let starsBefore = 0
    await db.completions.each((c) => {
      starsBefore += c.stars
    })
    const stars = gameStars(input.rounds, gamesToday === 0)
    await db.completions.add({ activityId: gameActivityId(input.gameId), areaId: input.areaId, lang: input.lang, items: input.rounds, stars, ts: now })
    return { stars, bonus: gamesToday === 0 ? DAILY_SEED_BONUS : 0, starsBefore }
  })
  const newRewards = await grantEarnedRewards(rewardDefs, now)
  return { stars, bonus, starsBefore, newRewards }
}

/** Finished sessions per game id. */
export async function gamePlays(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await db.completions.each((c) => {
    const g = gameFromActivityId(c.activityId)
    if (g) out.set(g.id, (out.get(g.id) ?? 0) + 1)
  })
  return out
}

/** Which lesson items (per lesson activity) the child has already been through. */
export async function takenLessonItems(activityIds: readonly string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(activityIds.map((id) => [id, new Set<string>()]))
  if (activityIds.length === 0) return out
  await db.attempts
    .where('activityId')
    .anyOf([...activityIds])
    .each((a) => out.get(a.activityId)?.add(a.itemId))
  return out
}

export async function lastCompletedActivityId(): Promise<string | undefined> {
  return (await db.completions.orderBy('ts').last())?.activityId
}

export async function ownedRewardIds(): Promise<Set<string>> {
  return new Set((await db.rewards.toArray()).map((r) => r.rewardId))
}

// ---- stories ----

export async function saveStoryPage(storyId: string, page: number, lang: Lang): Promise<void> {
  const prev = await db.storyProgress.get(storyId)
  await db.storyProgress.put({ storyId, page, lang, finished: prev?.finished ?? false, updatedAt: Date.now() })
}

export async function finishStory<T extends RewardDefLike>(storyId: string, lang: Lang, rewardDefs: readonly T[]): Promise<T[]> {
  await db.storyProgress.put({ storyId, page: 0, lang, finished: true, updatedAt: Date.now() })
  return grantEarnedRewards(rewardDefs)
}

// ---- usage (supportive daily time, never punitive) ----

export async function addUsage(seconds: number, now = Date.now()): Promise<void> {
  const day = localDay(now)
  await db.transaction('rw', db.usage, async () => {
    const row = (await db.usage.get(day)) ?? { day, seconds: 0, bonusSeconds: 0 }
    await db.usage.put({ ...row, seconds: row.seconds + seconds })
  })
}

export async function extendToday(seconds: number, now = Date.now()): Promise<void> {
  const day = localDay(now)
  const row = (await db.usage.get(day)) ?? { day, seconds: 0, bonusSeconds: 0 }
  await db.usage.put({ ...row, bonusSeconds: row.bonusSeconds + seconds })
}
