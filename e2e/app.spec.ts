import { type Page, expect, test } from '@playwright/test'
import quran from '../content/quran/surahs.json' with { type: 'json' }

/** First-run setup as a parent would do it (Arabic UI, both languages, PIN 1357). */
async function onboard(page: Page, nickname = 'Mimi') {
  await page.goto('./')
  await page.getByRole('button', { name: 'هَيَّا', exact: true }).click()
  await page.getByRole('button', { name: /التالي/ }).click()
  await page.getByLabel(/اسم الدلع/).fill(nickname)
  await page.getByRole('button', { name: /التالي/ }).click()
  const pins = page.getByLabel(/رمز/)
  await pins.nth(0).fill('1357')
  await pins.nth(1).fill('1357')
  await page.getByRole('button', { name: /إنهاء/ }).click()
  await expect(page.getByText(new RegExp(`(صباح|مساء) الخير يا ${nickname}!`))).toBeVisible()
}

/** Record Discover lesson items as finished, straight in the app's local database (what the child "learned"). */
async function discovered(page: Page, items: { activityId: string; itemId: string; skill: string; areaId: string }[]) {
  await page.evaluate(
    (rows) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('rawda')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('attempts', 'readwrite')
          for (const r of rows) tx.objectStore('attempts').add({ ...r, lang: 'ar', firstTry: true, misses: 0, hintsUsed: 0, durationMs: 1000, ts: Date.now() })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    items,
  )
}

/** Play an activity to the end by always choosing the right answer. */
async function playThrough(page: Page, activityId: string) {
  await page.goto(`./#/play/${activityId}`)
  await page.getByRole('button', { name: /ابدأ|Start/ }).click()
  for (let i = 0; i < 12; i++) {
    const answer = page.getByTestId('choice-answer').first()
    // The end of an activity: the celebration, or a movement break shown before it.
    const done = page.getByRole('heading', { name: /أحسنتم|Well done|وقت الراحة/ }).or(page.getByRole('dialog', { name: /وَقْتُ|Movement|Calm/ }))
    await expect(answer.or(done)).toBeVisible({ timeout: 15_000 })
    if (await done.isVisible()) return
    await answer.click()
    const badge = page.locator('[class*="checkBadge"]')
    await expect(badge.first()).toBeVisible()
    // Wait for the celebration to finish and the next task (or the end screen) to appear.
    await expect(badge).toHaveCount(0, { timeout: 15_000 })
  }
  await expect(page.getByRole('heading', { name: /أحسنتم|Well done/ }).or(page.getByRole('dialog', { name: /وَقْتُ|Movement|Calm/ }))).toBeVisible()
}

test('first launch → setup → home in Arabic RTL', async ({ page }) => {
  await onboard(page)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', { name: /الحروف والأصوات/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /الأرقام والعدّ/ })).toBeVisible()
})

test('a child can finish an activity; progress and stickers survive a restart', async ({ page }) => {
  await onboard(page)
  await playThrough(page, 'colors')
  await expect(page.getByText('ملصق جديد!').first()).toBeVisible()
  await page.reload()
  await page.goto('./#/rewards')
  await expect(page.getByRole('button', { name: /لوحة ألوان/ })).toBeVisible()
  await page.goto('./#/map/colors-shapes')
  await expect(page.getByRole('button', { name: /أنجزناه/ })).toBeVisible()
})

test('wrong answers get gentle feedback and the task stays playable', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/colors')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  const wrong = page.getByTestId('choice-other').first()
  await wrong.click()
  await expect(wrong).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByTestId('choice-answer')).toBeEnabled()
})

