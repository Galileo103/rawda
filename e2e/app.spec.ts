import { type Page, expect, test } from '@playwright/test'
import { writeEntryForGlyph } from '../src/content/writing'
import { letterStrokes } from '../src/features/writing/paths'
import quran from '../content/quran/surahs.json' with { type: 'json' }

/** First-run setup as a parent would do it (Arabic UI, both languages, boy or girl, PIN 1357). */
async function onboard(page: Page, nickname = 'Mimi', gender: 'm' | 'f' = 'm') {
  await page.goto('./')
  await page.getByRole('button', { name: 'هَيَّا', exact: true }).click()
  await page.getByRole('button', { name: /التالي/ }).click()
  await page.getByTestId(`gender-${gender}`).click()
  await page.getByTestId('name-ar').fill(nickname)
  await page.getByTestId('name-en').fill(nickname)
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
  // Hiding asks first (progress is kept)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByTestId('hide-subject-confirm').click()
  await expect(page.getByRole('switch', { name: 'القرآن والتربية الإسلامية' })).toHaveAttribute('aria-checked', 'false')
  await page.goto('./#/home')
  await expect(page.getByRole('button', { name: /الحروف والأصوات/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /القرآن والتربية الإسلامية/ })).toHaveCount(0)
  await page.goto('./#/quran/112')
  await expect(page.getByRole('button', { name: quran.surahs.find((s) => s.number === 112)!.ayahs[0]!.text })).toHaveCount(0)
})

test('parent progress tells the truth after one activity, and all tabs fit on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await onboard(page)
  await playThrough(page, 'colors')
  await page.goto('./#/parent')
  await page.getByRole('button', { name: /اضغط باستمرار/ }).hover()
  await page.mouse.down()
  await page.waitForTimeout(3300)
  await page.mouse.up()
  await page.getByLabel(/الرمز السري/).fill('1357')
  await page.getByRole('button', { name: /تأكيد/ }).click()
  // Today names what was practised; the 14-day chart shows that day too
  const today = page.getByTestId('today-card')
  await expect(today).toContainText('الألوان والأشكال')
  await expect(today).toBeInViewport()
  await expect(page.getByTestId('activity-chart')).toBeVisible()
  // All five tabs are visible at once (no hidden sideways scrolling)
  for (const tab of await page.getByRole('tab').all()) await expect(tab).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true)
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

test('voice off: Hala starts silent, press-and-hold switches her, and a grown-up reads the big on-screen text', async ({ page }) => {
  await onboard(page)
  const toggle = page.getByTestId('voice-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true') // off by default
  await toggle.click() // a quick tap (a curious child) changes nothing…
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'اضغط باستمرار' })).toBeVisible() // …but explains itself (no hover on phones)
  const hold = async () => {
    await toggle.hover()
    await page.mouse.down()
    await page.waitForTimeout(1500)
    await page.mouse.up()
  }
  await hold()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false') // voice on
  await page.reload() // remembered
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await hold()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true') // silent again

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

/** Move a finger along board points (600×600) of the dotted-path canvas. */
async function drawAlong(page: Page, pts: { x: number; y: number }[]) {
  const box = (await page.getByTestId('path-canvas').boundingBox())!
  const k = box.width / 600
  await page.mouse.move(box.x + pts[0]!.x * k, box.y + pts[0]!.y * k)
  await page.mouse.down()
  for (let i = 3; i < pts.length; i += 3) await page.mouse.move(box.x + pts[i]!.x * k, box.y + pts[i]!.y * k)
  await page.mouse.move(box.x + pts[pts.length - 1]!.x * k, box.y + pts[pts.length - 1]!.y * k)
  await page.mouse.up()
}

test('tracing a letter in an activity: written stroke by stroke in order, then it shines before moving on', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/ar-trace')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  const canvas = page.getByTestId('path-canvas')
  await expect(canvas).toBeVisible()
  const glyph = (await canvas.getAttribute('aria-label'))!
  const entry = writeEntryForGlyph(glyph, 'ar')!
  const strokes = letterStrokes(entry.id, 600)
  await expect(canvas).toHaveAttribute('data-phase', 'play', { timeout: 15_000 })
  // Every stroke but the end of the last one: not finished, nothing moves on.
  const box = (await canvas.boundingBox())!
  const tap = (pt: { x: number; y: number }) => page.mouse.click(box.x + (pt.x * box.width) / 600, box.y + (pt.y * box.width) / 600)
  for (const [i, st] of strokes.entries()) {
    const lastOne = i === strokes.length - 1
    if (st.dot) {
      if (!lastOne) await tap(st.pts[0]!)
      continue
    }
    await drawAlong(page, lastOne ? st.pts.slice(0, Math.floor(st.pts.length * 0.7)) : st.pts)
  }
  await page.waitForTimeout(400)
  await expect(canvas).toHaveAttribute('data-phase', 'play')
  // Finish it: the letter shines gold for a moment, then the activity moves on.
  const last = strokes[strokes.length - 1]!
  if (last.dot) await tap(last.pts[0]!)
  else await drawAlong(page, last.pts.slice(Math.floor(last.pts.length * 0.7) - 2))
  await expect(canvas).toHaveAttribute('data-phase', 'won')
  await page.waitForTimeout(1000)
  await expect(canvas).toHaveAttribute('data-phase', 'won')
  await expect(page.locator('[data-testid="path-canvas"][data-phase="won"]')).toHaveCount(0, { timeout: 10_000 })
})

