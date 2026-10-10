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
| `template` | `choice`, `count`, `match`, `memory`, `sequence`, `sort`, `trace`, `speak` or `lesson` |
| `pillar` | optional: `speech`, `logic`, `motor` or `creativity` for the parent dashboard (derived from the template/area when omitted) |
| `title`, `intro` | `{ "ar": "…", "en": "…" }` |
| `icon` | a Visual (see below) |
| `sessionLength` | tasks per play (default 5) |

Every item has `id`, `skill` (what's being learned, e.g. `color.red`; tracked per language), `difficulty` 1–5, and `say` (the spoken instruction).

**Visuals:** `{ "kind": "lex", "id": "cat" }`, `{ "kind": "glyph", "text": "ب" }`, `{ "kind": "numeral", "value": 3 }`, `{ "kind": "color", "color": "red" }`, `{ "kind": "shape", "shape": "circle" }`, `{ "kind": "group", "id": "apple", "count": 3 }`, `{ "kind": "img", "hex": "1F522" }`.

Templates:

- **choice:** `answer` (Visual). Optional `show` (big prompt picture), `choices` (explicit options that include the answer; otherwise distractors come from other items' answers), and `sayAfter` (spoken on success).
- **count:** `object` (lexicon id) and `count` 1–10.
- **match:** `pairs: [{ "a": Visual, "b": Visual }]`, 2–5 pairs.
- **memory:** `cards: ["cat", "dog", …]` (each becomes a pair).
- **sequence:** `steps: [Visual, …]` in the correct order. The child drags tiles into the slots (tapping also works).
- **sort:** `bins: [{ "id": "red", "label": Visual }]` (2–3 baskets) and `things: [{ "v": Visual, "bin": "red" }]` (3–8 pictures). The child drags each picture into its basket, or taps the picture and then the basket. Every basket needs at least one picture.
- **trace:** exactly one of `glyph` (1–3 characters) or `stroke`, a pre-writing stroke: `vline`, `hline`, `circle`, `cross`, `square`, `triangle`, `zigzag` or `wave`. Strokes show a green start dot, and lines across, zigzags, waves and squares run right to left in Arabic. Success is generous coverage; a big ✓ appears early for children who find tracing hard.
- **speak** ("Say it!"): `word` (lexicon id). Write `say` so it contains the word (e.g. "هَيَّا نَقُولُ: تُفَّاحَة"). The microphone is parent opt-in; without it the child says the word aloud and taps "I said it!". It is never marked wrong.
- **lesson** (Discover: teaches before testing): `focus` (Visual), `meet` (name and sound to speak), `teaches` (skill ids this introduces, e.g. `["ar.letter.ba", "ar.sound.ba"]`). Optional stages, shown in this order when present: `examples` (lexicon ids, with `highlight` = the letter to colour), `count: { "object": "apple", "n": 3 }`, `trace` (glyph), and `check: { "say", "answer", "choices" }` (2–3 options). Use `sessionLength: 1`: one new concept per session.

More visuals: `{ "kind": "phrase", "text": { "ar": "بِسْمِ اللهِ", "en": "Bismillah" } }` (short phrases) and `{ "kind": "row", "items": [Visual, …], "question": true }` (patterns with a "?" at the end, or sums when `question` is false).

Add a sticker for the activity in `content/rewards.json`:
`{ "id": "sticker-x", "hex": "1F98B", "name": {…}, "rule": { "type": "activity", "activityId": "<id>" } }`.

## Stories: `content/stories/<id>/story.json`

Each page has a `scene` (background `meadow`, `sky`, `night`, `home`, `sea` or `garden`, plus up to 6 `actors` from the lexicon placed by `x`/`y` percent), `text` in both languages, and `vocab` (lexicon ids shown as tap-to-hear chips). Wrap words in `{curly braces}` to highlight them. `questions` are choice items with explicit `choices`.

### Personalized stories (the child is the hero)

Set `"personalized": true`. Then:

- `@name` marks where the child's name goes. It is shown as the name the parent typed, and spoken from the parent's recording (or as بَطَلُنَا / بَطَلَتُنَا, "our hero/heroine", if there is none). Put `@name` at the **start or end of a clause** ("@name يَرَى…", "…يَا @name!"), because the narration is stitched together as Salma + recording + Salma, and a name in the middle of a phrase sounds choppy.
- Any `text` (and any question `say`) can be `{ "m": "…", "f": "…" }`, a boy form and a girl form, e.g. `{ "m": "@name يَرَى الشَّمْسَ.", "f": "@name تَرَى الشَّمْسَ." }`. English needs both forms only when it uses he/she/his/her.
- The actor `"@hero"` is the child: the boy or girl picture.
- Run `npm run audio:render` afterwards: every piece of both forms gets its own clip.

The same `{ m, f, n? }` form works in `src/i18n/*.ts` for app lines that speak to the child. `n` is used while the parent hasn't said boy or girl.

## Religious content

Quranic text and recitation must come only from the verified sources described in `RELIGIOUS_SOURCES.md`, through the fetch script. Never type Quranic text by hand.
