import pkg from '../../../package.json'
import { useApp } from '../../app/AppState'
import { Icon } from '../../design/Icon'
import { fmt } from '../../i18n'
import { Fold } from './Fold'
import s from './parent.module.css'

export function AboutTab() {
  const { t } = useApp()
  return (
    <div className={s.stack}>
      <section className={s.section} aria-labelledby="privacy-title">
        <h2 id="privacy-title">{t.parent.privacyTitle}</h2>
        <ul className={s.checkList}>
          {t.parent.privacyPoints.map((p) => (
            <li key={p}>
              <span className={s.checkBadge} aria-hidden="true">
                <Icon name="check" size={20} />
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>
      <Fold id="credits" title={t.parent.creditsTitle}>
        <ul className={s.list}>
          {t.parent.credits.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Fold>
      <p className={s.disclaimer}>{fmt(t.parent.version, { v: pkg.version })}</p>
    </div>
  )
}
