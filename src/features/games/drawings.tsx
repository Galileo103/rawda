import type { ReactNode } from 'react'
import type { ShapeKey } from '../../content/schemas'
import s from './games.module.css'

/** The picture that follows the finger while dragging (`useDrag` gives the position). */
export function Ghost({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className={s.ghost} style={{ left: x, top: y }} aria-hidden="true">
      {children}
    </div>
  )
}

/** A shape that stretches to fill its box (shape-builder slots and pieces). */
export function ShapeFill({ shape, fill, dashed, stretch = true }: { shape: ShapeKey; fill: string; dashed?: boolean; stretch?: boolean }) {
  const common = {
    fill,
    stroke: dashed ? 'rgba(51,38,74,.45)' : 'rgba(51,38,74,.3)',
    strokeWidth: 3,
    strokeDasharray: dashed ? '9 7' : undefined,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  let el
  switch (shape) {
    case 'circle':
    case 'oval':
      el = <ellipse cx="50" cy="50" rx="46" ry="46" {...common} />
      break
    case 'square':
    case 'rectangle':
      el = <rect x="4" y="4" width="92" height="92" rx="6" {...common} />
      break
    case 'triangle':
      el = <polygon points="50,4 96,96 4,96" {...common} />
      break
    case 'star':
      el = <polygon points="50,4 61,37 96,37 68,58 79,92 50,72 21,92 32,58 4,37 39,37" {...common} />
      break
    case 'heart':
      el = <path d="M50 90C20 68 4 50 4 30 4 14 16 4 29 4c10 0 17 6 21 14 4-8 11-14 21-14 13 0 25 10 25 26 0 20-16 38-46 60z" {...common} />
      break
  }
  return (
    <svg className={s.shapeFill} viewBox="0 0 100 100" preserveAspectRatio={stretch ? 'none' : 'xMidYMid meet'} aria-hidden="true">
      {el}
    </svg>
  )
}

export function Butterfly({ color }: { color: string }) {
  return (
    <svg className={s.butterflySvg} viewBox="0 0 100 80" aria-hidden="true">
      <g fill={color} stroke="#33264a" strokeWidth="2.5" strokeLinejoin="round">
        <g className={s.wingL}>
          <path d="M48 40C30 5 4 8 8 30c2 12 22 16 40 12z" />
          <path d="M48 44c-18 2-36 16-26 28 10 8 22-10 26-24z" />
        </g>
        <g className={s.wingR}>
          <path d="M52 40C70 5 96 8 92 30c-2 12-22 16-40 12z" />
          <path d="M52 44c18 2 36 16 26 28-10 8-22-10-26-24z" />
        </g>
      </g>
      <rect x="46" y="22" width="8" height="46" rx="4" fill="#33264a" />
      <path d="M48 24 40 8M52 24l8-16" stroke="#33264a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function Flower({ color }: { color: string }) {
  return (
    <svg className={s.flowerSvg} viewBox="0 0 100 140" aria-hidden="true">
      <rect x="47" y="60" width="6" height="80" rx="3" fill="#3f9d33" />
      <ellipse cx="34" cy="108" rx="15" ry="6" fill="#3f9d33" transform="rotate(-30 34 108)" />
      <ellipse cx="66" cy="96" rx="15" ry="6" fill="#3f9d33" transform="rotate(30 66 96)" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} cx="50" cy="24" rx="14" ry="20" fill={color} stroke="rgba(51,38,74,.35)" strokeWidth="2" transform={`rotate(${a} 50 45)`} />
      ))}
      <circle cx="50" cy="45" r="12" fill="#8a5a2b" stroke="#5e3b18" strokeWidth="2" />
    </svg>
  )
}
