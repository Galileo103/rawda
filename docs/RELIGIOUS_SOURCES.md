# Religious content: sources & rules

**Status:** the Quran section ships with **Al-Fatiha (1), An-Nasr (110), Al-Masad (111), Al-Ikhlas (112), Al-Falaq (113) and An-Nas (114)**, 30 ayahs in total, all verified (below). Parents can switch the whole "Quran & Islamic learning" area off in Parent area → Subjects.

## Rules (binding for all contributors)

1. Quranic Arabic is never typed, edited, reconstructed or paraphrased by hand, or produced by AI. Not even in tests: the e2e tests read the strings from the data file.
2. `content/quran/surahs.json` is written **only** by `npm run quran:fetch`. Its verification is described below.
3. Recitation uses verified human recordings only. The Quran player has **no text-to-speech fallback**; if a file can't play, the app says so.
4. No hadith or religious attribution is added without a documented, verifiable source.
5. Explanations for children stay simple and respectful, and they are kept separate from scripture. The "Kind words" activity (Bismillah, Alhamdulillah, Assalamu alaykum) teaches everyday phrases and doesn't quote scripture or hadith.
6. Quran progress never gates any other subject. There are no stars or stickers for Quran: listening is not gamified.

## Sources

| Material | Source | License / terms |
|---|---|---|
| Text | Tanzil Quran Text, Uthmani script (Hafs), version 1.1: https://tanzil.net | CC BY 3.0. Verbatim copies only, and changing the text is not allowed. The full Tanzil notice is stored in `surahs.json` (`source.textNotice`) |
| Surah names and ayah counts | Tanzil `quran-data.js` metadata | same project |
| Recitation (default) | Sheikh Mahmoud Khalil Al-Husary, *Al-Mushaf Al-Mu'allim* (teaching recitation), per-ayah MP3 from https://everyayah.com/data/Husary_Muallim_128kbps/ | Freely distributed recordings. Confirm redistribution terms before any public release |
| Recitation (second voice) | Sheikh Mohamed Siddiq Al-Minshawi, *Al-Mushaf Al-Mu'allim* (teaching recitation with children repeating), per-ayah MP3 from https://everyayah.com/data/Minshawy_Teacher_128kbps/ | Same as above. The folder is served by EveryAyah but not listed in its public catalogue: listen to confirm the recording before release |
| Independent cross-check | quran.com API v4 (chapter metadata and word-by-word data) | used only for verification, nothing copied |

## Verification performed by `scripts/fetch-quran.ts` (it aborts and writes nothing on any mismatch)

- The Tanzil file has exactly 6,236 ayahs and its copyright header is intact.
- For each surah, the ayah count matches across the Tanzil text, the Tanzil metadata and quran.com.
- For each ayah, the word count matches quran.com's word-by-word data. This passed for all 30 ayahs on 2026-10-09.
- **Basmala:** Tanzil's download prefixes the basmala to ayah 1 of every surah except 1 and 9. The script removes that prefix only when it is byte-identical to ayah 1:1 of the same file, and shows the basmala as a heading (recited with 1:1's audio). Al-Fatiha keeps the basmala as its ayah 1. No other character is changed.
- SHA-256 is recorded for the full text file and for every audio file. `src/content/quran.test.ts` re-checks the audio hashes, surah names, ayah counts and numbering, and the basmala handling on every test run.

To add surahs, add their numbers to `SURAHS` in `scripts/fetch-quran.ts`, run `npm run quran:fetch`, then `npm test`. To add a reciter, add it to `RECITERS` in the same script: every ayah gets its file under `more.<reciter id>` with its own SHA-256, and the parent picks the voice on the surah screen.

## Memorisation aids in the player

These change only *when* the verified recordings play, never the recordings or the text:

- **Repeat each ayah**: the same ayah again until switched off.
- **Time to repeat**: after each ayah, a quiet pause about as long as the ayah (2 to 15 seconds) while the child says it; the ayah stays framed.
- **Cumulative linking (الربط التراكمي)**: 1 · 2 · 1 2 · 3 · 1 2 3 …, the basmala once at the start.
