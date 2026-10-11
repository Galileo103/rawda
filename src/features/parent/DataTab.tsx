import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { content } from '../../content/loader'
import { Icon } from '../../design/Icon'
import { Button, Dialog, Panel, TypedConfirm } from '../../design/ui'
import { fmt } from '../../i18n'
import { requestPersistentStorage } from '../../services/db'
import { deleteAllData, exportProgress, importProgress, resetProgress, storageEstimate } from '../../services/repos/data'
import { lockParentArea } from './ParentArea'
import s from './parent.module.css'

function mb(bytes: number): string {
  const v = bytes / (1024 * 1024)
  // Isolated left-to-right so Arabic screens show "0.1 MB", not "MB 0.1".
  return `\u2066${v < 0.1 ? '0.1' : v.toFixed(1)} MB\u2069`
}

type Msg = { ok: boolean; text: string } | null

export function DataTab() {
  const { t } = useApp()
  const P = t.parent
  const navigate = useNavigate()
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | undefined | null>(null)
  const [persisted, setPersisted] = useState(false)
  const [backupMsg, setBackupMsg] = useState<Msg>(null)
  const [resetMsg, setResetMsg] = useState<Msg>(null)
  const [confirm, setConfirm] = useState<'restore' | 'reset' | 'delete' | null>(null)
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
      setBackupMsg({ ok: true, text: P.importOk })
    } catch {
      setBackupMsg({ ok: false, text: P.importFail })
    }
  }

  // Only worth a parent's attention when something is actually wrong (or while developing).
  const showContentCheck = content.errors.length > 0 || import.meta.env.DEV

  return (
    <div className={s.stack}>
      <Panel>
        <div className={s.section}>
          <h2>{P.backupTitle}</h2>
          <p className={s.muted}>{P.backupHelp}</p>
          <div className={s.storageLine}>
            <Icon name="shield" size={22} />
            <span>{estimate ? fmt(P.storageUses, { mb: mb(estimate.usage) }) : estimate === undefined ? P.storageUnknown : '…'}</span>
            {persisted && <span className={s.okChip}>{P.persisted}</span>}
          </div>
          <div className={s.row}>
            <Button variant="teal" icon="save" onClick={() => void doExport()}>
              {P.exportBtn}
            </Button>
            <Button variant="secondary" icon="upload" onClick={() => setConfirm('restore')}>
              {P.importBtn}
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
          {backupMsg && (
            <p className={backupMsg.ok ? s.ok : s.err} role="status">
              {backupMsg.text}
            </p>
          )}
        </div>
      </Panel>

      {/* The actions that can't be undone, together and clearly marked. */}
      <section className={s.dangerZone} aria-labelledby="danger-title">
        <h2 id="danger-title" className={s.dangerTitle}>
          {P.dangerTitle}
        </h2>
        <div className={s.dangerItem}>
          <div>
            <h3>{P.reset}</h3>
            <p className={s.muted}>{P.resetHelp}</p>
            {resetMsg && (
              <p className={s.ok} role="status">
                {resetMsg.text}
              </p>
            )}
          </div>
          <Button variant="secondary" icon="again" onClick={() => setConfirm('reset')}>
            {P.reset}
          </Button>
        </div>
        <div className={s.dangerItem}>
          <div>
            <h3>{P.deleteAll}</h3>
            <p className={s.muted}>{P.deleteHelp}</p>
          </div>
          <Button variant="danger" icon="trash" onClick={() => setConfirm('delete')}>
            {P.deleteAll}
          </Button>
        </div>
      </section>

      {showContentCheck && (
        <Panel>
          <div className={s.section}>
            <h2>{P.contentCheck}</h2>
            {content.errors.length === 0 ? (
              <p className={s.ok}>{P.contentOk}</p>
            ) : (
              <>
                <p className={s.err}>{fmt(P.contentProblems, { n: content.errors.length })}</p>
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
      )}

      {confirm === 'restore' && (
        <Dialog label={P.restoreTitle} onClose={() => setConfirm(null)}>
          <h2 className={s.dialogTitle}>{P.restoreTitle}</h2>
          <p>{P.restoreBody}</p>
          <div className={s.row}>
            <Button
              variant="teal"
              icon="upload"
              onClick={() => {
                setConfirm(null)
                fileRef.current?.click()
              }}
            >
              {P.restoreConfirm}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </Dialog>
      )}
      {confirm === 'reset' && (
        <TypedConfirm
          title={P.reset}
          body={P.resetHelp}
          word={P.resetWord}
          prompt={fmt(P.resetType, { w: P.resetWord })}
          confirmLabel={P.reset}
          cancelLabel={t.common.cancel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            void resetProgress().then(() => setResetMsg({ ok: true, text: P.doneMsg }))
            setConfirm(null)
          }}
        />
      )}
      {confirm === 'delete' && (
        <TypedConfirm
          title={P.deleteAll}
          body={P.deleteHelp}
          word={P.deleteWord}
          prompt={fmt(P.deleteType, { w: P.deleteWord })}
          confirmLabel={P.deleteAll}
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
