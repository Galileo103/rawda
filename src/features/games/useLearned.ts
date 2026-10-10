import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppState'
import { letterLessonWords, monsterWords, sillyWordOk } from '../../content/funGames'
import { type LearnedPools, learnedPools, lettersFor } from '../../content/games'
import { content } from '../../content/loader'
import { takenLessonItems } from '../../services/repos/progress'
import { introducedSkills, lessonActivities } from '../common'

/** What the child has discovered so far, as game pools (undefined while loading). */
export function useLearnedPools(): LearnedPools | undefined {
  const { settings, langs } = useApp()
  const lang = settings.practiceLang
  return useLiveQuery(async () => {
    const lessons = lessonActivities({ disabledAreas: settings.disabledAreas, langs })
    const taken = await takenLessonItems(lessons.map((l) => l.id))
    // Picture words shown in the lessons the child took (Silly Hala names them).
    const words = new Set<string>()
    for (const a of lessons) {
      const done = taken.get(a.id)
      if (!done) continue
      for (const item of a.items) if (done.has(item.id) && 'examples' in item) for (const w of item.examples as string[]) words.add(w)
    }
    // Each letter lesson's words that really start with that letter (Hungry Monster's menu).
    const byLetter = letterLessonWords(content.activities, lang)
    const letterWords = new Map(lettersFor(lang).map((l) => [l.id, monsterWords(l, byLetter.get(l.id) ?? [], content.lexicon, lang).map((e) => e.id)]))
    return learnedPools(introducedSkills(taken), lang, { words: [...words].filter((w) => sillyWordOk(content.lexicon.get(w))), letterWords })
  }, [settings.disabledAreas.join(), langs.join(), lang])
}
