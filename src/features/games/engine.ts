import { useEffect, useRef } from 'react'
import type { Stage } from '../../content/games'
import type { Rng } from '../../domain/rng'
import type { Lang } from '../../domain/types'
import type { Dict } from '../../i18n'
import s from './games.module.css'

/**
 * What a round may ask of the game session. Rounds only report what happened;
 * the session owns Hala's words, sounds, stars, hints and moving on.
 */
export interface RoundCtl {
  /** Show and speak the round's instruction (repeated when the child goes quiet). */
  prompt(text: string): void
  /** The element to glow when the child needs a little help. */
  hint(get: () => Element | null | undefined): void
  /** Speak a word without changing the instruction (counting, colour names…). */
  say(text: string): void
  /** One part of a multi-part round done (a car placed, a butterfly landed). */
  step(el?: Element | null): void
  /** The round is solved. `line` is said after the praise. */
  correct(el?: Element | null, line?: string): void
  /** A gentle "let's try again" — never a penalty. */
  wrong(el?: Element | null, line?: string): void
}

export interface RoundProps {
  lang: Lang
  d: Dict
  stage: Stage
  /** Options shown at once (fewer for the youngest and on stage 1). */
  choices: number
  /** Biggest number in play. */
  maxN: number
  round: number
  locked: boolean
  rng: Rng
  ctl: RoundCtl
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/** Run once when the round appears. */
export function useMount(fn: () => void): void {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current()
  }, [])
}

/** A ref that always holds the latest render's value (read later by hint callbacks). */
export function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

export const range =(a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

// ---- little celebrations (imperative, outside React: they outlive the round) ----

function reducedMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduced' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
}

function fxLayer(): HTMLElement {
  let el = document.getElementById('game-fx')
  if (!el) {
    el = document.createElement('div')
    el.id = 'game-fx'
    el.className = s.fx ?? ''
    el.setAttribute('aria-hidden', 'true')
    document.body.append(el)
  }
  return el
}

function centerOf(el: Element) {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

const SPARKS = ['#ffc83d', '#e8613a', '#13897f', '#7a5cd6', '#d94a86', '#2f8fdb']

export function burst(el: Element | null | undefined, big: boolean): void {
  if (!el || reducedMotion()) return
  const { x, y } = centerOf(el)
  const layer = fxLayer()
  const n = big ? 16 : 9
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i')
    p.className = s.spark ?? ''
    p.style.cssText = `left:${x}px;top:${y}px;--a:${(360 / n) * i}deg;--r:${big ? 110 : 70}px;--c:${SPARKS[i % SPARKS.length]}`
    layer.append(p)
    setTimeout(() => p.remove(), 800)
  }
}

/** A star flies from the solved thing to its progress stone. */
export function flyStar(from: Element | null | undefined, to: Element | null | undefined, done: () => void): void {
  if (!from || !to || reducedMotion() || typeof (from as HTMLElement).animate !== 'function') return done()
  const a = centerOf(from)
  const b = centerOf(to)
  const star = document.createElement('span')
  star.className = s.flyingStar ?? ''
  star.textContent = '⭐'
  star.style.cssText = `left:${a.x}px;top:${a.y}px`
  fxLayer().append(star)
  const anim = star.animate(
    [{ transform: 'translate(-50%,-50%) scale(1.4)' }, { transform: `translate(calc(-50% + ${b.x - a.x}px), calc(-50% + ${b.y - a.y}px)) scale(.7)` }],
    { duration: 750, easing: 'cubic-bezier(.5,-0.4,.6,1)' },
  )
  anim.onfinish = () => {
    star.remove()
    done()
  }
}

/** Restart a one-shot CSS animation class on an element. */
export function flash(el: Element | null | undefined, className: string | undefined, ms: number): void {
  if (!el || !className) return
  el.classList.remove(className)
  void (el as HTMLElement).offsetWidth
  el.classList.add(className)
  setTimeout(() => el.classList.remove(className), ms)
}
