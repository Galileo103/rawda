import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content, storyById } from '../../content/loader'
import type { Reward, Story } from '../../content/schemas'
import { Mascot, type MascotMood } from '../../design/Mascot'
import { Button, IconButton, Screen, SpeechBubble, TopBar } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import { resolveGender } from '../../domain/child'
import { defaultRng } from '../../domain/rng'
import type { Lang } from '../../domain/types'
import { fmt, otherLang } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { finishStory, recordItemResult, saveStoryPage } from '../../services/repos/progress'
import { randomLine, voice } from '../common'
import a from '../activities/activities.module.css'
import { ChoiceTemplate } from '../activities/templates/ChoiceTemplate'
import { Scene } from './Scene'
import s from './stories.module.css'

/** Render text with {highlighted} vocabulary words. */
function richText(text: string): ReactNode[] {
  return text.split(/(\{[^}]+\})/g).map((part, i) =>
    part.startsWith('{') ? (
      <mark key={i} className={s.word}>
        {part.slice(1, -1)}
      </mark>
    ) : (
      part
    ),
  )
}

export function StoryReader() {
  const { storyId } = useParams()
  const [params] = useSearchParams()
  const { settings, langs, profile } = useApp()
  const def = storyId ? storyById(storyId) : undefined
  // The story in this child's form: "he" or "she", the boy or girl picture.
  const story = useMemo(() => def && resolveGender(def, profile.gender), [def, profile.gender])
  if (!story) return <Navigate to="/stories" replace />
  const requested = params.get('lang')
  const lang: Lang = requested === 'ar' || requested === 'en' ? requested : settings.practiceLang
  const startPage = Math.min(Math.max(0, Number(params.get('page') ?? 0) || 0), story.pages.length - 1)
  return <Reader story={story} lang={langs.includes(lang) ? lang : (langs[0] ?? 'ar')} startPage={startPage} />
}

type Phase = 'pages' | 'questions' | 'end'

