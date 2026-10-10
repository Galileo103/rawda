import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Mascot } from '../../design/Mascot'
import { Screen, StarCount, TopBar } from '../../design/ui'
import { OpenMoji } from '../../design/Visual'
import { numeral } from '../../i18n'
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
          {/* How full the sticker book is, as a bar a child can see grow. */}
          <div className={s.bookProgress} role="progressbar" aria-valuemin={0} aria-valuemax={content.rewards.length} aria-valuenow={owned.size}>
            <span style={{ width: `${(owned.size / Math.max(1, content.rewards.length)) * 100}%` }} />
            <b>
              <bdi dir="ltr">{`${numeral(owned.size, settings.uiLang)} / ${numeral(content.rewards.length, settings.uiLang)}`}</bdi>
            </b>
          </div>
          {owned.size === 0 && <p style={{ textAlign: 'center', fontWeight: 800, margin: 0 }}>{t.rewards.empty}</p>}
          <div className={s.grid}>
            {[...content.rewards].sort((a, b) => Number(owned.has(b.id)) - Number(owned.has(a.id))).map((r) => {
              const has = owned.has(r.id)
              return has ? (
                <button key={r.id} type="button" className={s.sticker} onClick={() => void audio.speak(r.name[lang], lang)}>
                  <OpenMoji hex={r.hex} alt="" size={84} />
                  <span lang={settings.uiLang}>{r.name[settings.uiLang]}</span>
                </button>
              ) : (
                <div key={r.id} className={[s.sticker, s.locked].join(' ')} aria-label={t.rewards.notYet}>
                  <OpenMoji hex={r.hex} alt="" size={72} />
                </div>
              )
            })}
          </div>
        </>
      )}
    </Screen>
  )
}
