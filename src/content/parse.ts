import type { z } from 'zod'
import {
  type Activity,
  ActivityZ,
  type Area,
  AreasZ,
  type LexEntry,
  LexiconZ,
  BreaksZ,
  type Localized,
  type MovementBreak,
  type QuranData,
  QuranZ,
  type Reward,
  RewardsZ,
  type Story,
  StoryZ,
  type StudioContent,
  StudioZ,
  type Visual,
} from './schemas'

export interface ContentBundle {
  areas: Area[]
  lexicon: ReadonlyMap<string, LexEntry>
  activities: Activity[]
  stories: Story[]
  rewards: Reward[]
  studio: StudioContent
  breaks: MovementBreak[]
  /** Verified Quran data, if present and fully valid (never partially shown). */
  quran: QuranData | undefined
  /** Human-readable problems; the affected file/entry is skipped. */
  errors: string[]
}

const EMPTY_STUDIO: StudioContent = { stamps: ['2B50'], pages: [] }

/** Stable identity for a Visual (dedupe distractors, compare answers). */
export function visualKey(v: Visual): string {
  switch (v.kind) {
    case 'lex':
      return `lex:${v.id}`
    case 'img':
      return `img:${v.hex}`
    case 'glyph':
      return `glyph:${v.text}`
    case 'numeral':
      return `num:${v.value}`
    case 'color':
      return `color:${v.color}`
    case 'shape':
      return `shape:${v.shape}`
    case 'group':
      return `group:${v.id}:${v.count}`
    case 'phrase':
      return `phrase:${v.text.ar}`
    case 'row':
      return `row:${v.items.map(visualKey).join(',')}`
  }
}

/**
 * Validate a raw map of `content/...json` paths → parsed JSON.
 * Pure: used by the app (Vite glob) and by scripts/validate-content.ts (fs).
 */
