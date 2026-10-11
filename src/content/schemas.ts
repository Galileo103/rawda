import { z } from 'zod'
import type { Resolved } from '../domain/child'
import { AREA_IDS } from '../domain/types'

/**
 * Content schemas. All educational content lives in /content as JSON and is
 * validated against these schemas at build time (scripts/validate-content.ts)
 * and again at runtime (invalid files are skipped, never crash the app).
 */

export const AreaIdZ = z.enum(AREA_IDS)
const Id = z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, 'ids are lowercase slugs: a-z 0-9 . -')
const Hex = z.string().regex(/^[0-9A-F]{4,5}(-[0-9A-F]{4,5})*$/, 'OpenMoji hex code, e.g. 1F34E')

/** Text per language. Which keys are required depends on the activity's language. */
export const LocalizedZ = z.object({ ar: z.string().min(1).optional(), en: z.string().min(1).optional() })
export type Localized = z.infer<typeof LocalizedZ>

export const COLOR_KEYS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'brown', 'black', 'white'] as const
export const SHAPE_KEYS = ['circle', 'square', 'triangle', 'rectangle', 'star', 'heart', 'oval'] as const
export const ColorKeyZ = z.enum(COLOR_KEYS)
export const ShapeKeyZ = z.enum(SHAPE_KEYS)
export type ColorKey = z.infer<typeof ColorKeyZ>
export type ShapeKey = z.infer<typeof ShapeKeyZ>

const BASE_VISUALS = [
  z.object({ kind: z.literal('lex'), id: Id }),
  z.object({ kind: z.literal('img'), hex: Hex }),
  z.object({ kind: z.literal('glyph'), text: z.string().min(1).max(12) }),
  z.object({ kind: z.literal('numeral'), value: z.number().int().min(0).max(20) }),
  z.object({ kind: z.literal('color'), color: ColorKeyZ }),
  z.object({ kind: z.literal('shape'), shape: ShapeKeyZ }),
  z.object({ kind: z.literal('group'), id: Id, count: z.number().int().min(1).max(10) }),
  /** A short phrase (e.g. بِسْمِ اللهِ); `en` may be a transliteration shown with the Arabic. */
  z.object({ kind: z.literal('phrase'), text: z.object({ ar: z.string().min(1).max(40), en: z.string().min(1).max(60) }) }),
] as const
export const BaseVisualZ = z.discriminatedUnion('kind', [...BASE_VISUALS])

/** Anything shown on screen as a prompt, an answer or a card. `row` lines several up (patterns, sums). */
export const VisualZ = z.discriminatedUnion('kind', [
  ...BASE_VISUALS,
  z.object({ kind: z.literal('row'), items: z.array(BaseVisualZ).min(2).max(6), question: z.boolean().default(true) }),
])
export type Visual = z.infer<typeof VisualZ>

const ItemBase = {
  id: Id,
  skill: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  say: LocalizedZ,
}

export const ChoiceItemZ = z.object({
  ...ItemBase,
  show: VisualZ.optional(),
  answer: VisualZ,
  /** Explicit options (must include the answer). Otherwise distractors come from the activity's other answers. */
  choices: z.array(VisualZ).min(2).max(6).optional(),
  sayAfter: LocalizedZ.optional(),
})
/**
 * Count objects. `layout: "dice"` places 1–6 objects in dice positions (quick look, no
 * tap-to-count); with `flashMs` they show that long, then hide under a soft card.
 */
export const CountItemZ = z
  .object({
    ...ItemBase,
    object: Id,
    count: z.number().int().min(1).max(10),
    layout: z.enum(['dice']).optional(),
    flashMs: z.number().int().min(500).max(5000).optional(),
  })
  .refine((i) => i.layout !== 'dice' || i.count <= 6, 'a dice layout shows 1–6 objects')
  .refine((i) => i.flashMs === undefined || i.layout === 'dice', '"flashMs" needs "layout": "dice"')
