import type { Rng } from '../../../domain/rng'
import type { Lang } from '../../../domain/types'

/**
 * Contract between the ActivityPlayer and every template.
 * Templates only report what happened; the player owns feedback, hints, persistence.
 */
export interface TemplateProps<I> {
  item: I
  lang: Lang
  /** 0 none · 1 replay/demonstrate · 2 fewer options · 3 show the answer. */
  hintLevel: number
  /** True while feedback plays between tasks. */
  locked: boolean
  /**
   * The task is solved. `say` = optional word to speak (e.g. the picture's name).
   * `quality` = optional 0..1 detail for the parent dashboard (tracing coverage, speech heard).
   */
  onCorrect: (say?: string, quality?: number) => void
  /** A wrong attempt (friendly feedback, never a penalty). */
  onWrong: () => void
  /** Multi-step templates: the instruction for the current step (caption, replay, try-again). */
  onInstruction?: (text: string) => void
  /** Ask for help from inside the task (e.g. "peek again"): the same path as the help button. */
  onHelp?: () => void
  rng: Rng
}
