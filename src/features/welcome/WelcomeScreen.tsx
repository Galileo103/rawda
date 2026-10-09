import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { Mascot } from '../../design/Mascot'
import { Button, IconButton, Screen } from '../../design/ui'
import { audio } from '../../services/audio/AudioService'
import { voice } from '../common'
import s from './welcome.module.css'

export function WelcomeScreen() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const lang = settings.practiceLang

  const start = () => {
    audio.sfx('tap')
    navigate(settings.onboarded ? '/home' : '/setup')
  }

  return (
    <Screen className={s.welcome}>
      <h1 className={s.logo}>
        الرَّوْضَة
        <span className={s.logoSub} lang="en">
          Al Rawda
        </span>
      </h1>
      <button type="button" className={s.mascotBtn} onClick={() => void audio.speak(voice(lang).welcome, lang)} aria-label={voice(lang).welcome}>
        <Mascot mood="idle" size={220} />
      </button>
      <p className={s.tagline}>{t.welcome.tagline}</p>
      <Button size="lg" icon="play" onClick={start} autoFocus>
        {t.welcome.start}
      </Button>
      <IconButton className={s.grownups} icon="lock" label={t.welcome.grownups} showLabel onClick={() => navigate('/parent')} />
    </Screen>
  )
}
