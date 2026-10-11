import { useLiveQuery } from 'dexie-react-hooks'
import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { letterStoryFor } from '../../content/letterStories'
import { activityById, content } from '../../content/loader'
import type { LessonItem } from '../../content/schemas'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { Screen, SpeechBubble, TopBar } from '../../design/ui'
import { Visual } from '../../design/Visual'
import { audio } from '../../services/audio/AudioService'
import { db } from '../../services/db'
import { takenLessonItems } from '../../services/repos/progress'
import { useSpeakOnMount } from '../common'
import d from '../discover/discover.module.css'
import s from './stories.module.css'

/** The Arabic letter lessons whose letters can have a story. */
export const LETTER_LESSON = 'ar-discover'

/**
 * Letter stories: the whole Arabic alphabet as one board, like the Discover board.
 * A letter with a story opens it (a book badge; a star once read to the end); letters
 * learned in a lesson are green. Letters whose story isn't written yet stay dimmed, so the
 * board keeps its alphabet shape as stories are added. Arabic only.
 */
export function LetterStories() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const lesson = activityById(LETTER_LESSON)
  const arabic = settings.practiceLang === 'ar' && !!lesson && !settings.disabledAreas.includes('stories')
  const progress = useLiveQuery(() => db.storyProgress.toArray(), [], [])
  const taken = useLiveQuery(() => takenLessonItems([LETTER_LESSON]), [], new Map<string, Set<string>>())

  useSpeakOnMount(t.stories.pickLetter, 'ar', arabic)

  if (!arabic || !lesson) return <Navigate to="/stories" replace />
  const learned = taken.get(LETTER_LESSON) ?? new Set<string>()
  const items = lesson.items as LessonItem[]

  return (
    <Screen>
      <TopBar backTo="/stories" backLabel={t.common.back} title={t.stories.letterShelf} />
      <div className={s.letterHello}>
        <Mascot mood="happy" size={86} />
        <SpeechBubble text={t.stories.pickLetter} lang="ar" />
      </div>
      <nav className={d.board} aria-label={t.stories.letterShelf} data-testid="letter-stories-board">
        {items.map((item) => {
          const story = letterStoryFor(content.stories, LETTER_LESSON, item.id)
          const read = !!story && progress.some((p) => p.storyId === story.id && p.finished)
          const known = learned.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              className={[d.tile, known ? d.learned : '', story ? '' : s.soonTile].join(' ')}
              disabled={!story}
              onClick={() => {
                if (!story) return
                audio.sfx('tap')
                navigate(`/stories/${story.id}?lang=ar`)
              }}
              aria-label={`${item.focus.kind === 'glyph' ? item.focus.text : item.id}${story ? '' : ` · ${t.stories.soon}`}`}
              data-testid={`letter-story-${item.id}`}
            >
              <Visual v={item.focus} lang="ar" size={64} />
              {story && (
                <span className={read ? s.readBadge : d.storyBadge} aria-hidden="true">
                  <Icon name={read ? 'star' : 'book'} size={16} />
                </span>
              )}
              {!story && <span className={s.soon}>{t.stories.soon}</span>}
            </button>
          )
        })}
      </nav>
    </Screen>
  )
}
