import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppState'
import { pickReview } from '../../domain/remember'
import { db } from '../../services/db'
import { rememberedToday, takenLessonItems } from '../../services/repos/progress'
import { introducedSkills, lessonActivities } from '../common'

export type Review = { done: boolean; cards: ReturnType<typeof pickReview> }

/** Today's Remember Box cards; `done` once today's box was opened (undefined while loading). */
export function useReview(): Review | undefined {
  const { settings, langs } = useApp()
  const lang = settings.practiceLang
  return useLiveQuery(async (): Promise<Review> => {
    if (await rememberedToday()) return { done: true, cards: [] }
    const lessons = lessonActivities({ disabledAreas: settings.disabledAreas, langs })
    const skills = introducedSkills(await takenLessonItems(lessons.map((l) => l.id)))
    return { done: false, cards: pickReview(await db.mastery.toArray(), skills, lang, Date.now()) }
  }, [settings.disabledAreas.join(), langs.join(), lang])
}