test('Writing room: colour a letter inside its magic walls, then it celebrates and earns a star', async ({ page }) => {
  await onboard(page)
  await page.getByTestId('writing-room').click()
  await expect(page.getByTestId('write-set-arForms')).toBeVisible()
  await page.getByTestId('write-ar-ba').click()
  const canvas = page.getByTestId('write-canvas')
  await expect(canvas).toBeVisible()
  await page.waitForTimeout(500)
  const box = (await canvas.boundingBox())!
  // One stroke across the middle, going out of the letter on both sides: not finished.
  await page.mouse.move(box.x + 30, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 30, box.y + box.height * 0.5, { steps: 20 })
  await page.mouse.up()
  expect(Number(await canvas.getAttribute('data-progress'))).toBeLessThan(60)
  await expect(page.getByTestId('write-next')).toHaveCount(0)
  // Now colour the whole box: the walls keep the paint in the letter, and it's done.
  await page.getByTestId('brush-rainbow').click()
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.down()
  for (let y = 30; y < box.height - 20; y += 14) {
    await page.mouse.move(box.x + 30, box.y + y, { steps: 2 })
    await page.mouse.move(box.x + box.width - 30, box.y + y, { steps: 12 })
  }
  await page.mouse.up()
  await expect(page.getByTestId('write-next')).toBeVisible()
  await expect(page.getByRole('status')).toBeVisible() // saved to "My drawings"
  await page.getByRole('button', { name: /كل الحروف/ }).first().click()
  await expect(page.getByTestId('write-ar-ba').locator('[class*="tileStar"]')).toBeVisible()
  await expect(page.getByTestId('write-ar-ta').locator('[class*="tileStar"]')).toHaveCount(0)
})

test('Writing room: after colouring, write the letter along its dotted path, in order and direction', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/write/ar-ba')
  await expect(page.getByTestId('mode-path')).toBeVisible()
  await page.getByTestId('mode-path').click()
  const canvas = page.getByTestId('path-canvas')
  // Hala's pen shows it first, then it's the child's turn.
  await expect(canvas).toHaveAttribute('data-phase', 'demo')
  await expect(canvas).toHaveAttribute('data-phase', 'play', { timeout: 15_000 })
  await expect(page.getByTestId('path-start')).toBeVisible()
  const [body, dot] = letterStrokes('ar-ba', 600)
  // Backwards, or half and lift: the stroke is not done yet.
  await drawAlong(page, [...body!.pts].reverse())
  await expect(canvas).toHaveAttribute('data-stroke', '0')
  const half = Math.floor(body!.pts.length / 2)
  await drawAlong(page, body!.pts.slice(0, half))
  await expect(canvas).toHaveAttribute('data-stroke', '0')
  // Carry on from where the finger stopped: the body is done, now the dot.
  await drawAlong(page, body!.pts.slice(half - 2))
  await expect(canvas).toHaveAttribute('data-stroke', '1')
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + (dot!.pts[0]!.x * box.width) / 600, box.y + (dot!.pts[0]!.y * box.width) / 600)
  await expect(canvas).toHaveAttribute('data-phase', 'won')
  await expect(page.getByTestId('write-next')).toBeVisible()
  await page.goto('./#/write')
  await expect(page.getByTestId('write-ar-ba').locator('[class*="tileStar"] svg')).toHaveCount(1)
})