export function parseContent(raw: Record<string, unknown>): ContentBundle {
  const errors: string[] = []
  const files = Object.entries(raw).map(([p, data]) => [p.replace(/\\/g, '/').replace(/^.*?content\//, 'content/'), data] as const)
  const get = (name: string) => files.find(([p]) => p === `content/${name}`)?.[1]

  const safe = <S extends z.ZodType>(schema: S, data: unknown, where: string): z.infer<S> | undefined => {
    const r = schema.safeParse(data)
    if (r.success) return r.data
    for (const issue of r.error.issues.slice(0, 5)) errors.push(`${where}: ${issue.path.join('.') || '(root)'} — ${issue.message}`)
    return undefined
  }

  const lexList = safe(LexiconZ, get('lexicon.json') ?? [], 'lexicon.json') ?? []
  const lexicon = new Map<string, LexEntry>()
  for (const e of lexList) {
    if (lexicon.has(e.id)) errors.push(`lexicon.json: duplicate id "${e.id}"`)
    lexicon.set(e.id, e)
  }
  const areas = (safe(AreasZ, get('areas.json') ?? [], 'areas.json') ?? []).sort((a, b) => a.order - b.order)
  const studio = safe(StudioZ, get('studio.json') ?? EMPTY_STUDIO, 'studio.json') ?? EMPTY_STUDIO

  const lexOk = (id: string, where: string) => {
    if (lexicon.has(id)) return true
    errors.push(`${where}: unknown lexicon id "${id}"`)
    return false
  }
  const visualOk = (v: Visual, where: string): boolean => {
    if (v.kind === 'lex' || v.kind === 'group') return lexOk(v.id, where)
    if (v.kind === 'row') return v.items.every((i) => visualOk(i, where))
    return true
  }

  const activities: Activity[] = []
  const stories: Story[] = []
  const ids = new Set<string>()
  for (const [path, data] of files) {
    if (path.startsWith('content/activities/')) {
      const a = safe(ActivityZ, data, path)
      if (!a) continue
      if (ids.has(a.id)) {
        errors.push(`${path}: duplicate activity id "${a.id}"`)
        continue
      }
      const problems = checkActivity(a, visualOk, lexOk, path)
      if (problems.length) {
        errors.push(...problems)
        continue
      }
      ids.add(a.id)
      activities.push(a)
    } else if (path.startsWith('content/stories/')) {
      const s = safe(StoryZ, data, path)
      if (!s) continue
      const before = errors.length
      s.pages.forEach((pg, i) => {
        pg.scene.actors.forEach((ac) => lexOk(ac.lex, `${path} page ${i + 1}`))
        pg.vocab.forEach((v) => lexOk(v, `${path} page ${i + 1}`))
      })
      s.questions.forEach((q) => {
        visualOk(q.answer, `${path} question ${q.id}`)
        q.choices?.forEach((c) => visualOk(c, `${path} question ${q.id}`))
        if (!q.choices) errors.push(`${path}: question ${q.id} needs explicit choices`)
        else if (!q.choices.some((c) => visualKey(c) === visualKey(q.answer))) errors.push(`${path}: question ${q.id} choices must include the answer`)
        if (!q.say.ar || !q.say.en) errors.push(`${path}: question ${q.id} needs ar and en text`)
      })
      if (errors.length === before) stories.push(s)
    }
  }

  const areaOrder = new Map(areas.map((a) => [a.id, a.order]))
  activities.sort(
    (a, b) => (areaOrder.get(a.areaId) ?? 99) - (areaOrder.get(b.areaId) ?? 99) || a.level - b.level || a.order - b.order,
  )

  const rewards = (safe(RewardsZ, get('rewards.json') ?? [], 'rewards.json') ?? []).filter((r) => {
    if (r.rule.type === 'activity' && !ids.has(r.rule.activityId)) {
      errors.push(`rewards.json: ${r.id} refers to unknown activity "${r.rule.activityId}"`)
      return false
    }
    if (r.rule.type === 'story') {
      const storyId = r.rule.storyId
      if (!stories.some((s) => s.id === storyId)) {
        errors.push(`rewards.json: ${r.id} refers to unknown story "${storyId}"`)
        return false
      }
    }
    return true
  })

  const quranRaw = get('quran/surahs.json')
  const quran = quranRaw === undefined ? undefined : safe(QuranZ, quranRaw, 'quran/surahs.json')
  if (quran) {
    for (const s of quran.surahs) {
      const seq = s.ayahs.every((a, i) => a.n === i + 1)
      if (!seq || s.ayahs.length !== s.ayahCount) errors.push(`quran/surahs.json: surah ${s.number} ayah numbering/count mismatch`)
    }
  }

  const breaks = (safe(BreaksZ, get('breaks.json') ?? [], 'breaks.json') ?? []).filter((b) => lexOk(b.lex, 'breaks.json'))

  return { areas, lexicon, activities, stories, rewards, studio, breaks, quran: quran && errors.every((e) => !e.startsWith('quran/')) ? quran : undefined, errors }
}

function checkActivity(
  a: Activity,
  visualOk: (v: Visual, where: string) => boolean,
  lexOk: (id: string, where: string) => boolean,
  path: string,
): string[] {
  const problems: string[] = []
  const need = a.langs === 'any' ? (['ar', 'en'] as const) : ([a.langs] as const)
  const hasLangs = (t: Localized, what: string) => {
    for (const l of need) if (!t[l]) problems.push(`${path}: ${what} is missing "${l}" text`)
  }
  hasLangs(a.title, 'title')
  hasLangs(a.intro, 'intro')
  if (!visualOk(a.icon, path)) problems.push(`${path}: bad icon`)
  const itemIds = new Set<string>()
  for (const item of a.items) {
    const where = `${path} item ${item.id}`
    if (itemIds.has(item.id)) problems.push(`${where}: duplicate item id`)
    itemIds.add(item.id)
    hasLangs(item.say, `item ${item.id} say`)
  }
  switch (a.template) {
    case 'choice': {
      const pool = new Set(a.items.map((i) => visualKey(i.answer)))
      for (const item of a.items) {
        const where = `${path} item ${item.id}`
        if (!visualOk(item.answer, where)) problems.push(`${where}: bad answer`)
        if (item.show && !visualOk(item.show, where)) problems.push(`${where}: bad prompt visual`)
        if (item.choices) {
          item.choices.forEach((c) => visualOk(c, where))
          if (!item.choices.some((c) => visualKey(c) === visualKey(item.answer))) problems.push(`${where}: choices must include the answer`)
        } else if (pool.size < 2) problems.push(`${where}: needs explicit choices (pool has fewer than 2 answers)`)
      }
      break
    }
    case 'count':
      a.items.forEach((i) => lexOk(i.object, `${path} item ${i.id}`) || problems.push(`${path}: bad object`))
      break
    case 'match':
      a.items.forEach((i) => i.pairs.forEach((p) => (visualOk(p.a, path) && visualOk(p.b, path)) || problems.push(`${path}: bad pair`)))
      break
    case 'memory':
      a.items.forEach((i) => i.cards.forEach((c) => lexOk(c, `${path} item ${i.id}`) || problems.push(`${path}: bad card`)))
      break
    case 'sequence':
      a.items.forEach((i) => i.steps.forEach((s) => visualOk(s, path) || problems.push(`${path}: bad step`)))
      break
    case 'trace':
      break
    case 'sort':
      for (const i of a.items) {
        const where = `${path} item ${i.id}`
        const bins = new Set(i.bins.map((b) => b.id))
        if (bins.size !== i.bins.length) problems.push(`${where}: duplicate bin id`)
        i.bins.forEach((b) => visualOk(b.label, where) || problems.push(`${where}: bad bin label`))
        for (const th of i.things) {
          if (!visualOk(th.v, where)) problems.push(`${where}: bad thing`)
          if (!bins.has(th.bin)) problems.push(`${where}: thing goes to unknown bin "${th.bin}"`)
        }
        for (const b of bins) if (!i.things.some((th) => th.bin === b)) problems.push(`${where}: bin "${b}" has nothing to sort into it`)
      }
      break
    case 'speak':
      a.items.forEach((i) => lexOk(i.word, `${path} item ${i.id}`) || problems.push(`${path}: bad word`))
      break
    case 'lesson':
      for (const i of a.items) {
        const where = `${path} item ${i.id}`
        if (!visualOk(i.focus, where)) problems.push(`${where}: bad focus`)
        hasLangs(i.meet, `item ${i.id} meet`)
        i.examples.forEach((e) => lexOk(e, where) || problems.push(`${where}: bad example`))
        if (i.count && !lexOk(i.count.object, where)) problems.push(`${where}: bad count object`)
        if (i.check) {
          hasLangs(i.check.say, `item ${i.id} check`)
          if (!i.check.choices.some((c) => visualKey(c) === visualKey(i.check!.answer))) problems.push(`${where}: check choices must include the answer`)
          i.check.choices.forEach((c) => visualOk(c, where))
        }
        if (!i.examples.length && !i.count && !i.trace && !i.check) problems.push(`${where}: a lesson needs at least one stage after "meet"`)
      }
      break
  }
  return problems
}