test('works offline after the first visit (cold start in airplane mode)', async ({ page, context }) => {
  await onboard(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload() // now controlled by the service worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.goto('./#/home')
  await page.reload()
  await expect(page.getByText(/(صباح|مساء) الخير يا Mimi!/)).toBeVisible()
  await page.goto('./#/play/count-objects')
  await expect(page.getByRole('button', { name: /ابدأ/ })).toBeVisible()
  // Illustrations come from the offline cache too.
  const img = page.locator('img').first()
  await expect(img).toHaveJSProperty('complete', true)
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
  await context.setOffline(false)
})

test('English mode renders left-to-right', async ({ page }) => {
  await onboard(page)
  // Change language through the gated parent area.
  await page.goto('./#/parent')
  const hold = page.getByRole('button', { name: /اضغط باستمرار/ })
  await hold.hover()
  await page.mouse.down()
  await page.waitForTimeout(3300)
  await page.mouse.up()
  await page.getByLabel(/الرمز السري/).fill('1357')
  await page.getByRole('button', { name: /تأكيد/ }).click()
  await page.getByRole('tab', { name: 'الإعدادات' }).click()
  await page.getByRole('radio', { name: 'English' }).first().click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.goto('./#/home')
  await expect(page.getByRole('button', { name: /Letters & sounds/ })).toBeVisible()
})

test('parent area is gated (wrong PIN is refused)', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/parent/data')
  await expect(page.getByText('للكبار فقط')).toBeVisible()
  await expect(page.getByText('حذف كل البيانات')).toHaveCount(0)
  const hold = page.getByRole('button', { name: /اضغط باستمرار/ })
  await hold.hover()
  await page.mouse.down()
  await page.waitForTimeout(800) // a short tap is not enough
  await page.mouse.up()
  await expect(page.getByLabel(/الرمز السري/)).toHaveCount(0)
  await page.mouse.down()
  await page.waitForTimeout(3300)
  await page.mouse.up()
  await page.getByLabel(/الرمز السري/).fill('0000')
  await page.getByRole('button', { name: /تأكيد/ }).click()
  await expect(page.getByText('الرمز غير صحيح.')).toBeVisible()
})

test('drawings are saved locally and survive a restart', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/studio')
  const canvas = page.locator('canvas')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 80, box.y + 80)
  await page.mouse.down()
  await page.mouse.move(box.x + 260, box.y + 200, { steps: 10 })
  await page.mouse.up()
  await page.getByRole('button', { name: /حفظ/ }).click()
  await expect(page.getByRole('status')).toBeVisible()
  await page.reload()
  await page.goto('./#/studio/gallery')
  await expect(page.locator('img[src^="data:image/png"]')).toHaveCount(1)
})

test('Quran: verified text is shown and the recitation plays', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/map/islamic')
  await page.getByRole('button', { name: 'القرآن الكريم' }).click()
  await page.getByRole('button', { name: /الإخلاص/ }).click()
  // Quranic text is never typed by hand — even in tests it comes from the verified data file.
  const ikhlas = quran.surahs.find((s) => s.number === 112)!
  await expect(page.getByRole('button', { name: quran.basmala.text, exact: true })).toBeVisible()
  for (const a of ikhlas.ayahs) await expect(page.getByRole('button', { name: a.text })).toBeVisible()
  await page.getByRole('button', { name: ikhlas.ayahs[0]!.text }).click()
  await expect(page.locator('[aria-current="true"]')).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0) // no "could not play" message
})

test('switching off Islamic learning hides the whole area', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/parent')
  await page.getByRole('button', { name: /اضغط باستمرار/ }).hover()
  await page.mouse.down()
  await page.waitForTimeout(3300)
  await page.mouse.up()
  await page.getByLabel(/الرمز السري/).fill('1357')
  await page.getByRole('button', { name: /تأكيد/ }).click()
  await page.getByRole('tab', { name: 'المواد' }).click()
  await page.getByRole('switch', { name: 'القرآن والتربية الإسلامية' }).click()
  await page.goto('./#/home')
  await expect(page.getByRole('button', { name: /الحروف والأصوات/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /القرآن والتربية الإسلامية/ })).toHaveCount(0)
  await page.goto('./#/quran/112')
  await expect(page.getByRole('button', { name: quran.surahs.find((s) => s.number === 112)!.ayahs[0]!.text })).toHaveCount(0)
})

test('tracing: drawing over the letter fills the progress bar', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/ar-trace') // Arabic mode shows Arabic activities only
  await page.getByRole('button', { name: /ابدأ|Start/ }).click()
  const box = (await page.locator('canvas').last().boundingBox())!
  for (let row = 0.2; row <= 0.8; row += 0.06) {
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * row)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * row, { steps: 12 })
    await page.mouse.up()
  }
  // Either the letter was completed (the activity moved on to task 2) or the bar is well filled.
  const advanced = (await page.getByRole('progressbar', { name: /2/ }).count()) > 0
  const value = Number((await page.getByRole('progressbar').last().getAttribute('aria-valuenow')) ?? 0)
  expect(advanced || value > 30).toBe(true)
})