test('Writing room "by myself": three rounds with less and less help, then she writes it alone', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/write/ar-ba?mode=fade')
  const canvas = page.getByTestId('path-canvas')
  const [body, dot] = letterStrokes('ar-ba', 600)
  const write = async (offset: number) => {
    await expect(canvas).toHaveAttribute('data-phase', 'play')
    // Round 3 is checked loosely: a hand that wobbles a little off the shape still counts.
    await drawAlong(
      page,
      body!.pts.map((p) => ({ x: p.x, y: p.y + offset })),
    )
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + (dot!.pts[0]!.x * box.width) / 600, box.y + (dot!.pts[0]!.y * box.width) / 600)
    await expect(canvas).toHaveAttribute('data-phase', 'won')
  }
  for (const level of [1, 2, 3]) {
    await expect(canvas).toHaveAttribute('data-level', String(level), { timeout: 10_000 })
    await page.screenshot({ path: `test-results/fade-${level}.png` })
    await write(level === 3 ? 22 : 0)
  }
  await expect(page.getByTestId('write-next')).toBeVisible()
  await page.goto('./#/write')
  await expect(page.getByTestId('write-ar-ba').locator('[class*="tileStar"] svg')).toHaveCount(1)
})

test('Write my name: colour the Arabic name, write the English one letter by letter, both saved', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'هَيَّا', exact: true }).click()
  await page.getByRole('button', { name: /التالي/ }).click()
  await page.getByTestId('gender-f').click()
  await page.getByTestId('name-ar').fill('مريم')
  await page.getByTestId('name-en').fill('Mira')
  await page.getByRole('button', { name: /التالي/ }).click()
  const pins = page.getByLabel(/رمز/)
  await pins.nth(0).fill('1357')
  await pins.nth(1).fill('1357')
  await page.getByRole('button', { name: /إنهاء/ }).click()
  await page.getByTestId('writing-room').click()
  await page.getByTestId('write-set-name').click()
  await page.getByTestId('write-name-ar').click()
  // Arabic: the joined name, coloured inside its walls.
  const c = page.getByTestId('write-canvas')
  await expect(c).toHaveAttribute('data-brush', /[0-9]+/)
  const box = (await c.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.down()
  for (let y = 30; y < box.height - 20; y += 10) {
    await page.mouse.move(box.x + 30, box.y + y, { steps: 2 })
    await page.mouse.move(box.x + box.width - 30, box.y + y, { steps: 14 })
  }
  await page.mouse.up()
  await expect(page.getByRole('status')).toBeVisible() // saved to My drawings
  // English: letter by letter on the dotted-path board.
  await page.goto('./#/write/name-en')
  const pc = page.getByTestId('path-canvas')
  for (const ch of 'Mira') {
    await expect(pc).toHaveAttribute('aria-label', ch, { timeout: 10_000 })
    await expect(pc).toHaveAttribute('data-phase', 'play', { timeout: 15_000 })
    const b = (await pc.boundingBox())!
    for (const st of letterStrokes('en-' + ch, 600)) {
      if (st.dot) await page.mouse.click(b.x + (st.pts[0]!.x * b.width) / 600, b.y + (st.pts[0]!.y * b.width) / 600)
      else await drawAlong(page, st.pts)
    }
  }
  await expect(page.getByTestId('name-card')).toHaveText('Mira')
  await page.goto('./#/studio/gallery')
  await expect(page.locator('img[src^="data:image/png"]')).toHaveCount(2)
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

test('"Say it!": say the word aloud, tap "I said it!", and it shows up in the four-pillar dashboard', async ({ page }) => {
  await onboard(page)
  await page.goto('./#/play/ar-say-words')
  await page.getByRole('button', { name: /ابدأ/ }).click()
  await expect(page.getByTestId('speak-word')).toBeVisible()
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
    const done = page.getByRole('heading', { name: /^أحسنت./ })
    const answer = page.getByTestId('game-answer')
    await expect(answer.or(done)).toBeVisible({ timeout: 15_000 })
    if (await done.isVisible()) break
    const handle = await answer.elementHandle()
    await answer.click()
    // The next round replaces this one once Hala's praise is over.
    await page.waitForFunction((el) => !el?.isConnected, handle, { timeout: 15_000 })
  }
  await expect(page.getByRole('heading', { name: /^أحسنت./ })).toBeVisible()
  await page.getByRole('button', { name: /اذهب إلى الحديقة/ }).click()
  await expect(page.getByRole('group', { name: 'حديقة هالة' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /زَهْرَة التُّولِيب/ })).toBeVisible()
})

