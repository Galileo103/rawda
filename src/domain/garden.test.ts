import { describe, expect, it } from 'vitest'
import { DAILY_SEED_BONUS, STARS_PER_PLANT, gameRounds, gameStage, gameStars, gardenUnlocked, starsToNextPlant } from './garden'

describe('garden', () => {
  it('starts with one sprout and grows one item per few stars', () => {
    expect(gardenUnlocked(0, 20)).toBe(1)
    expect(gardenUnlocked(STARS_PER_PLANT - 1, 20)).toBe(1)
    expect(gardenUnlocked(STARS_PER_PLANT, 20)).toBe(2)
    expect(gardenUnlocked(STARS_PER_PLANT * 5, 20)).toBe(6)
  })

  it('never exceeds the garden and never goes below the first sprout', () => {
    expect(gardenUnlocked(10_000, 20)).toBe(20)
    expect(gardenUnlocked(-5, 20)).toBe(1)
  })

  it('counts down to the next item and stops once full', () => {
    expect(starsToNextPlant(0, 20)).toBe(STARS_PER_PLANT)
    expect(starsToNextPlant(STARS_PER_PLANT + 1, 20)).toBe(STARS_PER_PLANT - 1)
    expect(starsToNextPlant(10_000, 20)).toBe(0)
  })
})

describe('games', () => {
  it('opens stages by playing, up to 3', () => {
    expect([0, 1, 2, 9].map(gameStage)).toEqual([1, 2, 3, 3])
  })

  it('gives a star per round plus the daily seed once', () => {
    expect(gameStars(4, false)).toBe(4)
    expect(gameStars(4, true)).toBe(4 + DAILY_SEED_BONUS)
    expect(gameStars(0, false)).toBe(1)
  })

  it('keeps sessions short for the youngest', () => {
    expect([4, 6, 8].map(gameRounds)).toEqual([3, 4, 5])
  })
})
