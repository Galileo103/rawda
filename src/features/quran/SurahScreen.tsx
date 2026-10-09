import { Navigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Button, Screen, Switch, TopBar } from '../../design/ui'
import { fmt, numeral } from '../../i18n'
import s from './quran.module.css'
import { type RecitationTrack, useRecitation } from './useRecitation'

/**
 * One surah: verbatim text (Tanzil Uthmani) in the Amiri Quran font, with verified recitation.
 * The text is rendered exactly as stored — never altered, generated or paraphrased.
 */
export function SurahScreen() {
  const { number } = useParams()
  const { settings, t } = useApp()
  const quran = content.quran
  const surah = quran?.surahs.find((x) => x.number === Number(number))
  const rec = useRecitation(settings.narrationVolume)

  if (!quran || !surah || settings.disabledAreas.includes('islamic')) return <Navigate to="/quran" replace />
  const ui = settings.uiLang

  const basmalaTrack: RecitationTrack = { key: 'basmala', file: quran.basmala.audio }
  const tracks: RecitationTrack[] = [...(surah.basmalaHeading ? [basmalaTrack] : []), ...surah.ayahs.map((a) => ({ key: String(a.n), file: a.audio }))]

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
      <div className={s.controls}>
        {rec.current ? (
          <Button variant="secondary" icon="close" onClick={rec.stop}>
            {t.quran.stop}
          </Button>
        ) : (
          <Button variant="teal" icon="play" onClick={() => rec.play(tracks)}>
            {t.quran.playAll}
          </Button>
        )}
        <div style={{ minWidth: 240 }}>
          <Switch label={t.quran.repeat} checked={rec.repeat} onChange={rec.setRepeat} />
        </div>
      </div>
      {rec.error && (
        <p className={s.error} role="alert">
          {t.quran.unavailable}
        </p>
      )}

      <article className={s.mushaf} lang="ar" dir="rtl">
        {surah.basmalaHeading && (
          <button type="button" className={[s.basmala, rec.current === 'basmala' ? s.playing : ''].join(' ')} onClick={() => rec.play([basmalaTrack])}>
            <span className={s.ayahText}>{quran.basmala.text}</span>
          </button>
        )}
        {surah.ayahs.map((a) => (
          <button
            key={a.n}
            type="button"
            className={[s.ayah, rec.current === String(a.n) ? s.playing : ''].join(' ')}
            onClick={() => rec.play([{ key: String(a.n), file: a.audio }])}
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
        {t.quran.reciter}: {quran.source.reciter[ui]} · {t.quran.source}
      </p>
    </Screen>
  )
}
