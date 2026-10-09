import { Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Screen, TopBar } from '../../design/ui'
import { fmt, numeral } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import s from './quran.module.css'

/** List of surahs. Hidden entirely when a parent switches the Islamic area off. */
export function QuranScreen() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const quran = content.quran
  if (!quran || settings.disabledAreas.includes('islamic')) return <Navigate to="/home" replace />
  const ui = settings.uiLang

  return (
    <Screen>
      <TopBar backTo="/map/islamic" backLabel={t.common.back} title={t.quran.title} />
      <p className={s.note}>
        <Icon name="help" /> {t.quran.note}
      </p>
      <div className={s.list}>
        {quran.surahs.map((surah) => (
          <button
            key={surah.number}
            type="button"
            className={s.surahCard}
            onClick={() => {
              audio.sfx('tap')
              navigate(`/quran/${surah.number}`)
            }}
          >
            <span className={s.surahNum}>{numeral(surah.number, ui)}</span>
            <span>
              <span className={s.surahName} lang="ar" dir="rtl">
                {surah.nameAr}
              </span>
              <span className={s.surahSub}>
                {ui === 'en' ? `${surah.nameTranslit} · ` : ''}
                {fmt(t.quran.ayahs, { n: numeral(surah.ayahCount, ui) })}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Screen>
  )
}
