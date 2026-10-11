import type { SVGProps } from 'react'

/** Simple rounded stroke icons (original). Directional ones get `flip-rtl`. */
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-5h3v5h5V10',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  speaker: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7',
  chart: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  mute:'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9.5l5 5M20.5 9.5l-5 5',
  help: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  close: 'M6 6l12 12M18 6 6 18',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.7 1-5.9-4.3-4.1 5.9-.8z',
  undo: 'M9 7 4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H12',
  eraser: 'M8.5 19.5h11M4.6 14.6 14 5.2a2 2 0 0 1 2.8 0l2.4 2.4a2 2 0 0 1 0 2.8l-8.7 8.7a2 2 0 0 1-1.4.6H8.2a2 2 0 0 1-1.4-.6l-2.2-2.2a1.6 1.6 0 0 1 0-2.3zM9 10.2l5.2 5.2',
  brush: 'M14.5 4.5l5 5-7.5 7.5-5-5zM7 12l-2.5 2.5c-1 1-1 3.5-.5 5 1.5.5 4 .5 5-.5L11.5 16.5',
  fill: 'M5 11.5 11.5 5l7 7-6.5 6.5a2 2 0 0 1-2.8 0L5 14.3a2 2 0 0 1 0-2.8zM5 12h13.5M20 16.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z',
  save: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14',
  upload: 'M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14',
  clock: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2',
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20.5a7.5 7.5 0 0 1 15 0',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  globe: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5M12 3.5C9.5 6 8.5 9 8.5 12s1 6 3.5 8.5',
  shield: 'M12 3.5 19 6v5.5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6z',
  gallery: 'M4 5.5h16v13H4zM4 15l4.5-4.5 4 4 2.5-2.5 5 5M15.5 9.5h.01',
  play: 'M8 5.5v13l10.5-6.5z',
  pause: 'M8.5 5.5v13M15.5 5.5v13',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  lock: 'M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  trash: 'M5 7h14M10 4h4M7 7l1 13h8l1-13M10.5 11v5.5M13.5 11v5.5',
  plus: 'M12 5v14M5 12h14',
  sticker: 'M5 5h14v9l-5 5H5zM14 19v-5h5',
  shapes: 'M4.5 13.5h6.5V20H4.5zM16.5 4.5l4 7h-8zM16.5 14a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z',
  book: 'M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V20',
  settings: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8',
  again: 'M19 12a7 7 0 1 1-2.1-5M19 4.5V9h-4.5',
  map: 'M9 4.5 4 6.5v13l5-2 6 2 5-2v-13l-5 2zM9 4.5v13M15 6.5v13',
  pencil: 'M15.5 4.5l4 4L9 19H5v-4zM13 7l4 4',
  hand: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-5-2.7L4 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5',
} as const

export type IconName = keyof typeof PATHS
// Media "play" is not mirrored in RTL (platform convention); navigation arrows are.
const DIRECTIONAL: ReadonlySet<IconName> = new Set(['back', 'next', 'undo'])

export function Icon({ name, size = 28, className, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  const filled = name === 'star' || name === 'play'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={[DIRECTIONAL.has(name) ? 'flip-rtl' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
