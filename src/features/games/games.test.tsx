import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import type { AreaId } from '../../domain/types'
import { type ComponentType } from 'react'
import { SOUND_ANIMAL_IDS, funGameLines, soundPath } from '../../content/funGames'
import { splitName } from '../../domain/child'
import { GAME_HEXES, GAMES, type LearnedPools, firstLetterOf, gameLines, gameReadiness, learnedPools, longestRun, mixupModes, playablePuzzles } from '../../content/games'
import { MonsterRound, SillyRound } from './sillyRounds'
import { DressRound, MixupRound } from './worldRounds'
import { seededRng } from '../../domain/rng'
import { ButterfliesRound } from './colorLogicRounds'
import type { RoundProps } from './engine'
import { CountRound, FrogRound, TrainRound } from './letterNumberRounds'
import { content } from '../../content/loader'
import { picturePath } from '../../content/pictureSources'
import { collectNarration } from '../../content/narration'
import { DAILY_SEED_BONUS } from '../../domain/garden'
import { dictionaries, fmt, rawDictionaries } from '../../i18n'
import { db } from '../../services/db'
import { hashPin } from '../../services/parentGate'
import { gamePlays, recordGameCompletion, totalStars } from '../../services/repos/progress'
import { updateProfile, updateSettings } from '../../services/repos/settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.location.hash = '#/'
})