test('learning journey: Continue starts a Discover lesson that teaches before it checks, then moves on to practice', async ({ page }) => {
  await onboard(page)
  await page.getByRole('button', { name: /نُكْمِل/ }).click()
  await expect(page.getByRole('heading', { name: 'نَكْتَشِفُ حَرْفًا جَدِيدًا' })).toBeVisible()
  await page.getByRole('button', { name: /ابدأ/ }).click()
  // meet → words: no question is asked yet
  await expect(page.getByTestId('choice-answer')).toHaveCount(0)
  await page.getByTestId('lesson-next').click({ timeout: 15_000 })
  await page.getByTestId('lesson-next').click({ timeout: 15_000 })
  // trace (alif): asking for help twice offers the motor-friendly ✓
  await page.getByRole('button', { name: 'مساعدة' }).click()
  await page.getByRole('button', { name: 'مساعدة' }).click()
  await page.getByTestId('choice-answer').click()
  // gentle check, then the celebration
  await page.getByTestId('choice-answer').click({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: /أحسنتم/ })).toBeVisible({ timeout: 15_000 })
  // Continue now suggests practising (not another lesson straight away)
  await page.goto('./#/home')
  await page.getByRole('button', { name: /نُكْمِل/ }).click()
  await expect(page.getByRole('heading', { name: 'أَيْنَ الْحَرْفُ؟' })).toBeVisible()
})

test('alphabet board: all 28 letters, pick any one, learn it, and it gets a ✓', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/map/letters')
  await page.getByRole('button', { name: /نَكْتَشِفُ حَرْفًا جَدِيدًا/ }).click()
  await expect(page.getByTestId(/^discover-/)).toHaveCount(28)
  await page.getByTestId('discover-mim').click()
  await page.getByRole('button', { name: /ابدأ/ }).click()
  await expect(page.getByRole('button', { name: /حَرْفُ الْمِيمِ يَقُولُ/ })).toBeVisible()
  await page.getByTestId('lesson-next').click({ timeout: 15_000 }) // meet → words
  await page.getByTestId('lesson-next').click({ timeout: 20_000 }) // words → trace
  await page.getByRole('button', { name: 'مساعدة' }).click()
  await page.getByRole('button', { name: 'مساعدة' }).click()
  await page.getByTestId('choice-answer').click() // trace ✓
  await page.getByTestId('choice-answer').click({ timeout: 15_000 }) // gentle check
  await expect(page.getByRole('heading', { name: /أحسنتم/ })).toBeVisible({ timeout: 15_000 })
  await page.goto('./#/discover/ar-discover')
  await expect(page.getByTestId('discover-mim')).toHaveAccessibleName(/تعلّمناه/)
})

test('one language at a time: the ع / A switch changes the screen and the content', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/map/letters')
  await expect(page.getByRole('button', { name: /أَيْنَ الْحَرْفُ؟/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Find the letter/ })).toHaveCount(0)
  await page.goto('./#/home')
  await page.getByRole('button', { name: 'English' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.goto('./#/map/letters')
  await expect(page.getByRole('button', { name: /Find the letter/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /أَيْنَ الْحَرْفُ؟/ })).toHaveCount(0)
  await page.goto('./#/stories')
  await expect(page.getByRole('heading', { name: 'Lulu Shares' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'لُولُو تُشَارِكُ' })).toHaveCount(0)
})

test('safe exit: ✕ asks first, "keep playing" returns to the same task', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/colors')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  await page.getByRole('button', { name: 'خروج' }).click()
  await expect(page.getByRole('dialog', { name: 'هل نتوقف الآن؟' })).toBeVisible()
  await page.getByRole('button', { name: 'نكمل اللعب' }).click()
  await expect(page.getByTestId('choice-answer')).toBeVisible()
  await page.getByRole('button', { name: 'خروج' }).click()
  await page.getByRole('button', { name: 'نتوقف' }).click()
  await expect(page).toHaveURL(/#\/map\/colors-shapes/)
})

test('a movement break appears after a few activities and waits for "Done"', async ({ page }) => {
  await onboard(page)
  await playThrough(page, 'colors')
  await playThrough(page, 'shapes')
  await playThrough(page, 'day-night') // 3rd finished activity: default age 4–5 → a break every 3
  await expect(page.getByRole('dialog', { name: /وَقْتُ/ })).toBeVisible()
  await page.getByRole('button', { name: 'تمّ' }).click()
  await expect(page.getByRole('heading', { name: /أحسنتم/ })).toBeVisible()
})

test('voice off: press-and-hold silences Hala and a grown-up reads the big on-screen text', async ({ page }) => {
  await onboard(page)
  const toggle = page.getByTestId('voice-toggle')
  await toggle.click() // a quick tap (a curious child) changes nothing…
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status').filter({ hasText: 'اضغط باستمرار' })).toBeVisible() // …but explains itself (no hover on phones)
  await toggle.hover()
  await page.mouse.down()
  await page.waitForTimeout(1500)
  await page.mouse.up()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.reload() // remembered
  await expect(page.getByTestId('voice-toggle')).toHaveAttribute('aria-pressed', 'true')

  await page.goto('./#/play/colors')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  await expect(page.getByTestId('read-aloud')).toBeVisible()
  await expect(page.getByTestId('read-aloud')).not.toBeEmpty()
  await expect(page.getByRole('button', { name: 'استمع مرة أخرى' })).toHaveCount(0)
  await expect(page.getByTestId('voice-toggle')).toBeVisible()
})

test('sorting game: drag pictures into baskets with a real finger-style drag', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/sort-groups')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  // Whichever round comes up, drag every picture into its basket (the testid names the right basket).
  for (let n = 0; n < 8; n++) {
    const thing = page.locator('[data-testid^="thing-"]').first()
    if (!(await thing.isVisible().catch(() => false))) break
    const bin = (await thing.getAttribute('data-testid'))!.replace('thing-', 'bin-')
    await thing.dragTo(page.getByTestId(bin))
    await page.waitForTimeout(150)
  }
  await expect(page.locator('[class*="checkBadge"], [class*="stoneDone"]').first()).toBeVisible({ timeout: 10_000 })
})

