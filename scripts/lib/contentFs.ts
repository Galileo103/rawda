import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseContent } from '../../src/content/parse'

export const ROOT = join(import.meta.dirname, '..', '..')
export const CONTENT_DIR = join(ROOT, 'content')

/** Read every content/**\/*.json file into the same `path → data` map the app builds with Vite. */
export function readRawContent(): { raw: Record<string, unknown>; parseErrors: string[] } {
  const raw: Record<string, unknown> = {}
  const parseErrors: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.json')) {
        const rel = `content/${relative(CONTENT_DIR, full).replace(/\\/g, '/')}`
        try {
          raw[rel] = JSON.parse(readFileSync(full, 'utf8'))
        } catch (e) {
          parseErrors.push(`${rel}: invalid JSON — ${(e as Error).message}`)
        }
      }
    }
  }
  walk(CONTENT_DIR)
  return { raw, parseErrors }
}

export function loadBundle() {
  const { raw, parseErrors } = readRawContent()
  const bundle = parseContent(raw)
  return { bundle, errors: [...parseErrors, ...bundle.errors] }
}
