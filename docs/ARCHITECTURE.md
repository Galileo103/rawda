# Architecture

## Stack (and why)

React 19 + TypeScript (strict) + Vite, as an **offline-first PWA**. One codebase serves:

- **Web:** a static `dist/`.
- **Windows and macOS:** "Install app" from Chrome/Edge. It runs offline from the service-worker cache.
- **Android:** the same `dist/` wrapped with Capacitor. All assets are inside the APK.

Flutter and React Native were considered. Neither was installed on the dev machine, React Native's web and desktop support is weaker, and a PWA delivers web, desktop and Android from one build with no native code. The trade-off is that Arabic text-to-speech isn't available on every device, which is why narration is **pre-rendered** at build time.

## Layers

```
src/app/        shell: routing (HashRouter), AppState (settings → <html lang dir>), ErrorBoundary, ChildShell
src/design/     design system: tokens (global.css), UI primitives, Icon, Mascot (Hala), Visual renderer
src/features/   screens: welcome, home, map, activities (player + templates), stories, studio, rewards, parent
src/domain/     pure learning logic — mastery, scheduler, difficulty, rewards, recommend (no I/O, fully unit-tested)
src/content/    Zod schemas, parser/validator, Vite loader, narration collector, asset URLs
src/services/   persistence (Dexie/IndexedDB + repos), audio, parent gate
src/i18n/       ar.ts / en.ts dictionaries (type-checked to have identical keys)
content/        all educational content as JSON (no code)
scripts/        build-time tools: validate content, fetch OpenMoji, render audio
```

UI never talks to IndexedDB directly; it goes through `services/repos/*`.

## Storage (IndexedDB via Dexie)

