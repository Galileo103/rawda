import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Mascot } from '../../design/Mascot'
import { Screen, StarCount, TopBar } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import { audio } from '../../services/audio/AudioService'
import { ownedRewardIds, totalStars } from '../../services/repos/progress'
import s from './rewards.module.css'

/** Sticker book. No shop, no purchases, nothing can be lost. */
export function RewardsScreen() {
  const { settings, t } = useApp()
  const lang = settings.practiceLang
  const owned = useLiveQuery(ownedRewardIds, [], new Set<string>())
  const stars = useLiveQuery(totalStars, [], 0)

  return (
    <Screen>
      <TopBar backTo="/home" backLabel={t.common.home} title={t.rewards.title} />
      {!settings.rewardsEnabled ? (
        <p style={{ textAlign: 'center', fontWeight: 800 }}>{t.rewards.off}</p>
      ) : (
        <>
          <div className={s.summary}>
            <Mascot mood={owned.size ? 'happy' : 'idle'} size={100} />
            <StarCount n={stars} label={t.rewards.stars} />
          </div>
          {owned.size === 0 && <p style={{ textAlign: 'center', fontWeight: 800, margin: 0 }}>{t.rewards.empty}</p>}
          <div className={s.grid}>
            {content.rewards.map((r) => {
              const has = owned.has(r.id)
              return has ? (
                <button key={r.id} type="button" className={s.sticker} onClick={() => void audio.speak(r.name[lang], lang)}>
                  <OpenMoji hex={r.hex} alt="" size={84} />
                  <span lang={settings.uiLang}>{r.name[settings.uiLang]}</span>
                </button>
              ) : (
                <div key={r.id} className={[s.sticker, s.locked].join(' ')} aria-label={t.rewards.notYet}>
                  <OpenMoji hex={r.hex} alt="" size={84} />
                  <span>?</span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Screen>
  )
}
