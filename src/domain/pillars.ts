import type { Activity, Pillar } from '../content/schemas'

/**
 * Which developmental pillar an activity mainly exercises (for the parent dashboard).
 * Explicit `pillar` in content wins; otherwise it follows from how the child plays:
 * speaking → speech, finger tracing → fine motor, sorting/ordering/memory/matching and the
 * logic & numbers areas → logical thinking. Creativity is measured from the drawing studio.
 * Activities that fit none (e.g. listening lessons) are simply not counted in a pillar.
 */
export function pillarOf(a: Pick<Activity, 'template' | 'areaId'> & { pillar?: Pillar }): Pillar | undefined {
  if (a.pillar) return a.pillar
  switch (a.template) {
    case 'speak':
      return 'speech'
    case 'trace':
      return 'motor'
    case 'sort':
    case 'sequence':
    case 'memory':
    case 'match':
      return 'logic'
  }
  if (a.areaId === 'logic' || a.areaId === 'numbers') return 'logic'
  return undefined
}
