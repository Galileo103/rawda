import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Button, Panel, TypedConfirm } from '../../design/ui'
import { fmt } from '../../i18n'
import { requestPersistentStorage } from '../../services/db'
import { deleteAllData, exportProgress, importProgress, resetProgress, storageEstimate } from '../../services/repos/data'
import { lockParentArea } from './ParentArea'
import s from './parent.module.css'

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DataTab() {
  const { t } = useApp()
  const navigate = useNavigate()
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | undefined | null>(null)
  const [persisted, setPersisted] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void storageEstimate().then(setEstimate)
    void requestPersistentStorage().then(setPersisted)
  }, [])

  const doExport = async () => {
    const data = await exportProgress()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rawda-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const doImport = async (file: File) => {
    try {
      await importProgress(JSON.parse(await file.text()))
      setMsg({ ok: true, text: t.parent.importOk })
    } catch {
      setMsg({ ok: false, text: t.parent.importFail })
    }
  }

  return (
    <div className={s.section}>
      <Panel>
        <div className={s.section}>
          <h2>{t.parent.storage}</h2>
          <p style={{ margin: 0 }}>{estimate ? <bdi dir="ltr">{`${mb(estimate.usage)} / ${mb(estimate.quota)}`}</bdi> : estimate === undefined ? t.parent.storageUnknown : '…'}</p>
          {persisted && <p className={s.ok}>{t.parent.persisted}</p>}
          <div className={s.row}>
            <Button variant="teal" icon="save" onClick={() => void doExport()}>
              {t.parent.exportBtn}
            </Button>
            <Button variant="secondary" icon="plus" onClick={() => fileRef.current?.click()}>
              {t.parent.importBtn}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doImport(f)
                e.target.value = ''
              }}
            />
          </div>
          {msg && <p className={msg.ok ? s.ok : s.err}>{msg.text}</p>}
        </div>
      </Panel>

      <Panel>
        <div className={s.section}>
          <h2>{t.parent.reset}</h2>
          <p style={{ margin: 0 }}>{t.parent.resetHelp}</p>
          <div>
            <Button variant="secondary" icon="again" onClick={() => setConfirm('reset')}>
              {t.parent.reset}
            </Button>
          </div>
        </div>
      </Panel>

      {/* The one action that can't be undone, on its own and clearly marked. */}
      <Panel className={s.dangerZone}>
        <div className={s.section}>
          <h2>{t.parent.deleteAll}</h2>
          <p style={{ margin: 0 }}>{t.parent.deleteHelp}</p>
          <div>
            <Button variant="danger" icon="trash" onClick={() => setConfirm('delete')}>
              {t.parent.deleteAll}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className={s.section}>
          <h2>{t.parent.contentCheck}</h2>
          {content.errors.length === 0 ? (
            <p className={s.ok}>{t.parent.contentOk}</p>
          ) : (
            <>
              <p className={s.err}>{fmt(t.parent.contentProblems, { n: content.errors.length })}</p>
              <ul className={s.list} dir="ltr">
                {content.errors.slice(0, 20).map((e) => (
                  <li key={e}>
                    <code>{e}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Panel>

      {confirm === 'reset' && (
        <TypedConfirm
          title={t.parent.reset}
          body={t.parent.resetHelp}
          word="RESET"
          prompt={t.parent.resetType}
          confirmLabel={t.parent.reset}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void resetProgress().then(() => setMsg({ ok: true, text: t.parent.doneMsg }))
            setConfirm(null)
          }}
        />
      )}
      {confirm === 'delete' && (
        <TypedConfirm
          title={t.parent.deleteAll}
          body={t.parent.deleteHelp}
          word="DELETE"
          prompt={t.parent.deleteType}
          confirmLabel={t.parent.deleteAll}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null)
            void deleteAllData().then(() => {
              lockParentArea()
              navigate('/', { replace: true })
            })
          }}
        />
      )}
    </div>
  )
}
