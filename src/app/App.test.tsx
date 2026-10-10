import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../services/db'
import { hashPin } from '../services/parentGate'
import { updateProfile, updateSettings } from '../services/repos/settings'
import { App } from './App'

beforeEach(async () => {
  await db.delete()
  await db.open()
  window.location.hash = '#/'
})

async function onboard(over: Parameters<typeof updateSettings>[0] = {}) {
  await updateSettings({ onboarded: true, pinSalt: 'salt', pinHash: await hashPin('1234', 'salt'), ...over })
}

describe('app', () => {
  it('first launch: welcome screen in Arabic RTL, Start leads to the grown-up setup', async () => {
    render(<App />)
    const start = await screen.findByRole('button', { name: 'هَيَّا' })
    await waitFor(() => expect(document.documentElement.dir).toBe('rtl'))
    expect(document.documentElement.lang).toBe('ar')
    await userEvent.click(start)
    expect(await screen.findByText('أهلًا بك!')).toBeInTheDocument()
  })

  it('setup → child home with learning areas; the PIN is stored hashed', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'هَيَّا' }))
    await userEvent.click(await screen.findByRole('button', { name: /التالي/ }))
    await userEvent.type(await screen.findByLabelText(/اسم الدلع/), 'Mimi')
    await userEvent.click(screen.getByRole('button', { name: /التالي/ }))
    const [pin, again] = await screen.findAllByLabelText(/رمز/)
    await userEvent.type(pin!, '2468')
    await userEvent.type(again!, '2468')
    await userEvent.click(screen.getByRole('button', { name: /إنهاء/ }))
    expect(await screen.findByText(/(صباح|مساء) الخير يا Mimi!/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /الحروف والأصوات/ })).toBeInTheDocument()
    const s = await db.settings.get('main')
    expect(s?.pinHash).toBeTruthy()
    expect(JSON.stringify(s)).not.toContain('2468')
  })

  it('English UI renders left-to-right', async () => {
    await onboard({ uiLang: 'en', learningMode: 'en', practiceLang: 'en' })
    window.location.hash = '#/home'
    render(<App />)
    expect(await screen.findByRole('button', { name: /Letters & sounds/ })).toBeInTheDocument()
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('switching the app language flips direction without touching progress', async () => {
    await onboard()
    await updateProfile({ nickname: 'Mimi' })
    window.location.hash = '#/home'
    render(<App />)
    await screen.findByText(/(صباح|مساء) الخير يا Mimi!/)
    await updateSettings({ practiceLang: 'en' }) // the ع / A switch
    expect(await screen.findByText(/Good (morning|evening), Mimi!/)).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'))
  })

  it('one language at a time: Arabic shows only Arabic content, switching shows only English', async () => {
    await onboard({ learningMode: 'both', practiceLang: 'ar' })
    window.location.hash = '#/map/letters'
    render(<App />)
    expect(await screen.findByRole('button', { name: /أَيْنَ الْحَرْفُ؟/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Find the letter/ })).not.toBeInTheDocument()
    await updateSettings({ practiceLang: 'en' })
    expect(await screen.findByRole('button', { name: /Find the letter/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /أَيْنَ الْحَرْفُ؟/ })).not.toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.dir).toBe('ltr'))
  })

  it('Discover board shows the whole alphabet; choosing a letter opens its lesson', async () => {
    await onboard({ learningMode: 'both', practiceLang: 'ar' })
    window.location.hash = '#/discover/ar-discover'
    render(<App />)
    expect(await screen.findByTestId('discover-ya')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^discover-/)).toHaveLength(28)
    await userEvent.click(screen.getByTestId('discover-ba'))
    await userEvent.click(await screen.findByRole('button', { name: /ابدأ/ }))
    expect(await screen.findByRole('button', { name: /حَرْفُ الْبَاءِ يَقُولُ/ })).toBeInTheDocument()
  })

  it('parent area is gated', async () => {
    await onboard()
    window.location.hash = '#/parent/settings'
    render(<App />)
    expect(await screen.findByText('للكبار فقط')).toBeInTheDocument()
    expect(screen.queryByText('منطقة الوالدين')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /اضغط باستمرار/ })).toBeInTheDocument()
  })

  it('child screens require setup first', async () => {
    window.location.hash = '#/home'
    render(<App />)
    expect(await screen.findByText('أهلًا بك!')).toBeInTheDocument()
  })

  it('an activity starts and shows its intro', async () => {
    await onboard({ uiLang: 'en', learningMode: 'en', practiceLang: 'en' })
    window.location.hash = '#/play/en-find-letter'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Find the letter' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Start/ }))
    expect(await screen.findByRole('button', { name: 'Listen again' })).toBeInTheDocument()
  })

  it('an unknown activity shows a friendly message, not a crash', async () => {
    await onboard()
    window.location.hash = '#/play/does-not-exist'
    render(<App />)
    expect(await screen.findByText('هذا النشاط غير متاح.')).toBeInTheDocument()
  })
})
