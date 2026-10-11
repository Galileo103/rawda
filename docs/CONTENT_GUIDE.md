# Adding content

Everything a child sees lives in `content/` as JSON. No code changes are needed. After editing:

```bash
npm run validate:content   # schema + references; tells you exactly what's wrong
npm run assets:fetch       # downloads any new OpenMoji pictures you referenced
npm run audio:render       # renders narration for new/changed lines (Arabic: neural MSA voice; see docs/BUILD.md)
```

## Words and pictures: `content/lexicon.json`

```json
{ "id": "cat", "image": "1F408", "ar": "قِطَّة", "en": "cat", "tags": ["animal"] }
```

`image` is an OpenMoji code (find it at openmoji.org; use the hex without `U+`). Write Arabic **with full tashkeel**, because the text-to-speech engine reads it.

## Activities: `content/activities/<area>/<id>.json`

Shared fields:

| Field | Meaning |
|---|---|
| `id` | stable unique slug (never rename it, because progress is keyed by it) |
| `areaId` | `letters`, `numbers`, `colors-shapes`, `stories`, `islamic`, `science`, `logic` or `creativity` |
| `langs` | `ar`, `en`, or `any` (language-neutral: played in the child's current learning language; needs both texts) |
| `level` | 1–5 stage on the learning map (Discover → Explore & Create) |
| `template` | `choice`, `count`, `match`, `memory`, `sequence`, `sort`, `trace`, `speak`, `syllables` or `lesson` |
| `pillar` | optional: `speech`, `logic`, `motor` or `creativity` for the parent dashboard (derived from the template/area when omitted) |
| `title`, `intro` | `{ "ar": "…", "en": "…" }` |
| `icon` | a Visual (see below) |
| `sessionLength` | tasks per play (default 5) |

Every item has `id`, `skill` (what's being learned, e.g. `color.red`; tracked per language), `difficulty` 1–5, and `say` (the spoken instruction).

**Visuals:** `{ "kind": "lex", "id": "cat" }`, `{ "kind": "glyph", "text": "ب" }`, `{ "kind": "numeral", "value": 3 }`, `{ "kind": "color", "color": "red" }`, `{ "kind": "shape", "shape": "circle" }`, `{ "kind": "group", "id": "apple", "count": 3 }`, `{ "kind": "img", "hex": "1F522" }`.

Templates:

- **choice:** `answer` (Visual). Optional `show` (big prompt picture), `choices` (explicit options that include the answer; otherwise distractors come from other items' answers), and `sayAfter` (spoken on success).
- **count:** `object` (lexicon id) and `count` 1–10. Quick look (subitizing): `"layout": "dice"` places 1–6 objects in dice positions (no tap-to-count), and `flashMs` (500–5000) shows them that long before a soft card covers them; "peek again" re-shows them and counts as a help. Write `say` in the past ("كَمْ نَجْمَةً كَانَتْ هُنَا؟").
- **match:** `pairs: [{ "a": Visual, "b": Visual }]`, 2–5 pairs.
- **memory:** `cards: ["cat", "dog", …]` (each becomes a pair).
- **sequence:** `steps: [Visual, …]` in the correct order. The child drags tiles into the slots (tapping also works).
- **sort:** `bins: [{ "id": "red", "label": Visual }]` (2–3 baskets) and `things: [{ "v": Visual, "bin": "red" }]` (3–8 pictures). The child drags each picture into its basket, or taps the picture and then the basket. Every basket needs at least one picture.
- **trace:** exactly one of `glyph` (1–3 characters) or `stroke`, a pre-writing stroke: `vline`, `hline`, `circle`, `cross`, `square`, `triangle`, `zigzag` or `wave`. Strokes show a green start dot, and lines across, zigzags, waves and squares run right to left in Arabic. Success is generous coverage; a big ✓ appears early for children who find tracing hard.
- **speak** ("Say it!"): `word` (lexicon id). Write `say` so it contains the word (e.g. "هَيَّا نَقُولُ: تُفَّاحَة"). The microphone is parent opt-in; without it the child says the word aloud and taps "I said it!". It is never marked wrong.
- **give** ("Give me N", cardinality): `object` (lexicon id), `n` 1–10 and `have` (the pile, at least `n + 2`, at most 10). The child taps or drags objects onto the plate (each gets its count number; tap one there to take it back) and taps "Done". `say` is the neutral line ("هَيَّا نَضَعُ ثَلَاثَ تُفَّاحَاتٍ فِي الطَّبَقِ."); optional `ask` speaks to the child, e.g. `{ "ar": { "m": "أَعْطِنِي ثَلَاثَ تُفَّاحَاتٍ.", "f": "أَعْطِينِي ثَلَاثَ تُفَّاحَاتٍ." } }`. Write the number–noun agreement in the content (3–10: plural genitive with gender polarity: ثَلَاثَ تُفَّاحَاتٍ but ثَلَاثَةَ بَالُونَاتٍ).
- **syllables** ("Clap the parts!", phonological awareness): `word` (lexicon id) and `parts`, its 1–4 spoken syllables (`["بَطْ", "طَة"]`, `["rab", "bit"]`; a shadda splits across two parts: تُفْ | فَا | حَة). Joined, the parts must spell the word (tashkeel and spaces ignored; `validate:content` checks it). Optional `choices`: the numerals to offer (default 1–4, must include the number of parts). Each drum tap lights the next part; then the child picks how many claps. Write `say` with the parts, e.g. "هَيَّا نُصَفِّقُ لِكُلِّ جُزْءٍ: بَطْ… طَة!".
- **lesson** (Discover: teaches before testing): `focus` (Visual), `meet` (name and sound to speak), `teaches` (skill ids this introduces, e.g. `["ar.letter.ba", "ar.sound.ba"]`). Optional stages, shown in this order when present: `examples` (up to 5 lexicon ids, with `highlight` = the letter to colour, or a list of its forms such as `["أ", "إ"]`; letter games also use every lexicon word starting with that letter), `count: { "object": "apple", "n": 3 }`, `trace` (glyph), `calm: { "say" }` (a "what to do" step for big feelings: the turtle breathes slowly while the line is spoken; still when motion is reduced), and `check: { "say", "answer", "choices" }` (2–3 options). Use `sessionLength: 1`: one new concept per session.

More visuals: `{ "kind": "phrase", "text": { "ar": "بِسْمِ اللهِ", "en": "Bismillah" } }` (short phrases) and `{ "kind": "row", "items": [Visual, …], "question": true }` (patterns with a "?" at the end, or sums when `question` is false).

Add a sticker for the activity in `content/rewards.json`:
`{ "id": "sticker-x", "hex": "1F98B", "name": {…}, "rule": { "type": "activity", "activityId": "<id>" } }`.

## Stories: `content/stories/<id>/story.json`

Each page has a `scene` (background `meadow`, `sky`, `night`, `home`, `sea` or `garden`, plus up to 6 `actors` from the lexicon placed by `x`/`y` percent), `text` in both languages, and `vocab` (lexicon ids shown as tap-to-hear chips). Wrap words in `{curly braces}` to highlight them. `questions` are choice items with explicit `choices`.

Every page also has a `prompt`: one open question for the grown-up to ask while reading (dialogic reading), in both languages. Mix predict ("مَاذَا سَيَحْدُثُ بَعْدَ ذَلِكَ؟"), relate ("هَلْ شَارَكْتَ لُعْبَتَكَ مَعَ صَدِيقٍ؟"), feelings ("كَيْفَ يَشْعُرُ الْأَرْنَبُ؟ لِمَاذَا؟") and point ("أَيْنَ الْكُرَةُ؟"); keep it short, kind and fully voweled. Like `text`, it may be `{ "m", "f", "n"? }` when it addresses the child and may use `@name`. It is shown under the page text ("Ask your child"; behind a small button when voice is on) and never spoken by Hala, so it needs no audio.

### Personalized stories (the child is the hero)

Set `"personalized": true`. Then:

- `@name` marks where the child's name goes. It is shown as the name the parent typed, and spoken from the parent's recording (or as بَطَلُنَا / بَطَلَتُنَا, "our hero/heroine", if there is none). Put `@name` at the **start or end of a clause** ("@name يَرَى…", "…يَا @name!"), because the narration is stitched together as Salma + recording + Salma, and a name in the middle of a phrase sounds choppy.
- Any `text` (and any question `say`) can be `{ "m": "…", "f": "…" }`, a boy form and a girl form, e.g. `{ "m": "@name يَرَى الشَّمْسَ.", "f": "@name تَرَى الشَّمْسَ." }`. English needs both forms only when it uses he/she/his/her.
- The actor `"@hero"` is the child: the boy or girl picture.
- Run `npm run audio:render` afterwards: every piece of both forms gets its own clip.

The same `{ m, f, n? }` form works in `src/i18n/*.ts` for app lines that speak to the child. `n` is used while the parent hasn't said boy or girl.

### Letter stories

A story can belong to one Discover letter lesson: add `"letter": { "activityId": "ar-discover", "itemId": "ba" }` (use the id `letter-<item>`, e.g. `letter-ba`). Then:

- **Every lesson word is in the story.** Each `examples` id of that lesson item must appear in some page's `vocab`; `validate:content` names any missing words. The activity must be a `lesson` and the item must exist; only one story per lesson item.
- **The letter is coloured.** Inside `{highlighted}` words, the lesson's `highlight` letter (or any of its forms, e.g. `["أ", "إ"]`) gets the same colour as in the lesson. This happens only in the lesson's language, so wrap the words that contain the letter.
- **Where it shows up.** When the child finishes that lesson, the completion screen offers a big "قِصَّةُ ب" / "Story of ب" button. On the Discover board, the letter's tile carries a small book badge (the tile still opens the lesson). In the library, letter stories sit on their own shelf, "قِصَصُ الْحُرُوفِ", in alphabet order with letters the child has already met first. Nothing is ever locked.
- Letter stories are usually `personalized` and follow all the story rules above (`prompt` on every page, `{ m, f }` forms, full tashkeel).

## Religious content

Quranic text and recitation must come only from the verified sources described in `RELIGIOUS_SOURCES.md`, through the fetch script. Never type Quranic text by hand.
