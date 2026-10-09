# Asset inventory & licenses

| Asset | Source | License | Notes |
|---|---|---|---|
| Illustrations (`public/assets/openmoji/*.svg`, 123 files) | OpenMoji 15.1.0, https://openmoji.org (fetched by `scripts/fetch-assets.ts` from the npm package via jsDelivr) | **CC BY-SA 4.0** | Attribution is shown in Parent area → Privacy & about. Modifications would have to be shared alike. |
| Mascot "Hala", app icon, story backgrounds, UI icons | Original artwork for Al Rawda (SVG in source code) | Project-owned | |
| Coloring pages (`public/assets/coloring/*.svg`) | Original artwork for Al Rawda | Project-owned | |
| Font: Baloo Bhaijaan 2 | `@fontsource-variable/baloo-bhaijaan-2` (Ek Type) | SIL Open Font License 1.1 | Bundled, offline |
| Font: Amiri Quran | `@fontsource/amiri-quran` (Khaled Hosny) | SIL Open Font License 1.1 | Quran text |
| Quran text (`content/quran/surahs.json`) | Tanzil Quran Text, Uthmani 1.1, https://tanzil.net | CC BY 3.0, verbatim only | Notice stored in the file; see RELIGIOUS_SOURCES.md |
| Quran recitation (`public/assets/quran/husary-muallim/*.mp3`, 30 files, 4.1 MB) | Al-Husary, Mu'allim, via https://everyayah.com | Freely distributed recordings; **confirm redistribution terms before a public release** | SHA-256 per file in surahs.json |
| Sound effects | Synthesized at runtime with Web Audio (`AudioService.sfx`) | n/a, no files | |
| Narration clips (`public/assets/audio/{ar,en}/*.mp3`) | Generated at build time (`npm run audio:render`); see voices below | See voices below | The manifest records which voice produced each language |
| Arabic voice `ar-EG-SalmaNeural` (Microsoft neural, Egyptian fus'ha) | Rendered through Microsoft Edge Read Aloud (edge-tts) or Azure AI Speech | Microsoft service terms. Output from the **official Azure AI Speech** service may be used in your app under its terms; the Edge Read Aloud route is unofficial | OK for private family use. **Render through Azure AI Speech (set `AZURE_SPEECH_KEY`) before any public release.** |
| English voice `en_US-hfc_female-medium` | rhasspy/piper-voices. Dataset: Hi-Fi CAPTAIN (NICT) | **CC BY-NC-SA 4.0** (non-commercial) | OK for private/non-commercial use. **Replace before any commercial release.** |

## Before a public release

1. Render Arabic through the official Azure AI Speech service and replace or license the English Piper voice. Professional human recordings remain preferable for letter pronunciation.
2. Keep the OpenMoji credit visible and keep CC BY-SA obligations for any modified OpenMoji art.
3. Re-run `npm run assets:fetch` and `npm run audio:render` and record the versions here.