describe('Play World content', () => {
  it('ships every game picture offline', () => {
    for (const hex of GAME_HEXES) expect(existsSync(join(process.cwd(), 'public', 'assets', picturePath(hex))), hex).toBe(true)
    // Animal Mix-up's real recordings (CC0) ship with the app too.
    for (const a of SOUND_ANIMAL_IDS) expect(existsSync(join(process.cwd(), 'public', 'assets', soundPath(a) ?? '')), a).toBe(true)
  })

  it('every game line is complete and reaches the narration list (so it gets a recorded clip)', () => {
    const all = new Set(collectNarration(content, rawDictionaries).map((l) => `${l.lang}|${l.text}`))
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

/** Pretend the child finished a Discover lesson item (that's what "learned" means). */
async function discovered(activityId: string, itemId: string, skill: string, areaId: AreaId) {
  await db.attempts.add({ activityId, itemId, skill, areaId, lang: 'ar', firstTry: true, misses: 0, hintsUsed: 0, durationMs: 1000, ts: Date.now() })
}

describe('Play World screens', () => {
  async function onboard() {
    await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') })
  }

  it('home opens the Play World with all its games', async () => {
    await onboard()
    window.location.hash = '#/home'
    render(<App />)
    await userEvent.click(await screen.findByTestId('play-world'))
    for (const g of GAMES) expect(await screen.findByTestId(`game-${g.id}`)).toBeInTheDocument()
    expect(screen.getByText('الضفدع القافز')).toBeInTheDocument()
  })

  it('playing Odd One Out to the end celebrates, saves the stars and grows the garden', async () => {
    await onboard()
    await updateProfile({ gender: 'f', nameAr: 'مريم' })
    await discovered('logic-discover', 'odd', 'logic.odd', 'logic')
    window.location.hash = '#/games/odd'
    render(<App />)
    // Hala's lines may name the child: the bubble always shows the name, never the raw slot.
    const shown = new Set<string>()
    const watch = new MutationObserver(() => shown.add(document.body.textContent ?? ''))
    watch.observe(document.body, { subtree: true, childList: true, characterData: true })
    // A wrong tap never ends the round.
    await userEvent.click((await screen.findAllByTestId('game-other'))[0]!)
    expect(screen.getAllByTestId('game-answer')).toHaveLength(1)
    for (let i = 0; i < 4; i++) {
      const answer = await screen.findByTestId('game-answer')
      await userEvent.click(answer)
      // Praise, the star flies, then the next round replaces this one.
      await waitFor(() => expect(answer.isConnected).toBe(false), { timeout: 6000 })
    }
    expect(await screen.findByRole('heading', { name: 'أحسنتِ!' }, { timeout: 8000 })).toBeInTheDocument()
    watch.disconnect()
    expect([...shown].some((text) => text.includes('@name'))).toBe(false)
    expect(await totalStars()).toBe(4 + DAILY_SEED_BONUS)
    expect((await gamePlays()).get('odd')).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: /اذهبي إلى الحديقة/ }))
    expect(await screen.findByRole('group', { name: 'حديقة هالة' })).toBeInTheDocument()
    // 6 stars → the sprout plus two new friends.
    expect(screen.getAllByRole('button', { name: /نَبْتَة صَغِيرَة|زَهْرَة التُّولِيب|زَهْرَة عَبَّاد الشَّمْس/ })).toHaveLength(3)
  }, 40_000)
})

describe('games play only with what the child discovered', () => {
  const none = learnedPools(new Set(), 'ar')
  const some = learnedPools(new Set(['ar.letter.alif', 'ar.letter.ba', 'num.count.1', 'num.count.2', 'color.red', 'color.blue', 'shape.circle', 'shape.triangle', 'logic.pattern.ab']), 'ar')

  it('turns discovered skills into pools', () => {
    expect(some.letters.map((l) => l.id)).toEqual(['alif', 'ba'])
    expect(some.numbers).toEqual([1, 2])
    expect(some.colors).toEqual(['red', 'blue'])
    expect(playablePuzzles(some.shapes)).toEqual(['icecream'])
    expect(longestRun([1, 2, 3, 5, 6])).toEqual([1, 2, 3])
  })

  it('says "Discover first" until enough is learned, and points to the right lesson', () => {
    for (const g of GAMES) expect(gameReadiness(g.id, none, 'ar').ready, g.id).toBe(false)
    expect(gameReadiness('count', none, 'ar')).toMatchObject({ need: 'numbers', lessonId: 'num-discover' })
    expect(gameReadiness('frog', none, 'en').lessonId).toBe('en-discover')
    const ready = Object.fromEntries(GAMES.map((g) => [g.id, gameReadiness(g.id, some, 'ar').ready]))
    expect(ready).toEqual({ frog: true, balloons: true, count: true, train: false, butterflies: true, shapes: true, next: true, odd: false, silly: true, monster: false, dress: false, mixup: false })
  })

  it('the silly games open once their science and letter words are discovered', () => {
    const sci = learnedPools(new Set(['sci.weather.rain', 'sci.habitat.fish', 'sci.habitat.camel', 'sci.food.monkey']), 'ar')
    expect(sci.weathers).toEqual(['rain'])
    expect(mixupModes(sci)).toEqual(['sounds', 'homes', 'food'])
    expect(gameReadiness('dress', sci, 'ar').ready).toBe(true)
    expect(gameReadiness('mixup', sci, 'ar').ready).toBe(true)
    // Fish and whale share the sea: one home is not enough to mix up.
    expect(mixupModes(learnedPools(new Set(['sci.habitat.fish', 'sci.habitat.whale']), 'ar'))).toEqual([])
    const words = { words: [], letterWords: new Map([['ba', ['duck', 'cow']], ['ta', ['apple']]]) }
    const two = learnedPools(new Set(['ar.letter.ba', 'ar.letter.ta']), 'ar', words)
    expect(gameReadiness('monster', two, 'ar')).toMatchObject({ ready: true, learned: 2 })
    expect(gameReadiness('monster', learnedPools(new Set(['ar.letter.ba']), 'ar', words), 'ar').ready).toBe(false)
  })

  it('reads the first letter of a word the way a child hears it', () => {
    expect(firstLetterOf('بَطَّة', 'ar')).toBe('ب')
    expect(firstLetterOf('أَرْنَب', 'ar')).toBe('ا')
    expect(firstLetterOf('الْقِرْد', 'ar')).toBe('ق')
    expect(firstLetterOf('ball', 'en')).toBe('B')
  })

  it('every silly-game line is complete and gets a recorded clip', () => {
    const all = new Set(collectNarration(content, rawDictionaries).map((l) => `${l.lang}|${l.text}`))
    for (const lang of ['ar', 'en'] as const) {
      const lines = funGameLines(lang, dictionaries[lang], content.lexicon, content.activities)
      expect(lines.length).toBeGreaterThan(300)
      // Kind words only: a polite "no, thank you", never "yuck", laughing at a mistake, or "أف".
      for (const line of [...lines, ...gameLines(lang, dictionaries[lang])]) expect(line, line).not.toMatch(/يَعْ|يع!|هِهِهْ|أُفّ|أف!|yuck|hee hee|phew|ptooey|silly!/i)
      for (const line of lines) {
        expect(line, line).not.toMatch(/[{}]/)
        for (const piece of splitName(line)) {
          const t = piece?.replace(/\s+/g, ' ').trim()
          if (t) expect(all.has(`${lang}|${t}`), t).toBe(true)
        }
      }
    }
  })

  const fun = learnedPools(
    new Set(['ar.letter.ba', 'ar.letter.ta', 'ar.letter.tha', 'num.count.2', 'num.count.3', 'sci.weather.rain', 'sci.weather.hot', 'sci.habitat.fish', 'sci.habitat.camel', 'sci.food.monkey']),
    'ar',
    { words: ['duck', 'cow', 'apple', 'fox'], letterWords: new Map([['ba', ['duck', 'cow', 'egg']], ['ta', ['apple']], ['tha', ['fox']]]) },
  )

  it('Silly Hala: says "Wrong!" or "Right" honestly, then the child shows her the right one', async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { ctl, view } = play(SillyRound, fun, seed)
      const claim = ctl.prompt.mock.calls[0]?.[0] as string
      expect(claim).toMatch(/صَحٌّ أَمْ غَلَطٌ/)
      await userEvent.click(view.getByTestId('game-answer'))
      if (!ctl.correct.mock.calls.length) {
        // Hala was wrong: "Oops!" and a choice to fix her.
        expect(ctl.mood).toHaveBeenCalledWith('oops')
        await userEvent.click(view.getByTestId('game-answer'))
      }
      expect(ctl.correct).toHaveBeenCalledTimes(1)
      expect(ctl.wrong).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('Hungry Monster: only words from the letter lessons, and a wrong one gets a polite "no, thank you"', async () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { ctl, view } = play(MonsterRound, fun, seed)
      const labels = view.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
      for (const l of labels) expect(['بَطَّة', 'بَقَرَة', 'بَيْضَة', 'تُفَّاحَة', 'ثَعْلَب']).toContain(l)
      const target = String(ctl.practise.mock.calls[0]?.[0]).replace('ar.sound.', '')
      expect(['ba', 'ta', 'tha']).toContain(target)
      const mine = { ba: ['بَطَّة', 'بَقَرَة', 'بَيْضَة'], ta: ['تُفَّاحَة'], tha: ['ثَعْلَب'] }[target] ?? []
      const wrong = view.getAllByRole('button').find((b) => !mine.includes(b.getAttribute('aria-label') ?? ''))
      if (wrong) {
        await userEvent.click(wrong)
        expect(ctl.wrong).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^لَا، شُكْرًا!/))
      }
      while (!ctl.correct.mock.calls.length) await userEvent.click(view.getByTestId('game-answer'))
      expect(ctl.correct.mock.calls[0]?.[1]).toMatch(/^يَمْ يَمْ، شُكْرًا!/)
      view.unmount()
    }
  })

  it('Dress the Hero and Animal Mix-up play only with discovered weather, homes and food', async () => {
    for (let seed = 1; seed <= 8; seed++) {
      const dress = play(DressRound, fun, seed)
      expect(dress.ctl.practise).toHaveBeenCalledWith(expect.stringMatching(/^sci\.weather\.(rain|hot)$/))
      dress.view.unmount()
      const mix = play(MixupRound, fun, seed)
      expect(mix.ctl.prompt).toHaveBeenCalled()
      const labels = mix.view.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
      expect(labels.length).toBeGreaterThan(1)
      mix.view.unmount()
    }
  })

  function play(Round: ComponentType<RoundProps>, learned: LearnedPools, seed: number) {
    const ctl = { prompt: vi.fn(), hint: vi.fn(), say: vi.fn(), step: vi.fn(), correct: vi.fn(), wrong: vi.fn(), mood: vi.fn(), practise: vi.fn() }
    const view = render(<Round lang="ar" d={dictionaries.ar} stage={3} choices={4} maxN={10} round={seed % 2} locked={false} rng={seededRng(seed)} ctl={ctl} learned={learned} hero="E002" />)
    return { ctl, view }
  }

  it('Count & Feed never asks for more than the child has learned', () => {
    const allowed = [dictionaries.ar.games.say.countOne, dictionaries.ar.games.say.countTwo]
    for (let seed = 1; seed <= 25; seed++) {
      const { ctl, view } = play(CountRound, some, seed)
      expect(allowed).toContain(ctl.prompt.mock.calls[0]?.[0])
      view.unmount()
    }
  })

  it('letters, colours and numbers in a round all come from what was learned', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const frog = play(FrogRound, some, seed)
      expect(frog.view.getAllByRole('button').map((b) => b.getAttribute('aria-label')).filter((l) => l && l !== dictionaries.ar.games.titles.frog).sort()).toEqual(['الأَلِف', 'البَاء'].sort())
      expect(frog.ctl.practise).toHaveBeenCalledWith(expect.stringMatching(/^ar\.letter\.(alif|ba)$/))
      frog.view.unmount()
      const butterflies = play(ButterfliesRound, some, seed)
      for (const b of butterflies.view.getAllByRole('button')) expect([dictionaries.ar.colors.red, dictionaries.ar.colors.blue]).toContain(b.getAttribute('aria-label'))
      butterflies.view.unmount()
    }
    const run = learnedPools(new Set(['num.count.1', 'num.count.2', 'num.count.3']), 'ar')
    for (let seed = 1; seed <= 10; seed++) {
      const train = play(TrainRound, run, seed)
      const names = train.view.queryAllByRole('button').map((b) => b.getAttribute('aria-label'))
      for (const n of names) expect(dictionaries.ar.voice.numbers.slice(0, 3)).toContain(n)
      train.view.unmount()
    }
  })

  it('a game that needs more learning opens its Discover lesson from the hub', async () => {
    await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') })
    window.location.hash = '#/games'
    render(<App />)
    const card = await screen.findByTestId('game-count')
    await waitFor(() => expect(card).toHaveAttribute('data-ready', 'false'))
    expect(card).toHaveTextContent('اكتشف أولًا')
    await userEvent.click(card)
    expect(await screen.findAllByTestId(/^discover-/)).toHaveLength(10)
  })

  it('once 1 and 2 are discovered, Count & Feed opens and asks only for those', async () => {
    await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt') })
    await discovered('num-discover', 'one', 'num.count.1', 'numbers')
    await discovered('num-discover', 'two', 'num.count.2', 'numbers')
    window.location.hash = '#/games'
    render(<App />)
    const card = await screen.findByTestId('game-count')
    await waitFor(() => expect(card).toHaveAttribute('data-ready', 'true'))
    await userEvent.click(card)
    const sign = await screen.findByTestId('game-done')
    expect(sign).toBeInTheDocument()
    expect(['١', '٢']).toContain(document.querySelector('[class*="sign"]')?.textContent)
  })
})
