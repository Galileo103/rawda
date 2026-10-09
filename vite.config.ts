/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the same build works on a web host, inside Capacitor (Android)
// and as an installed PWA.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'Al Rawda — الروضة',
        short_name: 'Al Rawda',
        description: 'Offline bilingual preschool learning (Arabic & English)',
        lang: 'ar',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#FFF8EC',
        theme_color: '#FF8A5B',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Everything the child needs is precached: shell, content, art, fonts, audio.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json,mp3}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
