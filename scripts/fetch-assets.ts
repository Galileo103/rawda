/**
 * npm run assets:fetch — downloads the OpenMoji SVGs referenced by content into
 * public/assets/openmoji so the app is fully offline. One-time, build-time only.
 * OpenMoji © HfG Schwäbisch Gmünd — CC BY-SA 4.0 (see docs/ASSETS_LICENSES.md).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Visual } from '../src/content/schemas'
import { ROOT, loadBundle } from './lib/contentFs'

const OPENMOJI_VERSION = '15.1.0'
const OUT = join(ROOT, 'public', 'assets', 'openmoji')
const BASE = `https://cdn.jsdelivr.net/npm/openmoji@${OPENMOJI_VERSION}/color/svg`

const { bundle, errors } = loadBundle()
if (errors.length) console.warn(`(content has ${errors.length} problem(s); fetching what is referenced anyway)`)

const hexes = new Set<string>()
const visit = (v: Visual | undefined) => {
  if (!v) return
  if (v.kind === 'row') v.items.forEach(visit)
  if (v.kind === 'img') hexes.add(v.hex)
  if (v.kind === 'lex' || v.kind === 'group') {
    const e = bundle.lexicon.get(v.id)
    if (e) hexes.add(e.image)
  }
}
for (const e of bundle.lexicon.values()) hexes.add(e.image)
for (const a of bundle.areas) visit(a.icon)
for (const r of bundle.rewards) hexes.add(r.hex)
for (const s of bundle.studio.stamps) hexes.add(s)
for (const a of bundle.activities) {
  visit(a.icon)
  for (const item of a.items as Record<string, unknown>[]) {
    for (const key of ['show', 'answer', 'focus']) visit(item[key] as Visual | undefined)
    const check = item.check as { answer: Visual; choices: Visual[] } | undefined
    if (check) [check.answer, ...check.choices].forEach(visit)
    for (const key of ['choices', 'steps']) (item[key] as Visual[] | undefined)?.forEach(visit)
  }
}
for (const s of bundle.stories) visit(s.cover)

mkdirSync(OUT, { recursive: true })

async function fetchOne(hex: string): Promise<'ok' | 'skip' | 'missing'> {
  const target = join(OUT, `${hex}.svg`)
  if (existsSync(target)) return 'skip'
  for (const name of [hex, `${hex}-FE0F`]) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${BASE}/${name}.svg`)
        if (res.status === 404) break
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const svg = await res.text()
        if (!svg.includes('<svg')) throw new Error('not an SVG')
        writeFileSync(target, svg)
        return 'ok'
      } catch (e) {
        if (attempt === 3) console.warn(`  ${name}: ${(e as Error).message}`)
        await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
  }
  return 'missing'
}

const list = [...hexes].sort()
const results = { ok: 0, skip: 0, missing: [] as string[] }
for (let i = 0; i < list.length; i += 6) {
  const batch = list.slice(i, i + 6)
  const r = await Promise.all(batch.map(fetchOne))
  r.forEach((x, j) => {
    if (x === 'missing') results.missing.push(batch[j] as string)
    else results[x]++
  })
}
console.log(`openmoji: ${results.ok} downloaded, ${results.skip} already present, ${results.missing.length} missing`)
if (results.missing.length) {
  console.log(`missing (the app falls back to the system emoji): ${results.missing.join(', ')}`)
  process.exitCode = 1
}