test('Jumping Frog: a real finger drag hops the frog onto the right lily pad', async ({ page }) => {
  await onboard(page)
  await discovered(page, [
    { activityId: 'ar-discover', itemId: 'alif', skill: 'ar.letter.alif', areaId: 'letters' },
    { activityId: 'ar-discover', itemId: 'ba', skill: 'ar.letter.ba', areaId: 'letters' },
  ])
  await page.goto('./#/games/frog')
  const pad = page.getByTestId('game-answer')
  await expect(pad).toBeVisible()
  const from = (await page.getByRole('button', { name: 'الضفدع القافز' }).boundingBox())!
  const to = (await pad.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect(page.locator('[class*="stoneOn"]')).toHaveCount(1, { timeout: 10_000 })
})

/** Play a Play World game to the end by always choosing the right thing. */
async function playGame(page: Page, gameId: string) {
  await page.goto(`./#/games/${gameId}`)
  const done = page.getByRole('heading', { name: /^أحسنت./ })
  for (let i = 0; i < 14; i++) {
    const answer = page.getByTestId('game-answer')
    await expect(answer.or(done)).toBeVisible({ timeout: 20_000 })
    if (await done.isVisible()) break
    const handle = await answer.elementHandle()
    await answer.click()
    // Either the round moves on (Hala's praise first) or the next step of the same round appears.
    await page.waitForFunction((el) => !el?.isConnected, handle, { timeout: 20_000 })
  }
  await expect(done).toBeVisible()
}

test('the silly games play to the end with only what was discovered', async ({ page }) => {
  test.setTimeout(240_000)
  await onboard(page)
  await discovered(page, [
    { activityId: 'ar-discover', itemId: 'alif', skill: 'ar.letter.alif', areaId: 'letters' },
    { activityId: 'ar-discover', itemId: 'ba', skill: 'ar.letter.ba', areaId: 'letters' },
    { activityId: 'ar-discover', itemId: 'ta', skill: 'ar.letter.ta', areaId: 'letters' },
    { activityId: 'science-discover', itemId: 'rain', skill: 'sci.weather.rain', areaId: 'science' },
    { activityId: 'science-discover', itemId: 'sea', skill: 'sci.habitat.fish', areaId: 'science' },
    { activityId: 'science-discover', itemId: 'desert', skill: 'sci.habitat.camel', areaId: 'science' },
    { activityId: 'science-discover', itemId: 'food-monkey', skill: 'sci.food.monkey', areaId: 'science' },
  ])
  await page.goto('./#/games')
  for (const id of ['silly', 'monster', 'dress', 'mixup']) await expect(page.getByTestId(`game-${id}`)).toHaveAttribute('data-ready', 'true')
  for (const id of ['silly', 'monster', 'dress', 'mixup']) await playGame(page, id)
})

test('the Remember Box brings back what is due, once a day, with stars', async ({ page }) => {
  await onboard(page)
  await discovered(page, [
    { activityId: 'ar-discover', itemId: 'ba', skill: 'ar.letter.ba', areaId: 'letters' },
    { activityId: 'num-discover', itemId: 'three', skill: 'num.count.3', areaId: 'numbers' },
  ])
  // Learned three days ago and due again today (the spaced-review schedule).
  await page.evaluate(
    (skills) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('rawda')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('mastery', 'readwrite')
          const day = 86_400_000
          for (const skillId of skills)
            tx.objectStore('mastery').put({ key: `${skillId}|ar`, skillId, lang: 'ar', score: 0.4, box: 2, attempts: 2, firstTryCorrect: 1, lastSeen: Date.now() - 3 * day, dueAt: Date.now() - day })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    ['ar.letter.ba', 'num.count.3'],
  )
  await page.reload()
  await page.getByTestId('remember-box').click()
  await page.getByTestId('remember-open').click()
  for (let i = 0; i < 2; i++) {
    const answer = page.getByTestId('remember-answer')
    await expect(answer).toBeVisible()
    const handle = await answer.elementHandle()
    await answer.click()
    await page.waitForFunction((el) => !el?.isConnected, handle, { timeout: 10_000 })
  }
  await expect(page.getByTestId('remember-done')).toBeVisible()
  await page.goto('./#/home')
  await expect(page.getByTestId('play-world')).toBeVisible()
  await expect(page.getByTestId('remember-box')).toHaveCount(0)
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

test('personalized story: the child is the hero, in her or his form', async ({ page }) => {
  await onboard(page, 'مريم', 'f')
  await page.goto('./#/stories')
  // Stories starring the child come first.
  await expect(page.getByRole('heading', { level: 2 }).first()).toHaveText('مريم وَالْأَلْوَانُ')
  await page.goto('./#/stories/hero-colors?lang=ar&page=1')
  await expect(page.getByText(/مريم تَرَى/)).toBeVisible()
  await expect(page.locator('img[src*="art/E002"]')).toBeVisible()

  // A grown-up changes it to a boy: the same page now says يَرَى and shows the boy.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('rawda')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('profile', 'readwrite')
          const store = tx.objectStore('profile')
          const get = store.get('main')
          get.onsuccess = () => store.put({ ...get.result, gender: 'm', nameAr: 'يوسف' })
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
  )
  await page.reload()
  await expect(page.getByText(/يوسف يَرَى/)).toBeVisible()
  await expect(page.locator('img[src*="art/E001"]')).toBeVisible()
})