| Table | Holds |
|---|---|
| `settings` | language mode, subjects, difficulty overrides, audio, accessibility, rewards, daily limit, PIN hash + salt |
| `profile` | optional nickname and age band (no real name, birthday, photo or location) |
| `attempts` | one row per finished task (activity, item, skill, language, first-try, misses, hints, time) |
| `mastery` | per `skill|lang`: score 0–1, Leitner box, attempts, due date |
| `levels` | adaptive level per `area|lang` |
| `completions` | finished activities with stars |
| `rewards` | earned stickers (primary key = reward id, so a sticker can't be granted twice) |
| `drawings` | composite PNG + editable layer PNG (data URLs) |
| `storyProgress` | page / finished per story |
| `usage` | seconds per day + parent-granted bonus |

`navigator.storage.persist()` is requested on start. Everything is local; there are no network calls at runtime.

## Learning engine

- **Mastery:** a moving average per skill and language (first try = 1, small help = 0.5, more help = 0.25). Mistakes move it gently. It never decays with time.
- **Review:** Leitner boxes 1–5 (same session → 1 → 3 → 7 → 14 days).
- **Session builder:** about 60% review/weak, 25% familiar, 15% new, filtered to the current difficulty. It starts with the most familiar item and never repeats an item back to back.
- **Difficulty:** goes up after 3 first-try wins and down after 2 struggles, per area and language. A parent can pin it.
- **Hints:** miss 1 → replay plus "let's look together"; miss 2 → fewer options; miss 3 → the answer glows. Help is always available.
- Response time is stored for parents but never used for mastery.

## One language at a time

The child learns in one language at a time. `settings.practiceLang` (the ع / A switch on Home, or the language setting in the parent area) decides the screen language **and** the content: activities, stories and boards are filtered to it (`AppState.langs = [practiceLang]`, and `normalizeSettings` keeps `uiLang === practiceLang`). Language-neutral activities (`langs: "any"`) run in the current language. The Quran (Arabic recitation) is available in both. Progress is still tracked separately per language.

## Learning journey (teach before testing)

- **Discover boards** (`/discover/:activityId`): the whole alphabet (28 Arabic / 26 English letters) or all numbers of a lesson activity. The parent or child picks any letter to learn (`/play/:id?item=ba`). Learned letters show ✓ and the next new one glows. The map opens the board for lesson activities.

- **Discover lessons** (`template: "lesson"`) teach one concept per session: *meet* it (name and sound) → *see it* in familiar words with the letter coloured → *count* it (numbers) → *trace* it → a *gentle check* with two options. Each step is child-paced (big "next" button, nothing timed).
- Lessons go in curriculum order (`pickLessonItems`). Each lesson item declares the skills it `teaches`.
- **Practice focuses on what was taught:** once two or more concepts of an area have been introduced, practice sessions draw only from them (`focusSkills` in the scheduler). Children who skip lessons still get the full bank.
- **Continue alternates** discover → practise (`journeyCompleted` in `features/common.ts`): right after a lesson, lessons are hidden from the recommender; after practising, the next lesson comes back.

## Activity contract

`ActivityPlayer` owns intro, instructions, feedback, hints, persistence and completion. Templates (`features/activities/templates`) only render one task and call `onCorrect` / `onWrong`. Adding a template means adding a schema variant in `content/schemas.ts` and a component.

## Active learning: the four pillars

Activities are grouped for parents into four developmental pillars (`domain/pillars.ts`). An explicit `pillar` in content wins; otherwise the template or area decides:

| Pillar | How the child plays | Templates / sources |
|---|---|---|
| Speaking | listen → say → hear yourself → compare | `speak` (`features/speech/*`) |
| Logical thinking | classify, order, find patterns, remember | `sort`, `sequence`, `match`, `memory`, and the logic and numbers areas |
| Fine motor | finger tracing of pre-writing strokes, letters and numbers; drag and drop | `trace` (`stroke` or `glyph`) |
| Creativity | free drawing, stamps and colouring | studio drawings (`drawings` table) |

- **Drag and drop:** `templates/useDrag.ts` is touch-first. A press that moves more than 10 px becomes a drag with a ghost that follows the finger, and the drop target is an element with `data-drop`. A press without movement is a tap, so tap-tap and the keyboard always work too, which matters for children with less precise motor control.
- **Speech:** `features/speech/speechService.ts` (microphone and on-device recognition only; see PRIVACY.md) and `speechMatch.ts` (lenient matching that strips tashkeel and "ال" and accepts edit-distance similarity of at least 0.6).
- **Rewards in play:**
  - Each correct answer sends a star flying from the finger to the child's stone on the path, and finished stones become stars.
  - Every 3 first-try answers in a row earn a sparkle sound, a bigger burst and a special praise line.
  - Breaking a streak is never mentioned. All motion respects "reduce motion".
- **Parent dashboard:** `parent/pillarStats.ts` (pure, unit-tested) and `PillarDashboard.tsx`. It shows a ring per pillar (average mastery of the pillar's skills; for creativity, recent drawing activity), a 14-day stacked SVG chart, an active-days streak, and milestones. Attempts may carry an optional `quality` (0–1: tracing coverage, or how a word was practised), shown to parents only and never used for mastery.

## Voice off (a grown-up reads)

`settings.narration = false` silences all narration (`AudioService.speak` returns `muted`). Sound effects and the Quran recitation are unaffected. The parent can switch it in Settings, or with the press-and-hold `VoiceToggle` (1.2 s, so a child's tap does nothing) on Home and in the activity bar. While it is off:
- every instruction is shown as a large `readAloud` caption, even when captions are turned off;
- feedback lines include the instruction or the "that's …" line, so the parent always has the full sentence to read;
- after a correct answer the next task waits about 2 s instead of 1 s;
- Discover lessons don't auto-cycle: all example words stay on screen to read, and counting goes at one per second.

## Audio

`AudioService.speak(text, lang)` plays a bundled clip when `clipKey(lang, text)` is in the generated manifest. Otherwise it uses device speech if a voice exists (preferring natural voices and Modern Standard Arabic regions). Otherwise it returns `none`, and the caption plus mascot stay on screen. Sound effects are synthesized with Web Audio, so there are no files to license.

Clips are rendered by `scripts/render-audio.ts`: Arabic with a Microsoft neural MSA voice (`scripts/neural_batch.py`, edge-tts or Azure AI Speech), English with offline Piper (`scripts/piper_batch.py`). The manifest (`version: 2`) records the voice per language, so changing a voice re-renders that language from scratch while unchanged lines are otherwise reused.
