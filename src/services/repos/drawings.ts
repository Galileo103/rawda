import { type DrawingRow, db } from '../db'

export interface SaveDrawingInput {
  id?: string
  pngDataUrl: string
  layerDataUrl: string
  pageId?: string
}

export async function saveDrawing(input: SaveDrawingInput, now = Date.now()): Promise<DrawingRow> {
  const id = input.id ?? newId()
  const prev = input.id ? await db.drawings.get(input.id) : undefined
  const row: DrawingRow = {
    id,
    pngDataUrl: input.pngDataUrl,
    layerDataUrl: input.layerDataUrl,
    pageId: input.pageId,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
  }
  await db.drawings.put(row)
  return row
}

export function listDrawings(): Promise<DrawingRow[]> {
  return db.drawings.orderBy('updatedAt').reverse().toArray()
}

export function getDrawing(id: string): Promise<DrawingRow | undefined> {
  return db.drawings.get(id)
}

export function deleteDrawing(id: string): Promise<void> {
  return db.drawings.delete(id)
}

function newId(): string {
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `d-${rand}`
}
