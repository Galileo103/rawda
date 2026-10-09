/**
 * Gentle rewards: earned for effort and participation, never removed,
 * never purchasable, never expiring.
 */
export type RewardRule =
  | { type: 'activity'; activityId: string }
  | { type: 'story'; storyId: string }
  | { type: 'stars'; total: number }
  | { type: 'drawings'; count: number }

export interface RewardDefLike {
  id: string
  rule: RewardRule
}

export interface RewardContext {
  completedActivityIds: ReadonlySet<string>
  finishedStoryIds: ReadonlySet<string>
  totalStars: number
  drawingsCount: number
}

/** Rewards whose rule is satisfied and that the child doesn't own yet. Idempotent. */
export function rewardsToGrant<T extends RewardDefLike>(defs: readonly T[], ctx: RewardContext, owned: ReadonlySet<string>): T[] {
  return defs.filter((d) => !owned.has(d.id) && ruleSatisfied(d.rule, ctx))
}

function ruleSatisfied(rule: RewardRule, ctx: RewardContext): boolean {
  switch (rule.type) {
    case 'activity':
      return ctx.completedActivityIds.has(rule.activityId)
    case 'story':
      return ctx.finishedStoryIds.has(rule.storyId)
    case 'stars':
      return ctx.totalStars >= rule.total
    case 'drawings':
      return ctx.drawingsCount >= rule.count
  }
}

/** One star per task finished — effort counts, mistakes never cost stars. */
export function starsForSession(itemsCompleted: number): number {
  return Math.max(1, itemsCompleted)
}
