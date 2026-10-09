import { content } from '../../content/loader'
import type { Story } from '../../content/schemas'
import { OpenMoji } from '../../design/Visual'
import type { Lang } from '../../domain/types'
import s from './stories.module.css'

const SIZES = { sm: 0.11, md: 0.17, lg: 0.25 } as const

/** A story illustration composed from characters placed on a painted background. */
export function Scene({ scene, lang, width = 900 }: { scene: Story['pages'][number]['scene']; lang: Lang; width?: number }) {
  return (
    <div className={[s.scene, s[scene.bg]].join(' ')} role="img" aria-label={scene.actors.map((a) => content.lexicon.get(a.lex)?.[lang] ?? '').join('، ')}>
      {scene.bg === 'night' && <Stars />}
      {scene.actors.map((a, i) => {
        const e = content.lexicon.get(a.lex)
        if (!e) return null
        const px = Math.round(width * SIZES[a.size])
        return (
          <span
            key={i}
            className={[s.actor, a.motion !== 'none' ? s[a.motion] : ''].join(' ')}
            style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${SIZES[a.size] * 100}%`, translate: '-50% -50%', scale: a.flip ? '-1 1' : undefined }}
          >
            <OpenMoji hex={e.image} alt="" size={px} />
          </span>
        )
      })}
    </div>
  )
}

function Stars() {
  return (
    <svg viewBox="0 0 160 90" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
      {[
        [12, 10],
        [40, 22],
        [70, 8],
        [104, 18],
        [136, 9],
        [150, 30],
        [24, 34],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.3" fill="#fff6c2" />
      ))}
    </svg>
  )
}
