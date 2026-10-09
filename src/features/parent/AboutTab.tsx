import pkg from '../../../package.json'
import { useApp } from '../../app/AppState'
import { Panel } from '../../design/ui'
import { fmt } from '../../i18n'
import s from './parent.module.css'

export function AboutTab() {
  const { t } = useApp()
  return (
    <div className={s.grid2}>
      <Panel>
        <div className={s.section}>
          <h2>{t.parent.privacyTitle}</h2>
          <ul className={s.list}>
            {t.parent.privacyPoints.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </Panel>
      <Panel>
        <div className={s.section}>
          <h2>{t.parent.creditsTitle}</h2>
          <ul className={s.list}>
            {t.parent.credits.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p style={{ margin: 0, color: 'var(--ink-soft)' }}>{fmt(t.parent.version, { v: pkg.version })}</p>
        </div>
      </Panel>
    </div>
  )
}
