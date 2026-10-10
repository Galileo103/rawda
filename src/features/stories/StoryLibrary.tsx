import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Button, Screen, TopBar } from '../../design/ui'
import { Visual } from '../../design/Visual'
import type { Visual as VisualDef } from '../../content/schemas'
import { fmt } from '../../i18n'
import { HERO_LEX } from './Scene'
import type { Lang } from '../../domain/types'
import { db } from '../../services/db'
import { useSpeakOnMount } from '../common'
import s from './stories.module.css'

export function StoryLibrary() {
  const { settings, t, profile, named } = useApp()
  const navigate = useNavigate()
  const lang: Lang = settings.practiceLang // stories are read in the current language only
  const progress = useLiveQuery(() => db.storyProgress.toArray(), [], [])

  useSpeakOnMount(content.areas.find((a) => a.id === 'stories')?.title[lang], lang)

  return (
    <Screen>
      <TopBar backTo="/home" backLabel={t.common.home} title={t.stories.title} />
      <div className={s.grid}>
        {/* Stories starring the child come first. */}
        {[...content.stories].sort((a, b) => Number(b.personalized) - Number(a.personalized)).map((story) => {
          const p = progress.find((x) => x.storyId === story.id)
          const cover: VisualDef = story.personalized ? { kind: 'lex', id: HERO_LEX[profile.gender ?? 'n'] } : story.cover
          const canResume = !!p && !p.finished && p.page > 0
          return (
            <article key={story.id} className={s.card}>
              {/* Book cover: the story's first scene colours behind its picture. */}
              <button type="button" className={[s.cover, s[story.pages[0]?.scene.bg ?? 'meadow']].join(' ')} onClick={() => navigate(`/stories/${story.id}?lang=${lang}`)} tabIndex={-1} aria-hidden="true">
                <Visual v={cover} lang={lang} size={130} />
              </button>
              <h2 className={s.cardTitle} lang={lang} dir="auto">
                {named(story.title[lang], lang)}
              </h2>
              {story.personalized && (
                <span className={s.starring} lang={settings.uiLang}>
                  ⭐ {fmt(t.stories.starring, { name: named('@name', settings.uiLang) })}
                </span>
              )}
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