export const MatchItemZ = z.object({
  ...ItemBase,
  pairs: z.array(z.object({ a: VisualZ, b: VisualZ })).min(2).max(5),
})
export const MemoryItemZ = z.object({ ...ItemBase, cards: z.array(Id).min(2).max(8) })
export const SequenceItemZ = z.object({ ...ItemBase, steps: z.array(VisualZ).min(2).max(6) })
/** Pre-writing strokes, in the order young children usually master them. */
export const STROKE_KEYS = ['vline', 'hline', 'circle', 'cross', 'square', 'triangle', 'zigzag', 'wave'] as const
export type StrokeKey = (typeof STROKE_KEYS)[number]
/** Trace with a finger: a letter/numeral (`glyph`) or a pre-writing stroke (`stroke`). */
export const TraceItemZ = z
  .object({ ...ItemBase, glyph: z.string().min(1).max(3).optional(), stroke: z.enum(STROKE_KEYS).optional() })
  .refine((i) => !!i.glyph !== !!i.stroke, 'a trace item needs exactly one of "glyph" or "stroke"')
/** Drag each thing into the right basket (classification / sorting). */
export const SortItemZ = z.object({
  ...ItemBase,
  bins: z.array(z.object({ id: Id, label: VisualZ })).min(2).max(3),
  things: z.array(z.object({ v: VisualZ, bin: Id })).min(3).max(8),
})
/** Say a word out loud (listen → say → hear yourself → compare). `word` is a lexicon id. */
export const SpeakItemZ = z.object({ ...ItemBase, word: Id })
export type SortItem = z.infer<typeof SortItemZ>
export type SpeakItem = z.infer<typeof SpeakItemZ>
/**
 * "Give me N" (cardinality): move exactly `n` of the `have` objects onto the plate, then tap "done".
 * `say` is the neutral line (هَيَّا نَضَعُ…); `ask` optionally addresses a boy or a girl ({ m, f }).
 */
export const GiveItemZ = z
  .object({
    ...ItemBase,
    object: Id,
    n: z.number().int().min(1).max(10),
    have: z.number().int().min(2).max(10),
    ask: z.lazy(() => GLocalizedZ).optional(),
  })
  .refine((i) => i.have >= Math.min(i.n + 2, 10), 'a give item needs "have" of at least n + 2 (at most 10)')
export type GiveItem = z.infer<typeof GiveItemZ>
/**
 * Clap the parts of a word (phonological awareness). `word` is a lexicon id; `parts` are its
 * syllables as spoken (بَطْ | طَة); `choices` are the numeral options (default 1–4, must include the answer).
 */
export const SyllablesItemZ = z.object({
  ...ItemBase,
  word: Id,
  parts: z.array(z.string().min(1).max(12)).min(1).max(4),
  choices: z.array(z.number().int().min(1).max(4)).min(2).max(4).optional(),
})
export type SyllablesItem = z.infer<typeof SyllablesItemZ>

/** The four developmental pillars the parent dashboard reports on. */
export const PILLARS = ['speech', 'logic', 'motor', 'creativity'] as const
export type Pillar = (typeof PILLARS)[number]

/**
 * A guided "discover" lesson that TEACHES one new concept before any testing:
 * meet it → see it in familiar words → (count it) → (trace it) → (gentle check).
 * `say` is the opening line; stages appear only when their field is present.
 */
export const LessonItemZ = z.object({
  ...ItemBase,
  /** The new thing, shown big: a letter glyph or a numeral. */
  focus: VisualZ,
  /** Name and sound, spoken while meeting it (e.g. "هَذَا حَرْفُ الْبَاءِ…"). */
  meet: LocalizedZ,
  /** Skills this lesson introduces; practice activities then focus on them. */
  teaches: z.array(z.string().min(1)).min(1),
  /** Familiar words (lexicon ids) that start with / show the concept. */
  examples: z.array(Id).max(5).default([]),
  /** Letter to colour inside the example words; several forms when the letter has them (alif: ["أ", "إ"]). */
  highlight: z.union([z.string().min(1).max(2), z.array(z.string().min(1).max(2)).min(1).max(4)]).optional(),
  /** Number lessons: objects appear one by one while counting. */
  count: z.object({ object: Id, n: z.number().int().min(1).max(10) }).optional(),
  /** Glyph to trace with a finger. */
  trace: z.string().min(1).max(3).optional(),
  /** "What to do" calm step (feelings): the turtle breathes slowly while this line is spoken. */
  calm: z.object({ say: LocalizedZ }).optional(),
  /** A gentle, low-pressure check at the end (2–3 options). */
  check: z.object({ say: LocalizedZ, answer: VisualZ, choices: z.array(VisualZ).min(2).max(3), /** Shown above the options (e.g. the pattern to finish). */ show: VisualZ.optional() }).optional(),
})
export type LessonItem = z.infer<typeof LessonItemZ>

