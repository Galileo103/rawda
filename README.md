# Al Rawda · الروضة

A safe, offline, bilingual (Arabic + English) learning app for preschool children (about age 4).
Voice-guided, picture-first, no reading required. Progress stays on the device. There are no ads, no accounts and no tracking.

**Platforms:** Web · installable PWA on Windows/macOS · Android (Capacitor, see `docs/BUILD.md`). iOS is out of scope.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

The first launch asks a grown-up to pick languages and create a 4-digit parent PIN.

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Validate content → typecheck → production build with offline service worker (`dist/`) |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm test` | Unit, storage, component and app tests (Vitest + fake IndexedDB) |
| `npm run e2e` | End-to-end tests in Chrome against the production build (offline, persistence, RTL, gate, drawing) |
| `npm run typecheck` / `npm run lint` | TypeScript (strict) / oxlint |
| `npm run validate:content` | Schema + cross-reference check of everything in `content/` |
| `npm run assets:fetch` | Download the OpenMoji illustrations that content uses (build-time, one-off) |
| `npm run audio:render` | Pre-render all narration to MP3: Arabic with a Microsoft neural Modern Standard Arabic voice, English with Piper (build-time, needs Python + ffmpeg) |
| `npm run audio:sample` | Render sample lines with several Arabic voices so you can listen and choose (`RAWDA_AR_VOICE`) |

## What's inside

- **All eight learning areas** (data-driven): letters and sounds (Arabic and English), numbers, colors and shapes, stories, Quran and Islamic learning, science and nature, thinking and puzzles, drawing. Each area can be switched off by a parent.
- **Learning journey:** *Discover* lessons teach one new letter or number (meet it → see it in familiar words → count or trace it → gentle check). Practice then focuses on what was introduced, and "Continue" alternates discover → practise.
- **Quran:** Al-Fatiha and An-Nasr to An-Nas. The text is verbatim from Tanzil and the recitation is Al-Husary (Mu'allim); everything is verified and checksummed (`docs/RELIGIOUS_SOURCES.md`, `npm run quran:fetch`).
- **Activity engine:** seven reusable templates (lesson, choice, count, match, memory, sequence, trace). Every activity is a JSON file.
- **Adaptive learning:** mastery tracked per concept and per language, Leitner-style review, automatic difficulty, gentle 3-step hints.
- **Rewards:** stars and stickers for effort. Nothing is ever lost, bought or expired.
- **Stories:** illustrated, narrated, with vocabulary in both languages and comprehension questions.
- **Creative studio:** brushes, eraser, paint bucket, stamps, shapes, coloring pages, undo, save, and a gallery stored locally.
- **Parent area** (press-and-hold + PIN): progress, settings, subjects, data export/import/reset/delete, privacy.

Docs: [Architecture](docs/ARCHITECTURE.md) · [Adding content](docs/CONTENT_GUIDE.md) · [Build & platforms](docs/BUILD.md) · [Privacy](docs/PRIVACY.md) · [Asset licenses](docs/ASSETS_LICENSES.md) · [Religious sources](docs/RELIGIOUS_SOURCES.md)
