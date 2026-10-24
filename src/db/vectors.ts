import { closeness, closest, meaningChunks, meaningHash, meaningText, standOut } from '../domain/meaning'
import type { Embed } from '../lib/embedder'
import { MEANING_MODEL } from '../lib/meaningModel'
import { db as defaultDb, type LifeDesignDB } from './db'
import type { Entry } from './types'

// Search by meaning keeps its numbers in their own table (vectors) beside the journal, which it never changes. They're
// brought up to date lazily, before each search, so saving, editing, deleting, Undo and restoring a backup need no
// hooks: whatever changed is worked out again then.

/** Entries worked out together; each batch is saved as it's done, so stopping half way loses nothing. */
const BATCH = 16

const running = new WeakMap<LifeDesignDB, Promise<void>>()

/**
 * Brings the numbers up to date with the entries: works out new and changed finished entries, and removes those of
 * drafts, deleted entries and entries with no words. `onProgress` hears how many of those to work out are done.
 */
export function ensureVectors(embed: Embed, database: LifeDesignDB = defaultDb, onProgress?: (done: number, total: number) => void): Promise<void> {
  const already = running.get(database)
  if (already) return already
  const run = update(embed, database, onProgress).finally(() => running.delete(database))
  running.set(database, run)
  return run
}

async function update(embed: Embed, database: LifeDesignDB, onProgress?: (done: number, total: number) => void) {
  const [entries, rows] = await Promise.all([database.entries.toArray(), database.vectors.toArray()])
  const wanted = new Map<string, { entry: Entry; text: string; hash: string }>()
  for (const entry of entries) {
    if (entry.status === 'draft') continue
    const text = meaningText(entry)
    if (text) wanted.set(entry.id, { entry, text, hash: meaningHash(MEANING_MODEL.id, text) })
  }
  const stored = new Map(rows.map((r) => [r.entryId, r.hash]))
  const gone = rows.filter((r) => !wanted.has(r.entryId)).map((r) => r.id)
  if (gone.length) await database.vectors.bulkDelete(gone)

  const todo = [...wanted.values()].filter((w) => stored.get(w.entry.id) !== w.hash)
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const pieces = batch.flatMap((w) => meaningChunks(w.text).map((text, n) => ({ w, text, n })))
    const vectors = await embed(
      pieces.map((p) => p.text),
      'passage',
    )
    await database.transaction('rw', database.vectors, async () => {
      await database.vectors
        .where('entryId')
        .anyOf(batch.map((w) => w.entry.id))
        .delete()
      await database.vectors.bulkPut(
        pieces.map((p, k) => ({ id: `${p.w.entry.id}#${p.n}`, entryId: p.w.entry.id, model: MEANING_MODEL.id, hash: p.w.hash, vector: vectors[k]! })),
      )
    })
    onProgress?.(Math.min(i + BATCH, todo.length), todo.length)
  }
}

/**
 * The finished entries that stand out as closest in meaning to a question, closest first, as ids (at most `max`).
 * `among` limits it to some entries (a period's). `pick`: those that stand out (the default), or simply the closest.
 * How close is never given: order only. `onProgress` hears how the catching up goes, the first time a long journal
 * is read.
 */
export async function findByMeaning(
  query: string,
  embed: Embed,
  {
    among,
    max,
    pick = 'standOut',
    onProgress,
  }: { among?: readonly string[]; max: number; pick?: 'standOut' | 'closest'; onProgress?: (done: number, total: number) => void },
  database: LifeDesignDB = defaultDb,
): Promise<string[]> {
  const question = query.trim()
  if (!question) return []
  await ensureVectors(embed, database, onProgress)
  const [vector] = await embed([question], 'query')
  const allowed = among ? new Set(among) : null
  const rows = (await database.vectors.toArray()).filter((r) => !allowed || allowed.has(r.entryId))
  const scores = closeness(vector!, rows)
  return pick === 'closest' ? closest(scores, max) : standOut(scores, max)
}

/** Forgets every entry's numbers (with the model's files removed): they're worked out again if it's turned on. */
export const clearVectors = (database: LifeDesignDB = defaultDb) => database.vectors.clear()

/** The finished entries closest in meaning to a question, closest first: what to give an AI as context. */
export async function relevantEntries(query: string, limit: number, embed: Embed, database: LifeDesignDB = defaultDb): Promise<Entry[]> {
  const ids = await findByMeaning(query, embed, { max: limit }, database)
  const found = await database.entries.bulkGet(ids)
  return found.filter((e): e is Entry => e !== undefined && e.status !== 'draft')
}
