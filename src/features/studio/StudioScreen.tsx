import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/AppState'
import { assetUrl, emojiFromHex, openmojiUrl } from '../../content/assets'
import { content } from '../../content/loader'
import { COLOR_KEYS, type ColorKey } from '../../content/schemas'
import { Icon, type IconName } from '../../design/Icon'
import { Button, Dialog, IconButton, Screen } from '../../design/ui'
import { COLOR_HEX, OpenMoji, ShapeSvg } from '../../design/Visual'
import { fmt } from '../../i18n'
import { audio } from '../../services/audio/AudioService'
import { grantEarnedRewards } from '../../services/repos/progress'
import { getDrawing, saveDrawing } from '../../services/repos/drawings'
import { voice } from '../common'
import { CANVAS_H, CANVAS_W, floodFill, hexToRgba, loadImage, shapePath } from './canvasTools'
import s from './studio.module.css'

type Tool = 'brush' | 'eraser' | 'fill' | 'stamp' | 'shape'
type StampShape = 'circle' | 'square' | 'triangle' | 'star' | 'heart'
const SIZES = [10, 22, 44]
const SHAPES: StampShape[] = ['circle', 'square', 'triangle', 'star', 'heart']
const MAX_UNDO = 20

/**
 * Creative studio: brushes, eraser, paint bucket, stamps, shapes, coloring pages, undo, save.
 * Works fully offline; artwork is stored only on this device. Unsaved work is saved automatically
 * before leaving, so nothing a child made is ever lost by accident.
 */
