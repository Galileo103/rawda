import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { AR_LETTERS } from '../../content/games'
import { type WriteEntry, type WriteSet, WRITE_FADE_ACTIVITY, WRITE_FILL_ACTIVITY, WRITE_NAME_ACTIVITY, WRITE_PATH_ACTIVITY, entriesOf, nameEntry, visibleSets } from '../../content/writing'
import { Icon } from '../../design/Icon'
import { Mascot } from '../../design/Mascot'
import { IconButton, Screen, SpeechBubble } from '../../design/ui'
import { dict, fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { db } from '../../services/db'
import { useSpeakOnMount } from '../common'
import s from './writing.module.css'

/** How many steps (coloured in, written along the path, by herself) the child has finished for each letter. */
function useWritten(): Map<string, number> {
  return useLiveQuery(
    async () => {
      const rows = await db.attempts.where('activityId').anyOf(WRITE_FILL_ACTIVITY, WRITE_PATH_ACTIVITY, WRITE_FADE_ACTIVITY, WRITE_NAME_ACTIVITY).toArray()
      const steps = new Map<string, Set<string>>()
      for (const r of rows) steps.set(r.itemId, (steps.get(r.itemId) ?? new Set()).add(r.activityId))
      return new Map([...steps].map(([id, done]) => [id, done.size]))
    },
    [],
    new Map<string, number>(),
  )
}

/**
 * The Writing room: pick any letter, letter form or number to colour in.
 * Tabs follow the learning languages; a star marks each one already coloured.
 */
export function WritingRoom() {
  const { t, settings, langs, profile } = useApp()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const lang = settings.practiceLang
  // Her own name, in each language she is learning (when a grown-up has written it in).
  const names = [langs.includes('ar') ? nameEntry('ar', profile.nameAr) : undefined, langs.includes('en') ? nameEntry('en', profile.nameEn) : undefined].filter((e): e is WriteEntry => !!e)
  const sets: WriteSet[] = [...visibleSets(langs), ...(names.length ? (['name'] as const) : [])]
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
    <button key={e.id} type="button" className={[s.tile, e.set === 'name' ? s.nameTile : ''].join(' ')} onClick={() => open(e)} data-testid={`write-${e.id}`} aria-label={label ? `${e.glyph} ${label}` : e.glyph}>
      <span className={s.tileGlyph} lang={e.lang} dir={e.lang === 'ar' ? 'rtl' : 'ltr'}>
        {e.glyph}
      </span>
      {label && <span className={s.tileLabel}>{label}</span>}
      {(written.get(e.id) ?? 0) > 0 && (
        <span className={s.tileStar} aria-hidden="true">
          {Array.from({ length: written.get(e.id) ?? 0 }, (_, i) => (
            <Icon key={i} name="star" size={20} />
          ))}
        </span>
      )}
    </button>
  )

  const entries = set === 'name' ? names : entriesOf(set, langs)
  const done = entries.filter((e) => (written.get(e.id) ?? 0) > 0).length
  // English letters come as big + small pairs (A a, B b…): one card each, so a pair never splits across rows.
  const pairs = set === 'en' ? Array.from({ length: Math.ceil(entries.length / 2) }, (_, i) => entries.slice(i * 2, i * 2 + 2)) : []

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

      {entries.length > 0 && (
        <div className={s.summary} data-testid="write-summary">
          <Icon name="star" size={26} />
          <span className={s.summaryText}>{fmt(t.writing.done, { n: done, total: entries.length })}</span>
          <div className={s.summaryBar} role="progressbar" aria-label={t.writing.sets[set]} aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={done}>
            <span style={{ width: `${Math.round((done / entries.length) * 100)}%` }} />
          </div>
        </div>
      )}

      {set === 'en' ? (
        <div className={s.pairGrid}>
          {pairs.map((pair) => (
            <div key={pair[0]?.id} className={s.pair} data-testid={`write-pair-${pair[0]?.key}`}>
              {pair.map((e) => tile(e))}
            </div>
          ))}
        </div>
      ) : set === 'arForms' ? (
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
