import { childName } from '../../domain/child'
import { childComplete } from '../welcome/ChildForm'
import { useLiveQuery } from 'dexie-react-hooks'
import { type CSSProperties, useState } from 'react'
import { Icon } from '../../design/Icon'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import type { Area } from '../../content/schemas'
import { Mascot } from '../../design/Mascot'
import { Button, IconButton, Screen, SpeechBubble, StarCount } from '../../design/ui'
import { OpenMoji, Visual } from '../../design/Visual'
import { GAMES, PROP_HEX } from '../../content/games'
import { recommendNext } from '../../domain/recommend'
import type { Lang } from '../../domain/types'
import { dict, fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { content } from '../../content/loader'
import { db } from '../../services/db'
import { getMasteryMap, totalStars } from '../../services/repos/progress'
import { forRecommend, iconFor, journeyCompleted, pick, playableActivities, useSpeakOnMount, visibleAreas, voice } from '../common'
import { useReview } from '../remember/useReview'
import { VoiceToggle } from '../VoiceToggle'
import s from './home.module.css'

export function HomeScreen() {
  const { settings, profile, t, langs, usage, update } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang
  const vis = { disabledAreas: settings.disabledAreas, langs }

  const stars = useLiveQuery(totalStars, [], 0)
  // Per-area progress: distinct activities finished (stories: stories read to the end).
  const doneIds = useLiveQuery(async () => {
    const ids = new Set<string>()
    await db.completions.each((c) => ids.add(c.activityId))
    const storiesRead = (await db.storyProgress.toArray()).filter((p) => p.finished).length
    return { ids, storiesRead }
  }, [], { ids: new Set<string>(), storiesRead: 0 })
  const completed = useLiveQuery(() => journeyCompleted(vis), [settings.disabledAreas.join(), langs.join()], new Set<string>())
  const mastery = useLiveQuery(getMasteryMap, [], new Map())
  const review = useReview()

  const areas = visibleAreas(vis)
  const playGames = GAMES.filter((g) => !settings.disabledAreas.includes(g.areaId))
  const next = recommendNext(forRecommend(playableActivities(vis), lang), completed, mastery)

  useSpeakOnMount(usage.limitReached ? voice(lang).rest : voice(lang).homeHello, lang)

  const openArea = (area: Area) => {
    audio.sfx('tap')
    void audio.speak(area.title[lang], lang)
    navigate(area.route === 'map' ? `/map/${area.id}` : `/${area.route}`)
  }

  const switchLang = (l: Lang) => {
    if (l === lang) return
    audio.sfx('tap')
    void update({ practiceLang: l }) // the screen language follows (see normalizeSettings)
    void audio.speak(voice(l).homeHello, l)
  }

  // Time-of-day greeting on screen; Hala's spoken greeting names the child (their recording).
  const [morning] = useState(() => new Date().getHours() < 12)
  const name = childName(profile, settings.uiLang)
  const hello = name
    ? fmt(morning ? t.home.morning : t.home.evening, { name })
    : morning
      ? t.home.morningNoName
      : t.home.eveningNoName

  /** 0..1 progress for an area card (studio has no "progress": creativity is open-ended). */
  const progressOf = (area: Area): number | undefined => {
    if (area.route === 'studio') return undefined
    if (area.route === 'stories') return content.stories.length ? doneIds.storiesRead / content.stories.length : undefined
    const acts = playableActivities(vis, area.id)
    return acts.length ? acts.filter((a) => doneIds.ids.has(a.id)).length / acts.length : undefined
  }

  return (
    <Screen className={s.home}>
      <header className={s.header}>
        {/* Welcome banner: a little sky with Hala greeting the child. */}
        <div className={s.greeting}>
          {/* Morning: a sun and white clouds. Evening: a night sky with a crescent moon and twinkling stars. */}
          <span className={[s.sky, morning ? '' : s.night].join(' ')} aria-hidden="true" data-testid={morning ? 'sky-day' : 'sky-night'}>
            {morning ? (
              <i className={s.sun} />
            ) : (
              <>
                <i className={s.moon} />
                <i className={[s.star, s.star1].join(' ')} />
                <i className={[s.star, s.star2].join(' ')} />
                <i className={[s.star, s.star3].join(' ')} />
              </>
            )}
            <i className={s.cloud} />
            <i className={[s.cloud, s.cloud2].join(' ')} />
          </span>
          <span className={s.halaWave}>
            <Mascot mood="happy" size={120} />
          </span>
          <SpeechBubble text={hello} readAloud={!settings.narration} className={s.helloBubble} />
        </div>
        {/* Grown-up controls: small, quiet and out of the child's main area. */}
        <div className={s.grownups}>
          <VoiceToggle size={24} />
          <IconButton icon="lock" label={t.home.grownups} onClick={() => navigate('/parent')} size={24} />
        </div>
        <div className={s.kidTools}>
          {settings.learningMode === 'both' && (
            <div className={s.langToggle} role="group" aria-label={t.home.learnIn}>
              <button type="button" aria-pressed={lang === 'ar'} aria-label="العربية" lang="ar" onClick={() => switchLang('ar')}>
                ع
              </button>
              <button type="button" aria-pressed={lang === 'en'} aria-label="English" lang="en" onClick={() => switchLang('en')}>
                A
              </button>
            </div>
          )}
          {settings.rewardsEnabled && (
            <button type="button" className={s.starsPill} onClick={() => navigate('/rewards')} aria-label={`${t.home.stickers} · ${t.rewards.stars}: ${stars}`}>
              <StarCount n={stars} label={t.rewards.stars} />
              <Icon name="sticker" size={26} />
            </button>
          )}
        </div>
      </header>

      {/* Until a grown-up says boy or girl and the name (installs from before this, or a new learning language). */}
      {!childComplete({ gender: profile.gender, nameAr: profile.nameAr ?? '', nameEn: profile.nameEn ?? '' }, settings.learningMode) && (
        <button type="button" className={s.tellHala} onClick={() => navigate('/parent/settings')} data-testid="tell-hala">
          <Icon name="lock" size={22} />
          <span>
            <strong>{t.home.tellHala}</strong>
            <span>{t.home.tellHalaSub}</span>
          </span>
        </button>
      )}

      {/* Continue, Play World and the Writing room: side by side on tablets, so the subjects fit on the first screen. */}
      <div className={s.quick}>
        {review && !review.done && review.cards.length > 0 && (
          <button
            type="button"
            className={[s.continue, s.rememberBox].join(' ')}
            onClick={() => {
              audio.sfx('sparkle')
              navigate('/remember')
            }}
            data-testid="remember-box"
          >
            <span className={[s.continueIcon, s.giftShake].join(' ')} aria-hidden="true">
              <OpenMoji hex="1F381" alt="" size={64} />
            </span>
            <span className={s.continueText}>
              <span className={s.continueLabel}>{t.games.rememberCard}</span>
              <span className={s.continueTitle}>{t.games.remember}</span>
            </span>
            <span className={s.continuePlay} aria-hidden="true">
              <Icon name="play" size={34} />
            </span>
          </button>
        )}

        {next && (
          <button type="button" className={s.continue} onClick={() => navigate(`/play/${next.id}`)}>
            <span className={s.continueIcon}>
              <Visual v={iconFor(next.activity, next.lang)} lang={next.lang} size={64} />
            </span>
            <span className={s.continueText}>
              <span className={s.continueLabel}>{t.home.continue}</span>
              <span className={s.continueTitle} lang={next.lang} dir="auto">
                {pick(next.activity.title, next.lang)}
              </span>
            </span>
            <span className={s.continuePlay} aria-hidden="true">
              <Icon name="play" size={34} />
            </span>
          </button>
        )}

        {playGames.length > 0 && (
          <button
            type="button"
            className={[s.continue, s.playWorld].join(' ')}
            onClick={() => {
              audio.sfx('tap')
              void audio.speak(dict(lang).games.playWorld, lang)
              navigate('/games')
            }}
            data-testid="play-world"
          >
            <span className={s.continueIcon} aria-hidden="true">
              <OpenMoji hex={PROP_HEX.playWorld} alt="" size={64} />
            </span>
            <span className={s.continueText}>
              <span className={s.continueLabel}>{t.games.playWorldSub}</span>
              <span className={s.continueTitle}>{t.games.playWorld}</span>
            </span>
            <span className={s.continuePlay} aria-hidden="true">
              <Icon name="play" size={34} />
            </span>
          </button>
        )}

        <button
          type="button"
          className={[s.continue, s.writingRoom].join(' ')}
          onClick={() => {
            audio.sfx('tap')
            void audio.speak(dict(lang).writing.say.hello, lang)
            navigate('/write')
          }}
          data-testid="writing-room"
        >
          <span className={s.continueIcon} aria-hidden="true">
            <OpenMoji hex="270F" alt="" size={64} />
          </span>
          <span className={s.continueText}>
            <span className={s.continueLabel}>{t.writing.sub}</span>
            <span className={s.continueTitle}>{t.writing.title}</span>
          </span>
          <span className={s.continuePlay} aria-hidden="true">
            <Icon name="play" size={34} />
          </span>
        </button>
      </div>

      <nav className={s.grid} aria-label={t.map.title}>
        {areas.map((area, i) => {
          const progress = progressOf(area)
          const lit = progress === undefined ? 0 : Math.round(progress * 5)
          return (
            <button
              key={area.id}
              type="button"
              className={s.card}
              style={{ background: `linear-gradient(160deg, #fff 0%, ${area.color}33 45%, ${area.color}66 100%)`, '--accent': area.color, animationDelay: `${i * 45}ms` } as CSSProperties}
              onClick={() => openArea(area)}
            >
              <span className={s.cardIcon}>
                <Visual v={iconFor(area, lang)} lang={lang} size={iconFor(area, lang).kind === 'glyph' ? 60 : 76} />
              </span>
              <span className={s.cardTitle} lang={settings.uiLang}>
                {area.title[settings.uiLang]}
              </span>
              {/* Five little stars fill up as the child explores the area (no numbers to read). */}
              {progress !== undefined && (
                <span className={s.cardStars} aria-hidden="true">
                  {Array.from({ length: 5 }, (_, k) => (
                    <Icon key={k} name="star" size={18} className={k < lit ? s.starOn : s.starOff} />
                  ))}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {usage.limitReached && (
        <div className={s.rest} role="dialog" aria-modal="true" aria-label={t.rest.title}>
          <Mascot mood="sleep" size={200} />
          <h2>{t.rest.title}</h2>
          <p style={{ fontSize: '1.4rem', margin: 0 }}>{t.rest.body}</p>
          <Button variant="secondary" icon="lock" onClick={() => navigate('/parent')}>
            {t.rest.grownup}
          </Button>
        </div>
      )}
    </Screen>
  )
}
