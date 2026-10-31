import type { ItemKind } from '../domain/receipts'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import type { ItemChange } from './types'

// Your changes to a receipt's items (v0.20.18, owner 2026-10-31): a kind you chose, an item you returned. Kept on the
// photo beside what was read (`PhotoRef.items`), so a new reading never wipes them. An edit you made: updatedAt moves.

/** Changes one item, by its key (`itemKeys`): `kind` null gives back your AI's; `returned` false counts it again. */
export async function changeItem(
  entryId: string,
  photoId: string,
  key: string,
  change: { kind?: ItemKind | null; returned?: boolean },
  database: LifeDesignDB = defaultDb,
): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.entries, async () => {
      const entry = await database.entries.get(entryId)
      if (!entry?.photos.some((p) => p.id === photoId)) return
      const photos = entry.photos.map((p) => {
        if (p.id !== photoId) return p
        const was = p.items?.find((c) => c.key === key) ?? { key }
        const kind = change.kind === undefined ? was.kind : (change.kind ?? undefined)
        const returned = change.returned === undefined ? was.returned : change.returned || undefined
        const now: ItemChange = { key, ...(kind ? { kind } : {}), ...(returned ? { returned } : {}) }
        const others = (p.items ?? []).filter((c) => c.key !== key)
        const items = now.kind || now.returned ? [...others, now] : others
        const { items: _, ...rest } = p
        return items.length ? { ...rest, items } : rest
      })
      await database.entries.update(entryId, { photos, updatedAt: Date.now() })
    }),
  )
}
