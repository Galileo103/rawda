import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the production build (`npm run build` first) so the
 * service worker and offline behaviour are real. Uses the locally installed Chrome
 * (no browser download); set PW_CHANNEL=chromium to use Playwright's bundled browser.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    channel: process.env.PW_CHANNEL ?? 'chrome',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 }, channel: process.env.PW_CHANNEL ?? 'chrome' } },
  ],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
