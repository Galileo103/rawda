import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { Mascot } from '../../design/Mascot'
import { Button, Dialog, IconButton, Screen, TopBar } from '../../design/ui'
import { audio } from '../../services/audio/AudioService'
import { deleteDrawing, listDrawings } from '../../services/repos/drawings'
import s from './studio.module.css'

export function GalleryScreen() {
  const { t } = useApp()
  const navigate = useNavigate()
  const drawings = useLiveQuery(listDrawings, [], undefined)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <Screen>
      <TopBar backTo="/studio" backLabel={t.common.back} title={t.studio.gallery} end={<IconButton icon="plus" label={t.studio.newPage} onClick={() => navigate('/studio')} />} />
      {drawings && drawings.length === 0 && (
        <div style={{ display: 'grid', placeItems: 'center', gap: 16, flex: 1 }}>
          <Mascot mood="happy" size={150} />
          <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>{t.studio.emptyGallery}</p>
          <Button size="lg" icon="brush" onClick={() => navigate('/studio')}>
            {t.studio.title}
          </Button>
        </div>
      )}
      <div className={s.gallery}>
        {drawings?.map((d, i) => (
          <div key={d.id} className={s.thumb}>
            <button type="button" onClick={() => navigate(`/studio?open=${d.id}`)} aria-label={`${t.studio.title} ${i + 1}`}>
              <img src={d.pngDataUrl} alt="" />
            </button>
            <IconButton className={s.thumbDelete} icon="trash" label={t.common.delete} size={24} onClick={() => setConfirmId(d.id)} />
          </div>
        ))}
      </div>
      {confirmId && (
        <Dialog label={t.studio.deleteAsk} onClose={() => setConfirmId(null)}>
          <h2 style={{ margin: 0, textAlign: 'center' }}>{t.studio.deleteAsk}</h2>
          <img src={drawings?.find((d) => d.id === confirmId)?.pngDataUrl} alt="" style={{ borderRadius: 16, maxHeight: 200, objectFit: 'contain' }} />
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <IconButton icon="close" label={t.common.no} showLabel size={40} onClick={() => setConfirmId(null)} autoFocus />
            <IconButton
              icon="trash"
              label={t.common.yes}
              showLabel
              size={40}
              onClick={() => {
                audio.sfx('tap')
                void deleteDrawing(confirmId)
                setConfirmId(null)
              }}
            />
          </div>
        </Dialog>
      )}
    </Screen>
  )
}