test('finger paths: a pre-writing stroke with a green start dot can be traced', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/finger-paths')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  const canvas = page.getByTestId('trace-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.locator('circle[class*="startDot"]')).toBeVisible()
  const box = (await canvas.boundingBox())!
  // Scribble across the whole box: covers any stroke generously.
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  for (let y = 10; y < box.height; y += 18) {
    await page.mouse.move(box.x + 10, box.y + y, { steps: 2 })
    await page.mouse.move(box.x + box.width - 10, box.y + y, { steps: 6 })
  }
  await page.mouse.up()
  await expect(page.locator('[class*="stoneDone"]').first()).toBeVisible({ timeout: 10_000 })
})

test('"Say it!" works without a microphone and shows up in the four-pillar dashboard', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/ar-say-words')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  await expect(page.getByTestId('speak-word')).toBeVisible()
  await expect(page.getByTestId('speak-mic')).toHaveCount(0) // microphone is parent opt-in
  await page.getByTestId('choice-answer').click()
  await expect(page.locator('[class*="stoneDone"]').first()).toBeVisible({ timeout: 10_000 })
  // Parent dashboard
  await page.goto('./#/parent')
  await page.getByRole('button', { name: /اضغط باستمرار/ }).hover()
  await page.mouse.down()
  await page.waitForTimeout(3300)
  await page.mouse.up()
  await page.getByLabel(/الرمز السري/).fill('1357')
  await page.getByRole('button', { name: /تأكيد/ }).click()
  const dash = page.getByTestId('pillar-dashboard')
  await expect(dash).toBeVisible()
  await expect(dash.getByTestId('pillar-speech')).toContainText('1')
  await expect(dash.getByTestId('pillar-creativity')).toContainText('لم يبدأ بعد')
})

test('phone layout has no horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await onboard(page)
  for (const route of ['#/home', '#/map/letters', '#/play/ar-find-letter', '#/stories', '#/rewards']) {
    await page.goto(`./${route}`)
    await page.waitForTimeout(300)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, route).toBeLessThanOrEqual(1)
  }
})

test('Play World: finishing a game celebrates, saves the stars and grows Hala’s garden', async ({ page }) => {
  await onboard(page)
  await page.getByTestId('play-world').click()
  // Before the idea is discovered, the card invites the child to learn it first.
  await expect(page.getByTestId('game-odd')).toHaveAttribute('data-ready', 'false')
  await discovered(page, [{ activityId: 'logic-discover', itemId: 'odd', skill: 'logic.odd', areaId: 'logic' }])
  await page.reload()
  await expect(page.getByTestId('game-odd')).toHaveAttribute('data-ready', 'true')
  await page.getByTestId('game-odd').click()
  for (let i = 0; i < 6; i++) {
    const done = page.getByRole('heading', { name: 'أحسنت!' })
    const answer = page.getByTestId('game-answer')
    await expect(answer.or(done)).toBeVisible({ timeout: 15_000 })
    if (await done.isVisible()) break
    const handle = await answer.elementHandle()
    await answer.click()
    // The next round replaces this one once Hala's praise is over.
    await page.waitForFunction((el) => !el?.isConnected, handle, { timeout: 15_000 })
  }
  await expect(page.getByRole('heading', { name: 'أحسنت!' })).toBeVisible()
  await page.getByRole('button', { name: /اذهب إلى الحديقة/ }).click()
  await expect(page.getByRole('group', { name: 'حديقة هالة' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /زَهْرَة التُّولِيب/ })).toBeVisible()
})

