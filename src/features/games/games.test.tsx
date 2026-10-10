import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../../app/App'
import { GAME_HEXES, GAMES, gameLines } from '../../content/games'
import { content } from '../../content/loader'
import { picturePath } from '../../content/pictureSources'
import { collectNarration } from '../../content/narration'
import { DAILY_SEED_BONUS } from '../../domain/garden'
import { dictionaries, fmt } from '../../i18n'
import { db } from '../../services/db'
import { hashPin } from '../../services/parentGate'
import { gamePlays, recordGameCompletion, totalStars } from '../../services/repos/progress'
import { updateSettings } from '../../services/repos/settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.location.hash = '#/'
})

describe('Play World content', () => {
  it('ships every game picture offline', () => {
    for (const hex of GAME_HEXES) expect(existsSync(join(process.cwd(), 'public', 'assets', picturePath(hex))), hex).toBe(true)
  })

  it('every game line is complete and reaches the narration list (so it gets a recorded clip)', () => {
    const all = new Set(collectNarration(content, dictionaries).map((l) => `${l.lang}|${l.text}`))
    for (const lang of ['ar', 'en'] as const) {
      const lines = gameLines(lang, dictionaries[lang])
      expect(lines.length).toBeGreaterThan(100)
      for (const line of lines) {
        expect(line, line).not.toMatch(/[{}]/)
        expect(all.has(`${lang}|${line.replace(/\s+/g, ' ').trim()}`), line).toBe(true)
      }
    }
    expect(all.has(`ar|${fmt(dictionaries.ar.games.say.frog, { letter: 'البَاء' })}`)).toBe(true)
  })

  it('names every game in both languages', () => {
    for (const g of GAMES) {
      expect(dictionaries.ar.games.titles[g.id]).toBeTruthy()
      expect(dictionaries.en.games.titles[g.id]).toBeTruthy()
    }
  })
})

describe('game progress', () => {
  it('a game session adds stars everywhere stars count; the daily seed comes once a day', async () => {
    const day = new Date(2026, 9, 10, 9).getTime()
    const first = await recordGameCompletion({ gameId: 'frog', areaId: 'letters', lang: 'ar', rounds: 4 }, [], day)
    expect(first).toMatchObject({ stars: 4 + DAILY_SEED_BONUS, bonus: DAILY_SEED_BONUS, starsBefore: 0 })
    const second = await recordGameCompletion({ gameId: 'frog', areaId: 'letters', lang: 'ar', rounds: 4 }, [], day + 60_000)
    expect(second).toMatchObject({ stars: 4, bonus: 0, starsBefore: 4 + DAILY_SEED_BONUS })
    const nextDay = await recordGameCompletion({ gameId: 'odd', areaId: 'logic', lang: 'ar', rounds: 3 }, [], day + 24 * 3600_000)
    expect(nextDay.bonus).toBe(DAILY_SEED_BONUS)
    expect(await totalStars()).toBe(4 + DAILY_SEED_BONUS + 4 + 3 + DAILY_SEED_BONUS)
    expect(Object.fromEntries(await gamePlays())).toEqual({ frog: 2, odd: 1 })
  })
})

describe('Play World screens', () => {
  async function onboard() {
    await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') })
  }

  it('home opens the Play World with all eight games', async () => {
    await onboard()
    window.location.hash = '#/home'
    render(<App />)
    await userEvent.click(await screen.findByTestId('play-world'))
    for (const g of GAMES) expect(await screen.findByTestId(`game-${g.id}`)).toBeInTheDocument()
    expect(screen.getByText('الضفدع الجائع')).toBeInTheDocument()
  })

  it('playing Odd One Out to the end celebrates, saves the stars and grows the garden', async () => {
    await onboard()
    window.location.hash = '#/games/odd'
    render(<App />)
    // A wrong tap never ends the round.
    await userEvent.click((await screen.findAllByTestId('game-other'))[0]!)
    expect(screen.getAllByTestId('game-answer')).toHaveLength(1)
    for (let i = 0; i < 4; i++) {
      const answer = await screen.findByTestId('game-answer')
      await userEvent.click(answer)
      // Praise, the star flies, then the next round replaces this one.
      await waitFor(() => expect(answer.isConnected).toBe(false), { timeout: 6000 })
    }
    expect(await screen.findByRole('heading', { name: 'أحسنت!' }, { timeout: 8000 })).toBeInTheDocument()
    expect(await totalStars()).toBe(4 + DAILY_SEED_BONUS)
    expect((await gamePlays()).get('odd')).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: /اذهب إلى الحديقة/ }))
    expect(await screen.findByRole('group', { name: 'حديقة هالة' })).toBeInTheDocument()
    // 6 stars → the sprout plus two new friends.
    expect(screen.getAllByRole('button', { name: /نَبْتَة صَغِيرَة|زَهْرَة التُّولِيب|زَهْرَة عَبَّاد الشَّمْس/ })).toHaveLength(3)
  }, 40_000)
})
