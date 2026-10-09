import { useLiveQuery } from 'dexie-react-hooks'
import type { CSSProperties } from 'react'
import { Icon } from '../../design/Icon'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import type { Area } from '../../content/schemas'
import { Mascot } from '../../design/Mascot'
import { Button, IconButton, Screen, SpeechBubble, StarCount } from '../../design/ui'
import { Visual } from '../../design/Visual'
import { recommendNext } from '../../domain/recommend'
import type { Lang } from '../../domain/types'
import { fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { getMasteryMap, totalStars } from '../../services/repos/progress'
import { forRecommend, iconFor, journeyCompleted, pick, playableActivities, useSpeakOnMount, visibleAreas, voice } from '../common'
import { VoiceToggle } from '../VoiceToggle'
import s from './home.module.css'

export function HomeScreen() {
  const { settings, profile, t, langs, usage, update } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang
  const vis = { disabledAreas: settings.disabledAreas, langs }

  const stars = useLiveQuery(totalStars, [], 0)
  const completed = useLiveQuery(() => journeyCompleted(vis), [settings.disabledAreas.join(), langs.join()], new Set<string>())
  const mastery = useLiveQuery(getMasteryMap, [], new Map())

  const areas = visibleAreas(vis)
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

  const hello = profile.nickname ? fmt(t.home.hello, { name: profile.nickname }) : t.home.helloNoName

  return (
    <Screen>
      <header className={s.header}>
        <div className={s.greeting}>
          <Mascot mood="happy" size={110} />
          <SpeechBubble text={hello} readAloud={!settings.narration} />
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

      <nav className={s.grid} aria-label={t.map.title}>
        {areas.map((area, i) => (
          <button
            key={area.id}
            type="button"
            className={s.card}
            style={{ background: `linear-gradient(160deg, #fff 0%, ${area.color}33 45%, ${area.color}66 100%)`, '--accent': area.color, animationDelay: `${i * 45}ms` } as CSSProperties}
            onClick={() => openArea(area)}
          >
            <Visual v={iconFor(area, lang)} lang={lang} size={86} />
            <span className={s.cardTitle} lang={settings.uiLang}>
              {area.title[settings.uiLang]}
            </span>
          </button>
        ))}
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
