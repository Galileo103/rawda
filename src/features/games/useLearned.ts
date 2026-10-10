import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppState'
import { type LearnedPools, learnedPools } from '../../content/games'
import { takenLessonItems } from '../../services/repos/progress'
import { introducedSkills, lessonActivities } from '../common'

/** What the child has discovered so far, as game pools (undefined while loading). */
export function useLearnedPools(): LearnedPools | undefined {
  const { settings, langs } = useApp()
  const lang = settings.practiceLang
  return useLiveQuery(async () => {
    const lessons = lessonActivities({ disabledAreas: settings.disabledAreas, langs })
    const taken = await takenLessonItems(lessons.map((l) => l.id))
    return learnedPools(introducedSkills(taken), lang)
  }, [settings.disabledAreas.join(), langs.join(), lang])
}
