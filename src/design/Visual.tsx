import { type CSSProperties, useState } from 'react'
import { emojiFromHex, openmojiUrl } from '../content/assets'
import { content } from '../content/loader'
import type { ColorKey, ShapeKey, Visual as VisualT } from '../content/schemas'
import type { Lang } from '../domain/types'
import { dict, numeral } from '../i18n'
import s from './Visual.module.css'

export const COLOR_HEX: Record<ColorKey, string> = {
  red: '#E5383B',
  blue: '#2F7DE1',
  yellow: '#FFD23F',
  green: '#2FAE4E',
  orange: '#FF8C1A',
  purple: '#8E44D9',
  pink: '#FF6FB5',
  brown: '#8B5A2B',
  black: '#262626',
  white: '#FFFFFF',
}

/** OpenMoji image with graceful fallback: SVG → system emoji → soft placeholder. Never throws. */
export function OpenMoji({ hex, alt, size = 96, className }: { hex: string; alt: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const style = { '--vs': `${size}px` } as CSSProperties
  if (failed) {
    const emoji = emojiFromHex(hex)
    return emoji ? (
      <span className={[s.emoji, className].filter(Boolean).join(' ')} style={style} role="img" aria-label={alt}>
        {emoji}
      </span>
    ) : (
      <span className={s.placeholder} style={style} role="img" aria-label={alt} />
    )
  }
  return <img className={[s.img, className].filter(Boolean).join(' ')} style={style} src={openmojiUrl(hex)} alt={alt} draggable={false} onError={() => setFailed(true)} />
}

export function ShapeSvg({ shape, color = 'var(--teal)', size = 96 }: { shape: ShapeKey; color?: string; size?: number }) {
  const common = { fill: color, stroke: 'rgba(0,0,0,.25)', strokeWidth: 3 }
  let el
  switch (shape) {
    case 'circle':
      el = <circle cx="50" cy="50" r="40" {...common} />
      break
    case 'square':
      el = <rect x="12" y="12" width="76" height="76" rx="6" {...common} />
      break
    case 'rectangle':
      el = <rect x="4" y="26" width="92" height="48" rx="6" {...common} />
      break
    case 'triangle':
      el = <path d="M50 8 94 88H6z" strokeLinejoin="round" {...common} />
      break
    case 'star':
      el = <path d="M50 6l12.6 27.4 29.9 3.3-22.3 20.2 6.2 29.4L50 71.3 23.6 86.3l6.2-29.4L7.5 36.7l29.9-3.3z" strokeLinejoin="round" {...common} />
      break
    case 'heart':
      el = <path d="M50 88S8 62 8 34a20 20 0 0 1 42-10 20 20 0 0 1 42 10c0 28-42 54-42 54z" strokeLinejoin="round" {...common} />
      break
    case 'oval':
      el = <ellipse cx="50" cy="50" rx="44" ry="28" {...common} />
      break
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {el}
    </svg>
  )
}

/** A friendly paint blob for colour activities; the colour name is also shown as text. */
function ColorBlob({ color, size }: { color: ColorKey; size: number }) {
  return (
    <svg className={s.swatch} style={{ '--vs': `${size}px` } as CSSProperties} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M52 8c18 0 30 10 36 24 7 16 4 34-8 46-12 13-32 18-48 10C16 80 8 64 10 46 12 24 30 8 52 8z"
        fill={COLOR_HEX[color]}
        stroke={color === 'white' ? '#b9aecb' : 'rgba(0,0,0,.18)'}
        strokeWidth="3"
      />
      <ellipse cx="38" cy="32" rx="10" ry="6" fill="#fff" opacity={color === 'white' ? 0 : 0.35} />
    </svg>
  )
}

export interface VisualProps {
  v: VisualT
  lang: Lang
  size?: number
  /** Show the word/colour name under the picture. */
  label?: boolean
}

/** Text a screen reader (and a caption) should use for a visual. */
export function visualText(v: VisualT, lang: Lang): string {
  const d = dict(lang)
  switch (v.kind) {
    case 'lex':
    case 'group': {
      const e = content.lexicon.get(v.id)
      const word = e ? e[lang] : v.id
      return v.kind === 'group' ? `${numeral(v.count, lang)} ${word}` : word
    }
    case 'img':
      return ''
    case 'glyph':
      return v.text
    case 'numeral':
      return numeral(v.value, lang)
    case 'color':
      return d.colors[v.color]
    case 'shape':
      return d.shapes[v.shape]
    case 'phrase':
      return v.text[lang]
    case 'row':
      return v.items.map((i) => visualText(i, lang)).join(' ') + (v.question ? ' ?' : '')
  }
}

export function Visual({ v, lang, size = 96, label = false }: VisualProps) {
  const style = { '--vs': `${size}px` } as CSSProperties
  const text = visualText(v, lang)
  let body
  switch (v.kind) {
    case 'lex': {
      const e = content.lexicon.get(v.id)
      body = e ? <OpenMoji hex={e.image} alt={text} size={size} /> : <span className={s.placeholder} style={style} role="img" aria-label={text} />
      break
    }
    case 'img':
      body = <OpenMoji hex={v.hex} alt="" size={size} />
      break
    case 'group': {
      const e = content.lexicon.get(v.id)
      body = (
        <span className={s.group} style={style} role="img" aria-label={text}>
          {Array.from({ length: v.count }, (_, i) =>
            e ? <OpenMoji key={i} hex={e.image} alt="" size={size * 0.55} /> : <span key={i} className={s.placeholder} />,
          )}
        </span>
      )
      break
    }
    case 'glyph': {
      // Several letters ("أ ب ت", "a b c") shrink to fit the same box as one big letter.
      const letters = v.text.replace(/\s/g, '').length
      const fit = Math.min(1, 2.2 / Math.max(1, letters))
      body = (
        <span className={s.glyph} style={{ ...style, fontSize: `calc(var(--vs, 96px) * ${(0.9 * fit).toFixed(3)})` }} dir="auto">
          {v.text}
        </span>
      )
      break
    }
    case 'numeral':
      body = (
        <span className={s.glyph} style={style}>
          {numeral(v.value, lang)}
        </span>
      )
      break
    case 'color':
      body = (
        <span role="img" aria-label={text}>
          <ColorBlob color={v.color} size={size} />
        </span>
      )
      break
    case 'shape':
      body = (
        <span role="img" aria-label={text}>
          <ShapeSvg shape={v.shape} size={size} />
        </span>
      )
      break
    case 'phrase':
      body = (
        <span className={s.phrase} style={style}>
          <span lang="ar" dir="rtl" className={s.phraseAr}>
            {v.text.ar}
          </span>
          {lang === 'en' && (
            <span lang="en" className={s.phraseEn}>
              {v.text.en}
            </span>
          )}
        </span>
      )
      break
    case 'row':
      body = (
        <span className={s.row} role="img" aria-label={text}>
          {v.items.map((item, i) => (
            <Visual key={i} v={item} lang={lang} size={Math.round(size * 0.62)} />
          ))}
          {v.question && (
            <span className={s.rowQuestion} style={{ '--vs': `${Math.round(size * 0.62)}px` } as CSSProperties}>
              ?
            </span>
          )}
        </span>
      )
      break
  }
  const showLabel = label && text && v.kind !== 'glyph' && v.kind !== 'numeral' && v.kind !== 'phrase' && v.kind !== 'row'
  return (
    <span className={s.visual} style={style}>
      {body}
      {showLabel && (
        <span className={s.label} lang={lang} dir="auto">
          {text}
        </span>
      )}
    </span>
  )
}