test('Hungry Frog: a real finger drag feeds the frog', async ({ page }) => {
  await onboard(page)
  await discovered(page, [
    { activityId: 'ar-discover', itemId: 'alif', skill: 'ar.letter.alif', areaId: 'letters' },
    { activityId: 'ar-discover', itemId: 'ba', skill: 'ar.letter.ba', areaId: 'letters' },
  ])
  await page.goto('./#/games/frog')
  const fly = page.getByTestId('game-answer')
  await expect(fly).toBeVisible()
  const from = (await fly.boundingBox())!
  const to = (await page.locator('[data-drop="frog"]').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('[class*="stoneOn"]')).toHaveCount(1, { timeout: 10_000 })
})

test('map area chips all fit on screen without sideways scrolling', async ({ page }) => {
  await onboard(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./#/map/numbers')
  const nav = page.getByRole('navigation', { name: 'طريق التعلّم' })
  await expect(nav).toBeVisible()
  const overflow = await nav.evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('Discover first in every section: colours are discovered on a board, then practice asks only what was learned', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/map/colors-shapes')
  await page.getByRole('button', { name: /نَكْتَشِفُ الْأَلْوَانَ/ }).click()
  await expect(page.getByTestId(/^discover-/)).toHaveCount(10)
  for (const color of ['red', 'blue']) {
    await page.goto('./#/discover/colors-discover')
    await page.getByTestId(`discover-${color}`).click()
    await page.getByRole('button', { name: /ابدأ/ }).click()
    await expect(page.getByTestId('choice-answer')).toHaveCount(0) // meet first: no question yet
    await page.getByTestId('lesson-next').click({ timeout: 15_000 }) // meet → things of that colour
    await page.getByTestId('lesson-next').click({ timeout: 20_000 }) // → gentle check
    await page.getByTestId('choice-answer').click({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /أحسنتم/ })).toBeVisible({ timeout: 15_000 })
  }
  await page.goto('./#/discover/colors-discover')
  await expect(page.getByTestId('discover-red')).toHaveAccessibleName(/تعلّمناه/)
  // Practice now only asks about the two colours the child discovered.
  await page.goto('./#/play/colors')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  for (let i = 0; i < 3; i++) {
    const answer = page.getByTestId('choice-answer').first()
    await expect(answer).toBeVisible({ timeout: 15_000 })
    await expect(answer).toHaveAccessibleName(/أَحْمَر|أَزْرَق/)
    await answer.click()
    await expect(page.locator('[class*="checkBadge"]')).toHaveCount(0, { timeout: 15_000 })
  }
})

test('every section has its own Discover board with Hala asking the right question', async ({ page }) => {
  await onboard(page)
  for (const [id, question] of [
    ['shapes-discover', 'أَيَّ شَكْلٍ نَكْتَشِفُ الْيَوْمَ؟'],
    ['islamic-discover', 'مَاذَا نَتَعَلَّمُ الْيَوْمَ عَنْ دِينِنَا؟'],
    ['science-discover', 'مَاذَا نَكْتَشِفُ الْيَوْمَ فِي عَالَمِنَا؟'],
    ['logic-discover', 'أَيَّ فِكْرَةٍ نَتَعَلَّمُ الْيَوْمَ؟'],
    ['num-discover', 'أَيَّ رَقْمٍ نَتَعَلَّمُ الْيَوْمَ؟'],
  ]) {
    await page.goto(`./#/discover/${id}`)
    await expect(page.getByText(question!)).toBeVisible()
  }
  await expect(page.getByTestId(/^discover-/)).toHaveCount(10) // numbers 1 to 10
})

test('games use only what was learned: after discovering 1 and 2, Count & Feed asks for 1 or 2', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/games')
  await page.getByTestId('game-count').click()
  // Not learned yet → Hala opens the numbers Discover board instead.
  await expect(page.getByTestId(/^discover-/)).toHaveCount(10)
  await discovered(page, [
    { activityId: 'num-discover', itemId: 'one', skill: 'num.count.1', areaId: 'numbers' },
    { activityId: 'num-discover', itemId: 'two', skill: 'num.count.2', areaId: 'numbers' },
  ])
  for (let i = 0; i < 3; i++) {
    await page.goto('./#/home')
    await page.goto('./#/games/count')
    const sign = page.locator('[class*="_sign_"]')
    await expect(sign).toBeVisible()
    expect(['١', '٢']).toContain(await sign.textContent())
  }
})