export function StudioScreen() {
  const { settings, t } = useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const lang = settings.practiceLang

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const undoStack = useRef<ImageData[]>([])
  const boundary = useRef<ImageData | null>(null)
  const overlayImg = useRef<HTMLImageElement | null>(null)
  const drawing = useRef<{ x: number; y: number } | null>(null)
  const dirty = useRef(false)

  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState<ColorKey>('blue')
  const [size, setSize] = useState(1)
  const [stamp, setStamp] = useState(content.studio.stamps[0] ?? '2B50')
  const [shape, setShape] = useState<StampShape>('circle')
  const [tray, setTray] = useState<'stamps' | 'shapes' | null>(null)
  const [pageId, setPageId] = useState<string | undefined>()
  const [drawingId, setDrawingId] = useState<string | undefined>()
  const [choosingPage, setChoosingPage] = useState(false)
  const [undoCount, setUndoCount] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const ctx = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null
  const page = content.studio.pages.find((p) => p.id === pageId)

  // Coloring page lines: shown as an overlay, and rasterised once as walls for the paint bucket.
  useEffect(() => {
    boundary.current = null
    overlayImg.current = null
    if (!page) return
    let cancelled = false
    loadImage(assetUrl(`coloring/${page.file}`))
      .then((img) => {
        if (cancelled) return
        overlayImg.current = img
        const off = document.createElement('canvas')
        off.width = CANVAS_W
        off.height = CANVAS_H
        const o = off.getContext('2d')
        if (!o) return
        o.drawImage(img, 0, 0, CANVAS_W, CANVAS_H)
        boundary.current = o.getImageData(0, 0, CANVAS_W, CANVAS_H)
      })
      .catch(() => undefined) // missing page art: still drawable, just no walls
    return () => {
      cancelled = true
    }
  }, [page])

  // Reopen a saved drawing from the gallery.
  useEffect(() => {
    const openId = params.get('open')
    if (!openId) {
      void audio.speak(voice(lang).drawHello, lang)
      return
    }
    void getDrawing(openId).then(async (d) => {
      const c = ctx()
      if (!d || !c) return
      setDrawingId(d.id)
      setPageId(d.pageId)
      try {
        const img = await loadImage(d.layerDataUrl)
        c.clearRect(0, 0, CANVAS_W, CANVAS_H)
        c.drawImage(img, 0, 0)
      } catch {
        /* corrupted image: start with an empty layer instead of crashing */
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushUndo = () => {
    const c = ctx()
    if (!c) return
    undoStack.current.push(c.getImageData(0, 0, CANVAS_W, CANVAS_H))
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift()
    setUndoCount(undoStack.current.length)
    dirty.current = true
  }

  const undo = () => {
    const c = ctx()
    const prev = undoStack.current.pop()
    if (!c || !prev) return
    audio.sfx('tap')
    c.putImageData(prev, 0, 0)
    setUndoCount(undoStack.current.length)
    dirty.current = true
  }

  const toCanvas = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) * CANVAS_W) / r.width, y: ((e.clientY - r.top) * CANVAS_H) / r.height }
  }

  const strokeTo = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const c = ctx()
    if (!c) return
    c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    c.strokeStyle = COLOR_HEX[color]
    c.lineWidth = (SIZES[size] ?? 22) * (tool === 'eraser' ? 1.6 : 1)
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(from.x, from.y)
    c.lineTo(to.x, to.y)
    c.stroke()
    c.globalCompositeOperation = 'source-over'
  }

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = ctx()
    if (!c) return
    const p = toCanvas(e)
    if (tool === 'brush' || tool === 'eraser') {
      e.currentTarget.setPointerCapture(e.pointerId)
      pushUndo()
      drawing.current = p
      strokeTo(p, { x: p.x + 0.1, y: p.y + 0.1 })
      return
    }
    pushUndo()
    if (tool === 'fill') {
      const data = c.getImageData(0, 0, CANVAS_W, CANVAS_H)
      if (floodFill(data, boundary.current, p.x, p.y, hexToRgba(COLOR_HEX[color]))) {
        c.putImageData(data, 0, 0)
        audio.sfx('pop')
      } else undoStack.current.pop()
    } else if (tool === 'shape') {
      c.fillStyle = COLOR_HEX[color]
      shapePath(c, shape, p.x, p.y, 90)
      c.fill()
      audio.sfx('pop')
    } else if (tool === 'stamp') {
      const sizePx = 170
      loadImage(openmojiUrl(stamp))
        .then((img) => c.drawImage(img, p.x - sizePx / 2, p.y - sizePx / 2, sizePx, sizePx))
        .catch(() => {
          c.font = `${sizePx * 0.8}px sans-serif`
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.fillText(emojiFromHex(stamp), p.x, p.y)
        })
      audio.sfx('pop')
    }
    setUndoCount(undoStack.current.length)
  }

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent]
    for (const ev of events) {
      const p = toCanvas(ev)
      strokeTo(drawing.current, p)
      drawing.current = p
    }
  }

  const onUp = () => {
    drawing.current = null
  }

  /** Save (composite image for the gallery + editable layer). Returns silently if there is nothing new. */
  const save = useCallback(
    async (announce: boolean) => {
      const canvas = canvasRef.current
      if (!canvas || (!dirty.current && !announce)) return
      const comp = document.createElement('canvas')
      comp.width = CANVAS_W
      comp.height = CANVAS_H
      const o = comp.getContext('2d')
      if (!o) return
      o.fillStyle = '#fff'
      o.fillRect(0, 0, CANVAS_W, CANVAS_H)
      o.drawImage(canvas, 0, 0)
      if (overlayImg.current) o.drawImage(overlayImg.current, 0, 0, CANVAS_W, CANVAS_H)
      const row = await saveDrawing({ id: drawingId, pngDataUrl: comp.toDataURL('image/png'), layerDataUrl: canvas.toDataURL('image/png'), pageId })
      setDrawingId(row.id)
      dirty.current = false
      const fresh = await grantEarnedRewards(content.rewards).catch(() => [])
      if (announce) {
        audio.sfx('complete')
        setToast(fresh.length && settings.rewardsEnabled ? `${t.studio.saved} ${t.completion.newSticker}` : t.studio.saved)
        setTimeout(() => setToast(null), 2200)
        void audio.speakAll([{ text: voice(lang).saved, lang }, ...(fresh.length && settings.rewardsEnabled ? [{ text: voice(lang).sticker, lang }] : [])])
      }
    },
    [drawingId, pageId, lang, settings.rewardsEnabled, t],
  )

  const leave = async (to: string) => {
    await save(false).catch(() => undefined)
    navigate(to)
  }

  const startPage = async (id: string | undefined) => {
    await save(false).catch(() => undefined)
    ctx()?.clearRect(0, 0, CANVAS_W, CANVAS_H)
    undoStack.current = []
    setUndoCount(0)
    setDrawingId(undefined)
    setPageId(id)
    setChoosingPage(false)
    dirty.current = false
    audio.sfx('pop')
  }

  const toolBtn = (id: Tool, icon: IconName, label: string, extra?: () => void) => (
    <IconButton
      icon={icon}
      label={label}
      showLabel
      aria-pressed={tool === id}
      onClick={() => {
        audio.sfx('tap')
        setTool(id)
        extra?.()
      }}
    />
  )

  return (
    <Screen className={s.studio}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <IconButton icon="home" label={t.common.home} onClick={() => void leave('/home')} />
          <IconButton icon="gallery" label={t.studio.gallery} showLabel onClick={() => void leave('/studio/gallery')} />
          <IconButton icon="plus" label={t.studio.newPage} showLabel onClick={() => setChoosingPage(true)} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <IconButton icon="undo" label={t.studio.undo} showLabel onClick={undo} disabled={undoCount === 0} />
          <Button variant="teal" icon="save" onClick={() => void save(true)}>
            {t.studio.save}
          </Button>
        </div>
      </div>

      <div className={s.layout}>
        <div className={s.tools}>
          {toolBtn('brush', 'brush', t.studio.brush, () => setTray(null))}
          {toolBtn('eraser', 'eraser', t.studio.eraser, () => setTray(null))}
          {toolBtn('fill', 'fill', t.studio.fill, () => setTray(null))}
          {toolBtn('stamp', 'sticker', t.studio.stamps, () => setTray('stamps'))}
          {toolBtn('shape', 'shapes', t.studio.shapes, () => setTray('shapes'))}
        </div>

        <div className={s.board}>
          <div className={s.paper}>
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={onUp}
              aria-label={t.studio.title}
              role="img"
            />
            {page && <img className={s.overlay} src={assetUrl(`coloring/${page.file}`)} alt="" draggable={false} />}
          </div>
        </div>
      </div>

      {tray === 'stamps' && (
        <div className={s.tray} role="group" aria-label={t.studio.stamps}>
          {content.studio.stamps.map((hex) => (
            <button key={hex} type="button" className={s.trayBtn} aria-pressed={stamp === hex} onClick={() => setStamp(hex)} aria-label={hex}>
              <OpenMoji hex={hex} alt="" size={52} />
            </button>
          ))}
        </div>
      )}
      {tray === 'shapes' && (
        <div className={s.tray} role="group" aria-label={t.studio.shapes}>
          {SHAPES.map((sh) => (
            <button key={sh} type="button" className={s.trayBtn} aria-pressed={shape === sh} onClick={() => setShape(sh)} aria-label={t.shapes[sh]}>
              <ShapeSvg shape={sh} size={52} color={COLOR_HEX[color]} />
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className={s.palette} role="radiogroup" aria-label={t.studio.color.replace('{name}', '')}>
          {COLOR_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={s.swatch}
              style={{ background: COLOR_HEX[k] }}
              aria-pressed={color === k}
              aria-label={fmt(t.studio.color, { name: t.colors[k] })}
              onClick={() => {
                audio.sfx('tap')
                setColor(k)
                if (tool === 'eraser') setTool('brush')
              }}
            />
          ))}
        </div>
        {(tool === 'brush' || tool === 'eraser') && (
          <div className={s.sizes} role="radiogroup" aria-label={t.studio.size}>
            {SIZES.map((px, i) => (
              <button key={px} type="button" className={s.sizeBtn} aria-pressed={size === i} aria-label={`${t.studio.size} ${i + 1}`} onClick={() => setSize(i)}>
                <i style={{ width: 8 + i * 12, height: 8 + i * 12 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {choosingPage && (
        <Dialog label={t.studio.pages} onClose={() => setChoosingPage(false)}>
          <h2 style={{ margin: 0 }}>{t.studio.pages}</h2>
          <div className={s.pages}>
            <button type="button" className={s.pageBtn} onClick={() => void startPage(undefined)}>
              <span className={s.blank} style={{ background: '#fff', border: '2px dashed var(--line)', borderRadius: 12 }} />
              {t.studio.blank}
            </button>
            {content.studio.pages.map((p) => (
              <button key={p.id} type="button" className={s.pageBtn} onClick={() => void startPage(p.id)}>
                <img src={assetUrl(`coloring/${p.file}`)} alt="" />
                {p.title[settings.uiLang]}
              </button>
            ))}
          </div>
          <Button variant="secondary" icon="close" onClick={() => setChoosingPage(false)}>
            {t.common.close}
          </Button>
        </Dialog>
      )}

      {toast && (
        <div className={s.toast} role="status">
          <Icon name="check" /> {toast}
        </div>
      )}
    </Screen>
  )
}
