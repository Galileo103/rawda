import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Button, Screen, Segmented, Switch, TopBar } from '../../design/ui'
import { fmt, numeral } from '../../i18n'
import s from './quran.module.css'
import { cumulativeOrder } from './sequence'
import { type RecitationTrack, useRecitation } from './useRecitation'

/**
 * One surah: verbatim text (Tanzil Uthmani) in the Amiri Quran font, with verified recitation.
 * The text is rendered exactly as stored — never altered, generated or paraphrased.
 */
export function SurahScreen() {
  const { number } = useParams()
  const { settings, t, update } = useApp()
  const quran = content.quran
  const surah = quran?.surahs.find((x) => x.number === Number(number))
  const rec = useRecitation(settings.narrationVolume, settings.quranPause)

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

  return (
    <Screen>
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
      {reciters.length > 1 && reciterId && (
        <div className={s.reciterPick}>
          <Segmented
            label={t.quran.reciter}
            value={reciterId}
            options={reciters.map((r) => ({ value: r.id, label: shortName(r.id) ?? r.name[ui] }))}
            onChange={(v) => {
              rec.stop()
              void update({ quranReciter: v })
            }}
          />
        </div>
      )}
      <div className={s.controls}>
        {rec.current ? (
          <Button variant="secondary" icon="close" onClick={rec.stop}>
            {t.quran.stop}
          </Button>
        ) : (
          <>
            <Button variant="teal" icon="play" onClick={() => rec.play(tracks)}>
              {t.quran.playAll}
            </Button>
            {surah.ayahs.length > 1 && (
              <Button icon="again" onClick={() => rec.play(linkTracks)}>
                {t.quran.playLink}
              </Button>
            )}
          </>
        )}
      </div>
      <div className={s.controls}>
        <div style={{ minWidth: 240 }}>
          <Switch label={t.quran.repeat} checked={rec.repeat} onChange={rec.setRepeat} />
        </div>
        <div style={{ minWidth: 240 }}>
          <Switch label={t.quran.pause} checked={settings.quranPause} onChange={(v) => void update({ quranPause: v })} />
        </div>
      </div>
      {surah.ayahs.length > 1 && <p className={s.hint}>{t.quran.linkHint}</p>}
      {rec.waiting && (
        <p className={s.yourTurn} role="status">
          {t.quran.yourTurn}
        </p>
      )}
      {rec.error && (
        <p className={s.error} role="alert">
          {t.quran.unavailable}
        </p>
      )}

      <article className={s.mushaf} lang="ar" dir="rtl">
        {surah.basmalaHeading && (
          <button type="button" className={[s.basmala, rec.current === 'basmala' ? s.playing : '', rec.waiting === 'basmala' ? s.waiting : ''].join(' ')} onClick={() => rec.play([basmalaTrack])}>
            <span className={s.ayahText}>{quran.basmala.text}</span>
          </button>
        )}
        {surah.ayahs.map((a) => (
          <button
            key={a.n}
            type="button"
            className={[s.ayah, rec.current === String(a.n) ? s.playing : '', rec.waiting === String(a.n) ? s.waiting : ''].join(' ')}
            onClick={() => rec.play([{ key: String(a.n), file: fileOf(a) }])}
            aria-current={rec.current === String(a.n) ? 'true' : undefined}
          >
            <span className={s.ayahText}>{a.text}</span>
            <span className={s.ayahNum} aria-label={`${a.n}`}>
              {numeral(a.n, 'ar')}
            </span>
          </button>
        ))}
      </article>
      <p className={s.source} lang={ui}>
        {t.quran.reciter}: {reciterName} · {t.quran.source}
      </p>
    </Screen>
  )
}
