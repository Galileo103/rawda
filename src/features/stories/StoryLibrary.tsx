import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { activityById, content } from '../../content/loader'
import type { StoryDef } from '../../content/schemas'
import { Icon } from '../../design/Icon'
import { Button, Screen, TopBar } from '../../design/ui'
import { Visual } from '../../design/Visual'
import type { Visual as VisualDef } from '../../content/schemas'
import { fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { LETTER_LESSON } from './LetterStories'
import { HERO_LEX } from './Scene'
import type { Lang } from '../../domain/types'
import { db } from '../../services/db'
import { takenLessonItems } from '../../services/repos/progress'
import { useSpeakOnMount } from '../common'
import s from './stories.module.css'

export function StoryLibrary() {
  const { settings, t, profile, named } = useApp()
  const navigate = useNavigate()
  const lang: Lang = settings.practiceLang // stories are read in the current language only
  const progress = useLiveQuery(() => db.storyProgress.toArray(), [], [])
  // Stories starring the child come first. Letter stories live behind one entry (Arabic only).
  const byHeroFirst = [...content.stories].sort((a, b) => Number(b.personalized) - Number(a.personalized))
  const others = byHeroFirst.filter((st) => !st.letter)
  const letterCount = lang === 'ar' ? content.stories.filter((st) => st.letter?.activityId === LETTER_LESSON).length : 0
  const lesson = activityById(LETTER_LESSON)
  const learnedCount = useLiveQuery(async () => (await takenLessonItems([LETTER_LESSON])).get(LETTER_LESSON)?.size ?? 0, [], 0)

  useSpeakOnMount(content.areas.find((a) => a.id === 'stories')?.title[lang], lang)

  return (
    <Screen>
      <TopBar backTo="/home" backLabel={t.common.home} title={t.stories.title} />
      {letterCount > 0 && lesson && (
        // One big door to the letter stories: they grow to the whole alphabet, so they get their own board.
        <button
          type="button"
          className={s.letterEntry}
          onClick={() => {
            audio.sfx('tap')
            navigate('/stories/letters')
          }}
          data-testid="letter-stories-entry"
        >
          <span className={s.letterEntryGlyphs} lang="ar" aria-hidden="true">
            أ ب ت
          </span>
          <span className={s.letterEntryText}>
            <span className={s.letterEntryTitle}>{t.stories.letterShelf}</span>
            <span className={s.letterEntrySub}>{t.stories.letterSub}</span>
            <span className={s.letterEntryCount}>
              <Icon name="book" size={18} /> {fmt(t.stories.letterCount, { n: numeral(letterCount, 'ar'), total: numeral(lesson.items.length, 'ar') })}
              {learnedCount > 0 && (
                <>
                  {' · '}
                  <Icon name="check" size={18} /> {fmt(t.stories.lettersLearned, { n: numeral(learnedCount, 'ar') })}
                </>
              )}
            </span>
          </span>
          <span className={s.letterEntryGo} aria-hidden="true">
            <Icon name="play" size={34} />
          </span>
        </button>
      )}
      {letterCount > 0 ? (
        others.length > 0 && (
          <section className={s.shelf} aria-labelledby="shelf-others" data-testid="shelf-others">
            <h2 id="shelf-others" className={s.shelfTitle}>
              {t.stories.otherShelf}
            </h2>
            <div className={s.grid}>{others.map(card)}</div>
          </section>
        )
      ) : (
        <div className={s.grid}>{others.map(card)}</div>
      )}
    </Screen>
  )

  function card(story: StoryDef) {
    const p = progress.find((x) => x.storyId === story.id)
    const hero: VisualDef | undefined = story.personalized ? { kind: 'lex', id: HERO_LEX[profile.gender ?? 'n'] } : undefined
    const canResume = !!p && !p.finished && p.page > 0
    return (
      <article key={story.id} className={s.card}>
        {/* Book cover: the story's first scene colours behind its picture. */}
        <button type="button" className={[s.cover, s[story.pages[0]?.scene.bg ?? 'meadow']].join(' ')} onClick={() => navigate(`/stories/${story.id}?lang=${lang}`)} tabIndex={-1} aria-hidden="true">
          {/* Each book shows its own picture; stories about the child also show the child. */}
          <span className={s.coverArt}>
            {hero && <Visual v={hero} lang={lang} size={120} />}
            <Visual v={story.cover} lang={lang} size={hero ? 96 : 130} />
          </span>
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
  }
}
