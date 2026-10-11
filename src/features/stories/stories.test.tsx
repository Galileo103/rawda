import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { content } from '../../content/loader'
import { resolveGender } from '../../domain/child'
import { db } from '../../services/db'
import { audio } from '../../services/audio/AudioService'
import { hashPin } from '../../services/parentGate'
import { updateProfile, updateSettings } from '../../services/repos/settings'

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.location.hash = '#/'
  vi.restoreAllMocks()
})

async function onboard(over: Parameters<typeof updateSettings>[0] = {}) {
  await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt'), ...over })
}

describe('dialogic reading prompts (content)', () => {
  it('every page of every story has a short question for the grown-up, in both languages and for boys and girls', () => {
    expect(content.stories.length).toBeGreaterThanOrEqual(6)
    for (const def of content.stories) {
      for (const gender of ['m', 'f', undefined] as const) {
        const story = resolveGender(def, gender)
        story.pages.forEach((p, i) => {
          const where = `${def.id} page ${i} (${gender ?? 'n'})`
          expect(p.prompt, where).toBeDefined()
          for (const lang of ['ar', 'en'] as const) {
            const text = p.prompt![lang]
            expect(text.trim(), where).not.toBe('')
            expect(text, where).not.toMatch(/[{}]/)
            expect(text.split(/\s+/).length, `${where}: ${text}`).toBeLessThanOrEqual(12)
          }
          expect(p.prompt!.ar, `${where}: fully voweled`).toMatch(/[ً-ْ]/)
        })
      }
    }
  })
})

describe('dialogic reading prompts (reader)', () => {
  it('voice off: the question is always shown under the page, labelled for the grown-up', async () => {
    await onboard()
    window.location.hash = '#/stories/lulu-shares?lang=ar'
    render(<App />)
    const ask = await screen.findByTestId('ask-child')
    expect(within(ask).getByText('اسْأَلْ طِفْلَكَ')).toBeInTheDocument()
    expect(within(ask).getByText('مَاذَا تُحِبُّ الْقِطَطُ أَنْ تَفْعَلَ؟')).toBeInTheDocument()
  })

  it('voice on: the question hides behind a small button and Hala never says it', async () => {
    const speak = vi.spyOn(audio, 'speak').mockResolvedValue(undefined as never)
    await onboard({ narration: true })
    await updateProfile({ gender: 'f', nameAr: 'مريم' })
    window.location.hash = '#/stories/hero-sharing?lang=ar&page=3'
    render(<App />)
    const btn = await screen.findByRole('button', { name: 'اسْأَلْ طِفْلَكَ' })
    expect(screen.queryByTestId('ask-child')).toBeNull()
    await userEvent.click(btn)
    const ask = await screen.findByTestId('ask-child')
    expect(within(ask).getByText('هَلْ شَارَكْتِ لُعْبَتَكِ مَعَ صَدِيقٍ؟')).toBeInTheDocument()
    for (const [text] of speak.mock.calls) expect(String(text)).not.toContain('شَارَكْتِ لُعْبَتَكِ')
    // A new page starts with the question hidden again.
    await userEvent.click(screen.getByRole('button', { name: 'التالي' }))
    expect(await screen.findByRole('button', { name: 'اسْأَلْ طِفْلَكَ' })).toBeInTheDocument()
    expect(screen.queryByTestId('ask-child')).toBeNull()
  })
})
