import { addDays } from '../lib/dates'
import { findLoops, type Loop } from '../domain/loops'
import { meaningHash } from '../domain/meaning'
import type { Embed } from '../lib/embedder'
import { MEANING_MODEL } from '../lib/meaningModel'
import { db as defaultDb, type LifeDesignDB } from './db'
import type { Entry } from './types'

// The provoker's open loops on the phone: each loop's meaning is worked out once (loopVectors, beside the journal,
// which it never changes) and compared with what you wrote after it, from search by meaning's numbers (vectors).

/** Loops worked out together; each batch is saved as it's done. */
const BATCH = 8
/** A loop this close in meaning to later writing has been written about again (the sentence alone, or with the one
 *  before it, which says what "it" is). Tuned on two fictional journals (tests/fixtures/loops.ts, 25 loops): of 11
 *  written about again, 9 seen; all 14 left open stayed open. Wrong, it asks about something done: "Done already". */
export const WRITTEN_AGAIN = 0.7
/** A loop younger than this is still fresh in mind: not asked about yet. */
export const LOOP_MIN_DAYS = 3
/** Older than this, it's let go. */
export const LOOP_MAX_DAYS = 60

const hashOf = (loop: Loop) => meaningHash(MEANING_MODEL.id, `${loop.text}\n${loop.context}`)

const running = new WeakMap<LifeDesignDB, Promise<void>>()

/** Brings the loops' numbers up to date with the finished entries: new and changed worked out, gone removed. */
export function ensureLoopVectors(embed: Embed, database: LifeDesignDB = defaultDb): Promise<void> {
  const already = running.get(database)
  if (already) return already
  const run = update(embed, database).finally(() => running.delete(database))
  running.set(database, run)
  return run
}

async function update(embed: Embed, database: LifeDesignDB) {
  const [entries, rows] = await Promise.all([database.entries.toArray(), database.loopVectors.toArray()])
  const wanted = new Map(entries.flatMap(findLoops).map((loop) => [loop.id, { loop, hash: hashOf(loop) }]))
  const stored = new Map(rows.map((r) => [r.id, r.hash]))
  const gone = rows.filter((r) => wanted.get(r.id)?.hash !== r.hash).map((r) => r.id)
  if (gone.length) await database.loopVectors.bulkDelete(gone)
  const todo = [...wanted.values()].filter((w) => stored.get(w.loop.id) !== w.hash)
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH)
    const vectors = await embed(
      batch.flatMap((w) => [w.loop.text, w.loop.context]),
      'passage',
    )
    await database.loopVectors.bulkPut(
      batch.map((w, k) => ({ id: w.loop.id, entryId: w.loop.entryId, hash: w.hash, sentence: vectors[2 * k]!, context: vectors[2 * k + 1]! })),
    )
  }
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/**
 * The loops still open on a day, oldest first: 3 to 60 days old, and not written about since (as far as the numbers
 * worked out so far tell). A loop whose numbers aren't worked out yet isn't offered.
 */
export async function openLoops(today: string, database: LifeDesignDB = defaultDb): Promise<Loop[]> {
  const [entries, loopRows, rows] = await Promise.all([database.entries.toArray(), database.loopVectors.toArray(), database.vectors.toArray()])
  const finished = entries.filter((e) => e.status !== 'draft')
  const numbers = new Map(loopRows.map((r) => [r.id, r]))
  const pieces = new Map<string, Float32Array[]>()
  for (const row of rows) pieces.set(row.entryId, [...(pieces.get(row.entryId) ?? []), row.vector])
  const from = addDays(today, -LOOP_MAX_DAYS)
  const until = addDays(today, -LOOP_MIN_DAYS)
  const writtenAgain = (loop: Loop, after: readonly Entry[]) => {
    const own = numbers.get(loop.id)!
    return after.some((e) => (pieces.get(e.id) ?? []).some((p) => dot(own.sentence, p) >= WRITTEN_AGAIN || dot(own.context, p) >= WRITTEN_AGAIN))
  }
  return finished
    .filter((e) => e.date >= from && e.date <= until)
    .flatMap(findLoops)
    .filter((loop) => numbers.has(loop.id))
    .filter((loop) => !writtenAgain(loop, finished.filter((e) => e.id !== loop.entryId && e.createdAt > loop.createdAt)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

/** Forgets the loops' numbers (with the model's files removed): worked out again if it's turned on. */
export const clearLoopVectors = (database: LifeDesignDB = defaultDb) => database.loopVectors.clear()
