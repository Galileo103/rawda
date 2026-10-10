import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { AR_LETTERS } from '../../content/games'
import { type WriteEntry, type WriteSet, WRITE_FILL_ACTIVITY, entriesOf, visibleSets } from '../../content/writing'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { IconButton, Screen, SpeechBubble } from '../../design/ui'
import { dict } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { db } from '../../services/db'
import { useSpeakOnMount } from '../common'
import s from './writing.module.css'

/** Ids of the letters the child has coloured in completely (one star each for now). */
function useWritten(): Set<string> {
  return useLiveQuery(
    async () => new Set((await db.attempts.where('activityId').equals(WRITE_FILL_ACTIVITY).toArray()).map((a) => a.itemId)),
    [],
    new Set<string>(),
  )
}

/**
 * The Writing room: pick any letter, letter form or number to colour in.
 * Tabs follow the learning languages; a star marks each one already coloured.
 */
export function WritingRoom() {
  const { t, settings, langs } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const lang = settings.practiceLang
  const sets = visibleSets(langs)
  const defaultSet: WriteSet = lang === 'en' && sets.includes('en') ? 'en' : (sets[0] ?? 'num')
  const set = sets.find((x) => x === params.get('set')) ?? defaultSet
  const written = useWritten()
  const hello = dict(lang).writing.say.hello

  useSpeakOnMount(hello, lang)

  const open = (e: WriteEntry) => {
    audio.sfx('tap')
    navigate(`/write/${e.id}`)
  }

  const tile = (e: WriteEntry, label?: string) => (
    <button key={e.id} type="button" className={s.tile} onClick={() => open(e)} data-testid={`write-${e.id}`} aria-label={label ? `${e.glyph} ${label}` : e.glyph}>
      <span className={s.tileGlyph} lang={e.lang} dir={e.lang === 'ar' ? 'rtl' : 'ltr'}>
        {e.glyph}
      </span>
      {label && <span className={s.tileLabel}>{label}</span>}
      {written.has(e.id) && (
        <span className={s.tileStar} aria-hidden="true">
          <Icon name="star" size={22} />
        </span>
      )}
    </button>
  )

  const entries = entriesOf(set, langs)

  return (
    <Screen className={s.room}>
      <div className={s.bar}>
        <IconButton icon="home" label={t.common.home} onClick={() => navigate('/home')} />
        <h1 className={s.title}>{t.writing.title}</h1>
        <IconButton icon="speaker" label={t.player.listen} onClick={() => void audio.speak(hello, lang)} />
      </div>

      <div className={s.hala}>
        <Mascot mood="happy" size={88} />
        <SpeechBubble text={hello} lang={lang} readAloud={!settings.narration} />
      </div>

      {sets.length > 1 && (
        <div className={s.tabs} role="tablist" aria-label={t.writing.title}>
          {sets.map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={x === set}
              className={s.tab}
              onClick={() => {
                audio.sfx('tap')
                setParams({ set: x }, { replace: true })
              }}
              data-testid={`write-set-${x}`}
            >
              {t.writing.sets[x]}
            </button>
          ))}
        </div>
      )}

      {set === 'arForms' ? (
        <div className={s.forms}>
          {AR_LETTERS.map((l) => (
            <div key={l.id} className={s.formRow}>
              <span className={s.formLetter} lang="ar">
                {l.glyph}
              </span>
              {entries.filter((e) => e.key === l.id).map((e) => tile(e, e.pos && t.writing.forms[e.pos]))}
            </div>
          ))}
        </div>
      ) : (
        <div className={s.grid}>{entries.map((e) => tile(e))}</div>
      )}
    </Screen>
  )
}
