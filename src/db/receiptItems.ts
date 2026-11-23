import type { ItemKind } from '../domain/receipts'
import { rememberedKey, rememberedKindsOf, rememberedNamesOf } from '../domain/shopping'
import { db as defaultDb, type LifeDesignDB } from './db'
import { changeSetting } from './repo'
import { guardWrite } from './saveErrors'
import type { AuditEntry, ExtraItem, ItemChange, ReceiptFix } from './types'

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

/** Says to count a receipt whose items don't add up to its printed total, for those figures (step 1, 2026-11-23); null takes
 *  it back. Kept on the photo, so a new reading with other figures asks again. An edit you made: updatedAt moves. */
export async function approveReceipt(entryId: string, photoId: string, basis: { total: number | null; sum: number } | null, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.entries, database.auditLog, async () => {
      const entry = await database.entries.get(entryId)
      if (!entry?.photos.some((p) => p.id === photoId)) return
      const photos = entry.photos.map((p) => {
        if (p.id !== photoId) return p
        const { approved: _, ...rest } = p
        return basis ? { ...rest, approved: { total: basis.total, sum: basis.sum } } : rest
      })
      await database.entries.update(entryId, { photos, updatedAt: Date.now() })
      await note(database, basis ? 'receipt-approved' : 'receipt-unapproved', entryId, photoId, [basis ? 'Counted, as you said, though its items did not add up' : 'Stopped counting it'])
    }),
  )
}

/** A note of a change, written in the same transaction as the change. */
async function note(database: LifeDesignDB, kind: AuditEntry['kind'], entryId: string, photoId: string, changes: string[]): Promise<void> {
  const at = Date.now()
  await database.auditLog.add({ id: crypto.randomUUID(), kind, entryId, photoId, changes, createdAt: at, updatedAt: at })
}

/** Your corrections to one item as the receipt shows it (step 2): only what you changed. */
export interface ItemEdit {
  key: string
  name?: string
  price?: number
  quantity?: number
  /** True takes it off the receipt; false puts it back. */
  removed?: boolean
}

/** What you corrected on a receipt (step 2, 2026-11-23): its shop, day and total (merged with earlier ones), the items you
 *  changed (merged by key, beside the kind and return already chosen), and the items you added (all of them: this replaces
 *  the list). */
export interface Correction {
  fix?: ReceiptFix
  items: ItemEdit[]
  extra: ExtraItem[]
}

const dropEmpty = <T extends object>(value: T): T | undefined => (Object.values(value).some((v) => v !== undefined) ? value : undefined)

/** Puts a receipt right (step 2): kept on the photo beside what was read, which never changes, with a note of what changed
 *  (`changes`, in words: `receiptChanges`) in the same transaction. An edit you made: updatedAt moves. */
export async function correctReceipt(entryId: string, photoId: string, correction: Correction, changes: string[], database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.entries, database.auditLog, async () => {
      const entry = await database.entries.get(entryId)
      if (!entry?.photos.some((p) => p.id === photoId)) return
      const photos = entry.photos.map((p) => {
        if (p.id !== photoId) return p
        const { fix: oldFix, extra: _extra, items: oldItems, ...rest } = p
        const fix = dropEmpty({ ...oldFix, ...correction.fix })
        const items = [...(oldItems ?? [])]
        for (const edit of correction.items) {
          const at = items.findIndex((c) => c.key === edit.key)
          const { removed: _removed, ...was } = at >= 0 ? items[at]! : ({ key: edit.key } as ItemChange)
          const next: ItemChange = {
            ...was,
            ...(edit.name !== undefined ? { name: edit.name } : {}),
            ...(edit.price !== undefined ? { price: edit.price } : {}),
            ...(edit.quantity !== undefined ? { quantity: edit.quantity } : {}),
            ...((edit.removed === undefined ? at >= 0 && items[at]!.removed : edit.removed) ? { removed: true as const } : {}),
          }
          if (at >= 0) items[at] = next
          else items.push(next)
        }
        const kept = items.filter((c) => Object.keys(c).length > 1)
        return { ...rest, ...(fix ? { fix } : {}), ...(correction.extra.length ? { extra: correction.extra } : {}), ...(kept.length ? { items: kept } : {}) }
      })
      await database.entries.update(entryId, { photos, updatedAt: Date.now() })
      await note(database, 'receipt-corrected', entryId, photoId, changes)
    }),
  )
}

/** Takes every correction off a receipt (step 2), so it is as read again: a kind you chose and an item you returned stay. */
export async function resetCorrection(entryId: string, photoId: string, changes: string[], database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.entries, database.auditLog, async () => {
      const entry = await database.entries.get(entryId)
      if (!entry?.photos.some((p) => p.id === photoId)) return
      const photos = entry.photos.map((p) => {
        if (p.id !== photoId) return p
        const { fix: _fix, extra: _extra, items: oldItems, ...rest } = p
        const items = (oldItems ?? []).map(({ name: _n, price: _p, quantity: _q, removed: _r, ...keep }) => keep).filter((c) => Object.keys(c).length > 1)
        return { ...rest, ...(items.length ? { items } : {}) }
      })
      await database.entries.update(entryId, { photos, updatedAt: Date.now() })
      await note(database, 'receipt-reset', entryId, photoId, changes)
    }),
  )
}

/** The kinds you chose for an item at a shop (v0.20.37, owner 2026-11-01: infant formula was filed under dairy on every
 *  receipt): a setting by `rememberedKey`, so in backups. Read with `rememberedKindsOf`; laid over your AI's kind by
 *  `receiptsAndCopies`, on past receipts too. */
export const ITEM_KINDS_SETTING = 'itemKinds'

/** Keeps the kind for an item at a shop, on every receipt; null goes back to your AI's. */
export async function rememberItemKind(shop: string, name: string, kind: ItemKind | null, database: LifeDesignDB = defaultDb): Promise<void> {
  const key = rememberedKey(shop, name)
  await changeSetting(
    ITEM_KINDS_SETTING,
    (row) => {
      const { [key]: _, ...rest } = rememberedKindsOf(row?.value)
      return kind ? { ...rest, [key]: kind } : rest
    },
    database,
  )
}

/** Who you filed an item under at a shop (v0.20.39: what goes on one person): a setting by `rememberedKey`, so in
 *  backups. Read with `rememberedNamesOf`; laid on items by `receiptsAndCopies`, on every receipt. */
export const ITEM_FOR_SETTING = 'itemFor'

/** Files the item at a shop under a name, on every receipt; blank takes it back. */
export async function fileItem(shop: string, name: string, who: string, database: LifeDesignDB = defaultDb): Promise<void> {
  const key = rememberedKey(shop, name)
  await changeSetting(
    ITEM_FOR_SETTING,
    (row) => {
      const { [key]: _, ...rest } = rememberedNamesOf(row?.value)
      return who.trim() ? { ...rest, [key]: who.trim() } : rest
    },
    database,
  )
}
