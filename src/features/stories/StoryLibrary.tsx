import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Button, Screen, TopBar } from '../../design/ui'
import { Visual } from '../../design/Visual'
import type { Lang } from '../../domain/types'
import { db } from '../../services/db'
import { useSpeakOnMount } from '../common'
import s from './stories.module.css'

export function StoryLibrary() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const lang: Lang = settings.practiceLang // stories are read in the current language only
  const progress = useLiveQuery(() => db.storyProgress.toArray(), [], [])

  useSpeakOnMount(content.areas.find((a) => a.id === 'stories')?.title[lang], lang)

  return (
    <Screen>
      <TopBar backTo="/home" backLabel={t.common.home} title={t.stories.title} />
      <div className={s.grid}>
        {content.stories.map((story) => {
          const p = progress.find((x) => x.storyId === story.id)
          const canResume = !!p && !p.finished && p.page > 0
          return (
            <article key={story.id} className={s.card}>
              {/* Book cover: the story's first scene colours behind its picture. */}
              <button type="button" className={[s.cover, s[story.pages[0]?.scene.bg ?? 'meadow']].join(' ')} onClick={() => navigate(`/stories/${story.id}?lang=${lang}`)} tabIndex={-1} aria-hidden="true">
                <Visual v={story.cover} lang={lang} size={130} />
              </button>
              <h2 className={s.cardTitle} lang={lang} dir="auto">
                {story.title[lang]}
              </h2>
              {p?.finished && (
                <span className={s.finished}>
                  <Icon name="check" size={22} /> {t.stories.end}
                </span>
              )}
              <div className={s.cardActions}>
                {canResume && (
                  <Button icon="play" onClick={() => navigate(`/stories/${story.id}?lang=${lang}&page=${p.page}`)}>
                    {t.stories.resume}
                  </Button>
                )}
                <Button variant={canResume ? 'secondary' : 'primary'} icon={canResume ? 'again' : 'book'} onClick={() => navigate(`/stories/${story.id}?lang=${lang}`)}>
                  {canResume ? t.stories.restart : t.stories.read}
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </Screen>
  )
}
