import { useEffect, useRef, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Screen, Switch, TopBar } from '../../design/ui'
import { fmt, numeral } from '../../i18n'
import s from './quran.module.css'
import { cumulativeOrder } from './sequence'
import { type RecitationTrack, useRecitation } from './useRecitation'

type Mode = 'listen' | 'link' | 'one'

/**
 * One surah: verbatim text (Tanzil Uthmani) in the Amiri Quran font, with verified recitation.
 * The text is rendered exactly as stored — never altered, generated or paraphrased.
 *
 * Layout: two big ways to start (listen to the whole surah, or memorise by linking; the card
 * playing turns into its stop button), the grown-up's listening settings in one calm panel,
 * and the mushaf, where the ayah being recited (or the child's turn) is framed.
 */
export function SurahScreen() {
  const { number } = useParams()
  const { settings, t, update } = useApp()
  const quran = content.quran
  const surah = quran?.surahs.find((x) => x.number === Number(number))
  const rec = useRecitation(settings.narrationVolume, settings.quranPause)
  const [mode, setMode] = useState<Mode>('listen')
  const mushaf = useRef<HTMLElement>(null)

  // Keep the ayah being recited in view (the mushaf can be longer than the screen).
  const nowKey = rec.current
  useEffect(() => {
    const box = mushaf.current
    if (!nowKey || !box) return
    const buttons = box.querySelectorAll('button')
    const offset = surah?.basmalaHeading ? 0 : -1
    const el = nowKey === 'basmala' ? buttons[0] : buttons[Number(nowKey) + offset]
    const still = settings.reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
  }, [nowKey, surah?.basmalaHeading, settings.reducedMotion])

  if (!quran || !surah || settings.disabledAreas.includes('islamic')) return <Navigate to="/quran" replace />
  const ui = settings.uiLang

  // Verified reciters only; the parent's choice is remembered (the default reciter otherwise).
  const reciters = quran.source.reciters ?? []
  const reciterId = reciters.find((r) => r.id === settings.quranReciter)?.id ?? reciters[0]?.id
  const fileOf = (x: { audio: string; more?: Record<string, { audio: string }> | undefined }) => (reciterId && x.more?.[reciterId]?.audio) || x.audio
  const reciterName = reciters.find((r) => r.id === reciterId)?.name[ui] ?? quran.source.reciter[ui]
  const shortName = (id: string): string | undefined => (t.quran.reciterShort as Record<string, string>)[id]

  const basmalaTrack: RecitationTrack = { key: 'basmala', file: fileOf(quran.basmala) }
  const ayahTracks: RecitationTrack[] = surah.ayahs.map((a) => ({ key: String(a.n), file: fileOf(a) }))
  const opening = surah.basmalaHeading ? [basmalaTrack] : []
  const tracks: RecitationTrack[] = [...opening, ...ayahTracks]
  // Cumulative linking: 1 · 2 · 1 2 · 3 · 1 2 3 … (the basmala once, at the start).
  const linkTracks: RecitationTrack[] = [...opening, ...cumulativeOrder(ayahTracks)]
  const canLink = surah.ayahs.length > 1

  const start = (m: Mode, list: RecitationTrack[]) => {
    setMode(m)
    rec.play(list)
  }
  const playing = !!rec.current
  // While a mode plays, its card becomes the stop button (tap again to stop).
  const on = (m: Mode) => playing && mode === m
  const toggle = (m: Mode, list: RecitationTrack[]) => (on(m) ? rec.stop() : start(m, list))

  return (
    <Screen className={s.surahScreen}>
      <TopBar
        backTo="/quran"
        backLabel={t.common.back}
        title={
          <span lang="ar" style={{ fontFamily: 'var(--font-quran)', fontSize: '1.15em' }}>
            {fmt(t.quran.surah, { name: surah.nameAr })}
            {ui === 'en' && <span style={{ fontFamily: 'var(--font)', fontSize: '0.6em', display: 'block' }}>{surah.nameTranslit}</span>}
          </span>
        }
      />

      {/* At a glance: which surah, how long, who recites. */}
      <div className={s.meta}>
        <span className={s.metaChip}>{fmt(t.quran.surahNo, { n: numeral(surah.number, ui) })}</span>
        <span className={s.metaChip}>{fmt(t.quran.ayahs, { n: numeral(surah.ayahCount, ui) })}</span>
        <span className={[s.metaChip, s.metaReciter].join(' ')}>
          <Icon name="mic" size={16} /> {(reciterId && shortName(reciterId)) ?? reciterName}
        </span>
      </div>

      {/* Two ways to start: big, picture-led, one tap. */}
      <div className={[s.modes, canLink ? '' : s.modesOne].join(' ')}>
        <button type="button" className={[s.mode, s.modeListen, on('listen') ? s.modeOn : ''].join(' ')} onClick={() => toggle('listen', tracks)} aria-pressed={on('listen')} data-testid="quran-listen">
          <span className={s.modeIcon}>
            <Icon name={on('listen') ? 'close' : 'play'} size={34} />
          </span>
          <span className={s.modeText}>
            <span className={s.modeTitle}>{on('listen') ? t.quran.stop : t.quran.listenTitle}</span>
            <span className={s.modeSub}>{t.quran.listenSub}</span>
          </span>
        </button>
        {canLink && (
          <button type="button" className={[s.mode, s.modeLink, on('link') ? s.modeOn : ''].join(' ')} onClick={() => toggle('link', linkTracks)} aria-pressed={on('link')} data-testid="quran-link">
            <span className={s.modeIcon}>
              <Icon name={on('link') ? 'close' : 'link'} size={32} />
            </span>
            <span className={s.modeText}>
              <span className={s.modeTitle}>{on('link') ? t.quran.stop : t.quran.linkTitle}</span>
              <span className={s.modeSub}>{t.quran.linkSub}</span>
              <span className={s.linkSteps} lang="ar" aria-hidden="true">
                <i>١</i>
                <i>٢</i>
                <i className={s.joined}>١ + ٢</i>
                <i>٣</i>
                <i className={s.joined}>١ + ٢ + ٣</i>
              </span>
            </span>
          </button>
        )}
      </div>

      {/* The grown-up's listening settings, together and quiet. */}
      <section className={s.panel} aria-labelledby="listen-settings">
        <h2 id="listen-settings" className={s.panelTitle}>
          <Icon name="settings" size={20} /> {t.quran.settingsTitle}
        </h2>
        {reciters.length > 1 && reciterId && (
          <div className={s.reciters} role="radiogroup" aria-label={t.quran.reciter}>
            {reciters.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={r.id === reciterId}
                className={s.reciterOpt}
                onClick={() => {
                  if (r.id === reciterId) return
                  rec.stop()
                  void update({ quranReciter: r.id })
                }}
              >
                <span className={s.reciterAvatar} aria-hidden="true">
                  <Icon name="mic" size={20} />
                </span>
                <span className={s.reciterName}>{shortName(r.id) ?? r.name[ui]}</span>
              </button>
            ))}
          </div>
        )}
        <div className={s.toggles}>
          <Switch label={t.quran.repeat} checked={rec.repeat} onChange={rec.setRepeat} />
          <Switch label={t.quran.pause} checked={settings.quranPause} onChange={(v) => void update({ quranPause: v })} />
        </div>
      </section>

      {rec.error && (
        <p className={s.error} role="alert">
          {t.quran.unavailable}
        </p>
      )}

      <article ref={mushaf} className={s.mushaf} lang="ar" dir="rtl">
        {surah.basmalaHeading && (
          <button type="button" className={[s.basmala, rec.current === 'basmala' ? s.playing : '', rec.waiting === 'basmala' ? s.waiting : ''].join(' ')} onClick={() => start('one', [basmalaTrack])}>
            <span className={s.flourish} aria-hidden="true" />
            <span className={s.ayahText}>{quran.basmala.text}</span>
            <span className={[s.flourish, s.flourishEnd].join(' ')} aria-hidden="true" />
          </button>
        )}
        {surah.ayahs.map((a) => (
          <button
            key={a.n}
            type="button"
            className={[s.ayah, rec.current === String(a.n) ? s.playing : '', rec.waiting === String(a.n) ? s.waiting : ''].join(' ')}
            onClick={() => start('one', [{ key: String(a.n), file: fileOf(a) }])}
            aria-current={rec.current === String(a.n) ? 'true' : undefined}
          >
            <span className={s.ayahText}>{a.text}</span>
            <AyahMark n={a.n} />
          </button>
        ))}
      </article>
      <p className={s.source} lang={ui}>
        {t.quran.reciter}: {reciterName} · {t.quran.source}
      </p>

    </Screen>
  )
}

/**
 * The end-of-ayah marker: an eight-pointed gold rosette with the ayah number (Arabic digits).
 * Decoration drawn by the app around the verified text, never part of it.
 */
function AyahMark({ n }: { n: number }) {
  return (
    <span className={s.mark} aria-label={numeral(n, 'ar')}>
      <svg className={s.markArt} viewBox="0 0 40 40" aria-hidden="true">
        <rect x="8.5" y="8.5" width="23" height="23" rx="3" transform="rotate(45 20 20)" />
        <rect x="8.5" y="8.5" width="23" height="23" rx="3" />
        <circle cx="20" cy="20" r="11" />
      </svg>
      <span className={s.markNum}>{numeral(n, 'ar')}</span>
    </span>
  )
}
