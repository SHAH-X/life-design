import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import type { DocumentRecord, Tracked } from './types'

// Your documents (step 5, 2026-11-23): added, changed and removed only by you. A file is kept exactly as it was added (a PDF byte for
// byte, a photo shrunk like a receipt's) and is never changed afterwards.

/** The most a PDF kept here may be: it is kept whole, and goes in every backup. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

export interface NewDocument {
  title: string
  type: string
  kind: 'pdf' | 'image'
  mime: string
  size: number
  pages: number | null
  /** The words read from it; null when not read yet. */
  text: string | null
  /** The file, base64. */
  data: string
}

const trimmed = (title: string) => {
  const t = title.trim()
  if (!t) throw new Error('A document needs a title.')
  return t
}

/** Adds a document: its details and its file in one transaction. Refuses what isn't one, saying why. */
export async function addDocument(doc: NewDocument, database: LifeDesignDB = defaultDb): Promise<string> {
  const title = trimmed(doc.title)
  if (!doc.data) throw new Error('A document needs its file.')
  if (doc.kind === 'pdf' && doc.size > MAX_PDF_BYTES) throw new Error('This PDF is over 10 MB, more than a backup should carry. Save a smaller copy and add that.')
  const id = crypto.randomUUID()
  const now = Date.now()
  const { data, ...details } = doc
  await guardWrite(() =>
    database.transaction('rw', database.documents, database.documentFiles, async () => {
      await database.documents.add({ ...details, title, id, tracked: [], dismissed: [], billId: null, notes: '', createdAt: now, updatedAt: now })
      await database.documentFiles.add({ id, data, createdAt: now, updatedAt: now })
    }),
  )
  return id
}

/** Changes what you can say about a document; the file is never touched. */
export async function updateDocument(id: string, patch: Partial<Pick<DocumentRecord, 'title' | 'type' | 'notes' | 'billId'>>, database: LifeDesignDB = defaultDb): Promise<void> {
  const next = { ...patch, ...(patch.title !== undefined ? { title: trimmed(patch.title) } : {}), ...(patch.notes !== undefined ? { notes: patch.notes.trim() } : {}) }
  await guardWrite(() => database.documents.update(id, { ...next, updatedAt: Date.now() }))
}

async function change(id: string, database: LifeDesignDB, edit: (doc: DocumentRecord) => Partial<DocumentRecord>): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.documents, async () => {
      const doc = await database.documents.get(id)
      if (doc) await database.documents.update(id, { ...edit(doc), updatedAt: Date.now() })
    }),
  )
}

/** Tracks a date in a document (said to renew, expire, end, be due or start): once, and no longer a dismissed suggestion. */
export const trackDate = (id: string, t: Tracked, database: LifeDesignDB = defaultDb) =>
  change(id, database, (doc) => ({
    tracked: doc.tracked.some((x) => x.date === t.date && x.kind === t.kind) ? doc.tracked : [...doc.tracked, t],
    dismissed: doc.dismissed.filter((k) => k !== `${t.date}|${t.kind}`),
  }))

/** Stops tracking a date (`date|kind`). */
export const untrackDate = (id: string, key: string, database: LifeDesignDB = defaultDb) => change(id, database, (doc) => ({ tracked: doc.tracked.filter((t) => `${t.date}|${t.kind}` !== key) }))

/** Says a suggested date (`date|kind`) isn't one to track: it is not suggested again. */
export const dismissDate = (id: string, key: string, database: LifeDesignDB = defaultDb) => change(id, database, (doc) => ({ dismissed: doc.dismissed.includes(key) ? doc.dismissed : [...doc.dismissed, key] }))

/** The words read from a document's file. */
export const setDocumentText = (id: string, text: string, database: LifeDesignDB = defaultDb) => change(id, database, () => ({ text }))

/** Removes a document and its file: only when you ask. */
export async function removeDocument(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.documents, database.documentFiles, async () => {
      await database.documents.delete(id)
      await database.documentFiles.delete(id)
    }),
  )
}

/** A document's file, base64; null when there is none. */
export async function documentData(id: string, database: LifeDesignDB = defaultDb): Promise<string | null> {
  return (await database.documentFiles.get(id))?.data ?? null
}
