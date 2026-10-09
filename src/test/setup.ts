import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no media playback: behave like a device where audio can't play.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn(() => Promise.reject(new Error('media playback unavailable in tests'))),
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: vi.fn() })

afterEach(() => {
  cleanup()
})