function Reader({ story, lang, startPage }: { story: Story; lang: Lang; startPage: number }) {
  const { settings, t, langs, named } = useApp()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('pages')
  const [page, setPage] = useState(startPage)
  const [q, setQ] = useState(0)
  const [misses, setMisses] = useState(0)
  const [locked, setLocked] = useState(false)
  const [mood, setMood] = useState<MascotMood>('idle')
  const [bubble, setBubble] = useState('')
  const [rewards, setRewards] = useState<Reward[]>([])
  const v = voice(lang)
  const current = story.pages[page]
  // With voice on, the grown-up's question hides behind a small button (reset on each page).
  const [askOpenOn, setAskOpenOn] = useState<number | null>(null)

  useEffect(() => () => audio.stop(), [])

  // Narrate each page and remember where we are.
  useEffect(() => {
    if (phase !== 'pages' || !current) return
    void audio.speak(current.text[lang], lang)
    void saveStoryPage(story.id, page, lang).catch(() => undefined)
  }, [phase, page, current, lang, story.id])

  const question = story.questions[q]
  useEffect(() => {
    if (phase !== 'questions' || !question) return
    const say = question.say[lang] ?? ''
    setBubble(say)
    setMood('idle')
    void audio.speak(say, lang)
  }, [phase, q, question, lang])

  const end = useCallback(async () => {
    setPhase('end')
    audio.sfx('complete')
    const fresh = await finishStory(story.id, lang, content.rewards).catch(() => [])
    setRewards(fresh)
    void audio.speakAll([{ text: v.theEnd, lang }, ...(settings.rewardsEnabled && fresh.length ? [{ text: v.sticker, lang }] : [])])
  }, [story.id, lang, v, settings.rewardsEnabled])

  const nextPage = () => {
    audio.sfx('tap')
    if (page + 1 < story.pages.length) setPage(page + 1)
    else if (story.questions.length > 0) {
      setPhase('questions')
      void audio.speak(v.storyQuestions, lang)
    } else void end()
  }

  const onCorrect = (say?: string) => {
    if (!question || locked) return
    setLocked(true)
    setMood('cheer')
    audio.sfx('correct')
    const praise = randomLine(v.praise)
    setBubble(praise)
    void recordItemResult({
      activityId: `story.${story.id}`,
      itemId: question.id,
      skill: question.skill,
      areaId: 'stories',
      lang,
      firstTry: misses === 0,
      misses,
      hintsUsed: 0,
      durationMs: 0,
    }).catch(() => undefined)
    void Promise.all([audio.speakAll([...(say ? [{ text: say, lang }] : []), { text: praise, lang }]), new Promise((r) => setTimeout(r, 1000))]).then(() => {
      setLocked(false)
      setMisses(0)
      if (q + 1 < story.questions.length) setQ(q + 1)
      else void end()
    })
  }

  const onWrong = () => {
    audio.sfx('try')
    setMood('think')
    setMisses((m) => m + 1)
    const line = randomLine(v.tryAgain)
    setBubble(line)
    void audio.speakAll([
      { text: line, lang },
      { text: question?.say[lang] ?? '', lang },
    ])
  }

  const title = named(story.title[lang], lang)

  if (phase === 'end') {
    return (
      <Screen>
        <div className={a.center}>
          <Mascot mood="cheer" size={170} />
          <h1 className={a.title}>{t.stories.end}</h1>
          {settings.rewardsEnabled && rewards.length > 0 && (
            <div className={a.stickers}>
              {rewards.map((r) => (
                <div key={r.id} className={a.sticker}>
                  <OpenMoji hex={r.hex} alt={r.name[settings.uiLang]} size={110} />
                  <span>{t.completion.newSticker}</span>
                </div>
              ))}
            </div>
          )}
          <div className={a.actions}>
            <Button variant="secondary" icon="again" onClick={() => navigate(`/stories/${story.id}?lang=${lang}`, { replace: true })}>
              {t.stories.restart}
            </Button>
            <Button icon="book" onClick={() => navigate('/stories')}>
              {t.stories.title}
            </Button>
            <Button variant="teal" icon="home" onClick={() => navigate('/home')}>
              {t.common.home}
            </Button>
          </div>
        </div>
      </Screen>
    )
  }

  if (phase === 'questions' && question) {
    return (
      <Screen>
        <TopBar backTo="/stories" backLabel={t.common.back} title={t.stories.questions} />
        <div className={a.guide}>
          <Mascot mood={mood} size={96} />
          {(settings.captions || !settings.narration) && <SpeechBubble text={bubble} lang={lang} readAloud={!settings.narration} />}
        </div>
        <ChoiceTemplate key={question.id} item={question} pool={[]} lang={lang} hintLevel={Math.min(3, misses)} locked={locked} onCorrect={onCorrect} onWrong={onWrong} rng={defaultRng} />
      </Screen>
    )
  }

  if (!current) return <Navigate to="/stories" replace />
  const isLast = page + 1 >= story.pages.length
  const other = otherLang(lang)

  return (
    <Screen>
      <TopBar backTo="/stories" backLabel={t.common.back} title={<span lang={lang}>{title}</span>} />
      <Scene scene={current.scene} lang={lang} />
      <p className={s.text} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {richText(named(current.text[lang], lang))}
      </p>
      {current.prompt && (
        // Dialogic reading: a question for the grown-up to ask. Shown only, never spoken by Hala.
        <div className={s.askWrap}>
          {settings.narration && (
            <IconButton
              icon="help"
              label={t.stories.askChild}
              showLabel
              aria-expanded={askOpenOn === page}
              className={s.askBtn}
              onClick={() => setAskOpenOn(askOpenOn === page ? null : page)}
              size={24}
            />
          )}
          {(!settings.narration || askOpenOn === page) && (
            <p className={s.ask} data-testid="ask-child">
              <span className={s.askLabel}>{t.stories.askChild}</span>
              <span lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {named(current.prompt[lang], lang)}
              </span>
            </p>
          )}
        </div>
      )}
      {current.vocab.length > 0 && (
        <div className={s.vocab} aria-label={t.stories.vocab}>
          {current.vocab.map((id) => {
            const e = content.lexicon.get(id)
            if (!e) return null
            return (
              <button
                key={id}
                type="button"
                className={s.vocabBtn}
                onClick={() => void audio.speak(e[lang], lang)}
              >
                <OpenMoji hex={e.image} alt="" size={52} />
                <span lang={lang}>{e[lang]}</span>
                {langs.includes(other) && (
                  <span lang={other} style={{ color: 'var(--ink-soft)' }}>
                    · {e[other]}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      <div className={s.controls}>
        <IconButton icon="back" label={t.common.previous} disabled={page === 0} onClick={() => setPage(Math.max(0, page - 1))} size={36} />
        {settings.narration && <IconButton icon="speaker" label={t.player.listen} onClick={() => void audio.speak(current.text[lang], lang)} size={36} />}
        {/* Page dots instead of "1 / 6": a child can see how much of the story is left. */}
        <span className={s.pageDots} role="img" aria-label={fmt(t.stories.page, { n: page + 1, total: story.pages.length })}>
          {story.pages.map((_, i) => (
            <i key={i} className={i === page ? s.dotNow : i < page ? s.dotDone : undefined} />
          ))}
        </span>
        <Button icon={isLast ? 'check' : 'next'} onClick={nextPage} autoFocus>
          {isLast ? t.stories.finish : t.common.next}
        </Button>
      </div>
    </Screen>
  )
}