export type ChoiceItem = z.infer<typeof ChoiceItemZ>
export type CountItem = z.infer<typeof CountItemZ>
export type MatchItem = z.infer<typeof MatchItemZ>
export type MemoryItem = z.infer<typeof MemoryItemZ>
export type SequenceItem = z.infer<typeof SequenceItemZ>
export type TraceItem = z.infer<typeof TraceItemZ>

const ActivityBase = {
  id: Id,
  areaId: AreaIdZ,
  /** 'any' = language-neutral concept, practised in the child's current learning language. */
  langs: z.enum(['ar', 'en', 'any']),
  level: z.number().int().min(1).max(5),
  title: LocalizedZ,
  intro: LocalizedZ,
  icon: VisualZ,
  /** Per-language icon (e.g. "أ ب ت" vs "A B C"); falls back to `icon`. */
  iconByLang: z.object({ ar: VisualZ, en: VisualZ }).optional(),
  sessionLength: z.number().int().min(1).max(10).default(5),
  order: z.number().default(100),
  /** Dashboard pillar; derived from the template/area when omitted (see domain/pillars.ts). */
  pillar: z.enum(PILLARS).optional(),
}

export const ActivityZ = z.discriminatedUnion('template', [
  z.object({ ...ActivityBase, template: z.literal('choice'), items: z.array(ChoiceItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('count'), items: z.array(CountItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('match'), items: z.array(MatchItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('memory'), items: z.array(MemoryItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('sequence'), items: z.array(SequenceItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('trace'), items: z.array(TraceItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('lesson'), items: z.array(LessonItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('sort'), items: z.array(SortItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('speak'), items: z.array(SpeakItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('give'), items: z.array(GiveItemZ).min(1) }),
  z.object({ ...ActivityBase, template: z.literal('syllables'), items: z.array(SyllablesItemZ).min(1) }),
])
export type Activity = z.infer<typeof ActivityZ>
export type TemplateId = Activity['template']
export type AnyItem = Activity['items'][number]

export const LexEntryZ = z.object({
  id: Id,
  image: Hex,
  ar: z.string().min(1),
  en: z.string().min(1),
  tags: z.array(z.string()).default([]),
})
export type LexEntry = z.infer<typeof LexEntryZ>
export const LexiconZ = z.array(LexEntryZ)

export const AreaZ = z.object({
  id: AreaIdZ,
  title: z.object({ ar: z.string().min(1), en: z.string().min(1) }),
  icon: VisualZ,
  /** Per-language icon (e.g. "أ ب ت" vs "A B C"); falls back to `icon`. */
  iconByLang: z.object({ ar: VisualZ, en: VisualZ }).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  order: z.number(),
  /** Where the area card leads. Activity areas go to the learning map. */
  route: z.enum(['map', 'stories', 'studio']).default('map'),
})
export type Area = z.infer<typeof AreaZ>
export const AreasZ = z.array(AreaZ)

export const RewardZ = z.object({
  id: Id,
  hex: Hex,
  name: z.object({ ar: z.string().min(1), en: z.string().min(1) }),
  rule: z.discriminatedUnion('type', [
    z.object({ type: z.literal('activity'), activityId: Id }),
    z.object({ type: z.literal('story'), storyId: Id }),
    z.object({ type: z.literal('stars'), total: z.number().int().positive() }),
    z.object({ type: z.literal('drawings'), count: z.number().int().positive() }),
  ]),
})
export type Reward = z.infer<typeof RewardZ>
export const RewardsZ = z.array(RewardZ)

export const SCENE_BACKGROUNDS = ['meadow', 'sky', 'night', 'home', 'sea', 'garden'] as const

/**
 * Text that may change with the child's gender: a plain string, or `{ "m": …, "f": … }`
 * (optionally `"n"` for "not set"). `@name` marks where the child's name goes.
 */
export const GTextZ = z.union([
  z.string().min(1),
  z.object({ m: z.string().min(1), f: z.string().min(1), n: z.string().min(1).optional() }).strict(),
])
const GLocalizedZ = z.object({ ar: GTextZ.optional(), en: GTextZ.optional() })

/** In a story scene, `@hero` is the child: the boy or girl picture, chosen by gender. */
export const HERO_ACTOR = '@hero'

export const StoryZ = z.object({
  id: Id,
  title: z.object({ ar: z.string().min(1), en: z.string().min(1) }),
  theme: z.string(),
  cover: VisualZ,
  level: z.number().int().min(1).max(5),
  /** The child is the hero: listed first, and the cover shows the child's picture. */
  personalized: z.boolean().default(false),
  /**
   * A letter story: linked to one Discover lesson item (e.g. { activityId: "ar-discover", itemId: "ba" }).
   * Every example word of that lesson must appear in some page's `vocab`; inside {highlighted}
   * words the lesson letter is coloured, and the lesson's completion screen offers the story.
   */
  letter: z.object({ activityId: Id, itemId: Id }).strict().optional(),
  pages: z
    .array(
      z.object({
        scene: z.object({
          bg: z.enum(SCENE_BACKGROUNDS),
          actors: z
            .array(
              z.object({
                lex: z.union([Id, z.literal(HERO_ACTOR)]),
                x: z.number().min(0).max(100),
                y: z.number().min(0).max(100),
                size: z.enum(['sm', 'md', 'lg']).default('md'),
                motion: z.enum(['none', 'bounce', 'sway']).default('none'),
                flip: z.boolean().default(false),
              }),
            )
            .max(6),
        }),
        /** {curly braces} mark highlighted vocabulary words. */
        text: z.object({ ar: GTextZ, en: GTextZ }),
        vocab: z.array(Id).default([]),
        /** Dialogic-reading question for the grown-up to ask; shown, never spoken. */
        prompt: z.object({ ar: GTextZ, en: GTextZ }).optional(),
      }),
    )
    .min(1),
  questions: z.array(ChoiceItemZ.extend({ say: GLocalizedZ, sayAfter: GLocalizedZ.optional() })).default([]),
})
/** A story as written (gendered text still in both forms). */
export type StoryDef = z.infer<typeof StoryZ>
/** A story in one child's form: what the reader shows. */
export type Story = Resolved<StoryDef>

/**
 * Quran data — produced ONLY by scripts/fetch-quran.ts from verified sources, never edited by hand.
 * Text is verbatim Tanzil Uthmani; audio is verified per-ayah recitation with recorded SHA-256.
 */
const Sha = z.string().regex(/^[0-9a-f]{64}$/)
/** The same ayah by other verified reciters, keyed by reciter id (the default reciter is `audio`). */
const MoreAudio = z.record(z.string(), z.object({ audio: z.string(), sha256: Sha }))
export const QuranZ = z.object({
  source: z.object({
    text: z.string(),
    textUrl: z.string(),
    textLicense: z.string(),
    textNotice: z.string(),
    textSha256: Sha,
    reciter: z.object({ ar: z.string(), en: z.string() }),
    audioUrl: z.string(),
    /** Every reciter, the default first. */
    reciters: z.array(z.object({ id: z.string(), name: z.object({ ar: z.string(), en: z.string() }), audioUrl: z.string() })).min(1).optional(),
    crossCheck: z.string(),
    fetchedAt: z.string(),
  }),
  basmala: z.object({ text: z.string().min(1), audio: z.string(), sha256: Sha, more: MoreAudio.optional() }),
  surahs: z
    .array(
      z.object({
        number: z.number().int().min(1).max(114),
        nameAr: z.string().min(1),
        nameTranslit: z.string().min(1),
        nameEn: z.string().min(1),
        ayahCount: z.number().int().positive(),
        /** Recited with a basmala heading before ayah 1 (all but Al-Fatiha and At-Tawbah). */
        basmalaHeading: z.boolean(),
        ayahs: z.array(z.object({ n: z.number().int().positive(), text: z.string().min(1), audio: z.string(), sha256: Sha, more: MoreAudio.optional() })).min(1),
      }),
    )
    .min(1),
})
export type QuranData = z.infer<typeof QuranZ>
export type Surah = QuranData['surahs'][number]

/** Short movement / calm breaks offered every few activities (healthy screen habits). */
export const BreaksZ = z.array(z.object({ id: Id, lex: Id, say: z.object({ ar: z.string().min(1), en: z.string().min(1) }) }))
export type MovementBreak = z.infer<typeof BreaksZ>[number]

export const StudioZ = z.object({
  stamps: z.array(Hex).min(1),
  pages: z.array(z.object({ id: Id, file: z.string().min(1), title: z.object({ ar: z.string(), en: z.string() }) })),
})
export type StudioContent = z.infer<typeof StudioZ>
