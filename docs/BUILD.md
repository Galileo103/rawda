# Build, platforms & manual testing

## Requirements

- Node 22+ (`npm install`)
- Narration rendering only (`npm run audio:render`): Python 3 and ffmpeg on PATH.
  - **Arabic** uses a Microsoft neural voice that reads the fully vowelled Modern Standard Arabic text correctly (default `ar-EG-SalmaNeural`, Egyptian fus'ha, 10% slower for children). `pip install edge-tts` is enough: it talks to Microsoft Edge's Read Aloud service during the build, no key needed. For the official Azure AI Speech service (same voices, free tier is far more than enough) set `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION`. Internet is needed only on the build machine; the app stays offline.
  - To try other Arabic voices: `npm run audio:sample`, listen in `.audio-cache/samples/`, then `RAWDA_AR_VOICE=ar-SA-ZariyahNeural npm run audio:render`. A voice change re-renders all Arabic clips automatically.
  - **English** uses offline Piper TTS: `pip install piper-tts` plus one voice file in `.tools/voices/`:

  ```bash
  mkdir -p .tools/voices && cd .tools/voices
  BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main
  curl -LO $BASE/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx
  curl -LO $BASE/en/en_US/hfc_female/medium/en_US-hfc_female-medium.onnx.json
  ```

## Web

`npm run build` produces `dist/` (relative paths, hash routing), which any static host can serve. Service workers need **HTTPS** (or `localhost`).

## Windows and macOS (installed PWA)

1. Serve `dist/` over HTTPS (or run `npm run preview` on the same machine).
2. Open it in Chrome or Edge, then choose **Install Al Rawda** (address bar icon, or menu → *Install app*).
3. It runs in its own window and works offline after the first load.

A native installer (Electron/Tauri) is optional future work. A `.dmg` must be built on a Mac.

## Android (Capacitor)

Needs Android Studio (bundled JDK) and the Android SDK, which aren't on the dev machine yet.

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Al Rawda" com.rawda.app --web-dir dist
npm run build
npx cap add android
npx cap sync android
npx cap open android        # Build → Build APK(s), or run on a device
```

All assets are inside the APK, so the app works offline from first launch.
Before releasing to Google Play, review the **Families policy** and the child-directed requirements (see PRIVACY.md).

## Automated tests

```bash
npm test                      # unit + storage + component + app (jsdom, fake IndexedDB)
npm run build && npm run e2e  # Chrome, production build: offline cold start, restart persistence, RTL/LTR, gate, drawing, phone layout
```

## Manual device checklist

- [ ] Android: install the APK, enable **airplane mode**, then cold start → setup → play an activity → force-stop → reopen: progress is kept.
- [ ] Android: narration plays, the volume setting works, mute works.
- [ ] Windows PWA: install, disconnect Wi-Fi, reboot, open from the Start menu: home loads, activities and story audio work.
- [ ] macOS PWA (Chrome): same as Windows.
- [ ] Drawing on a low-end tablet: strokes stay smooth, the paint bucket fills within about 1 s, save and reopen work.
- [ ] Arabic layout: back arrows point right, text is right-aligned, and Arabic-Indic numerals show in Arabic mode.
- [ ] Parent gate: a child tapping quickly can't get in; press-and-hold plus PIN works; the "forgot PIN" word challenge works.
- [ ] Daily limit: set 15 min; after it ends, the rest screen appears between activities (never mid-task) and "keep going" requires the gate.
