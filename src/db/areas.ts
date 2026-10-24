import { type AreaCentres, type AreaId, areaCentres, LIFE_AREAS, MIN_AREA_WORDS, placeEntries } from '../domain/areas'
import { meaningHash } from '../domain/meaning'
import { writtenParts } from '../domain/search'
import type { Embed } from '../lib/embedder'
import { MEANING_MODEL } from '../lib/meaningModel'
import { db as defaultDb, type LifeDesignDB } from './db'
import { ensureVectors } from './vectors'

// Life areas on the phone: each area's centre is worked out once from its examples and kept (areaCentres); each
// entry's areas are worked out from its numbers (vectors) whenever they're read, so they're never out of step with
// the entries and nothing is stored per entry.

const SHARED = 'shared'
/** Examples worked out together, as entries are in vectors.ts. */
const BATCH = 16

/** Fingerprint of the model and every area's examples: a change to either works the centres out again. */
export const AREAS_HASH = meaningHash(MEANING_MODEL.id, JSON.stringify(LIFE_AREAS.map((a) => [a.id, a.starter, a.examples])))

const running = new WeakMap<LifeDesignDB, Promise<void>>()

/**
 * Brings everything life areas read up to date: the entries' numbers (as search by meaning does) and, the first time
 * or after the examples change, the areas' centres. `onProgress` hears how the entries' catching up goes.
 */
export function ensureAreas(embed: Embed, database: LifeDesignDB = defaultDb, onProgress?: (done: number, total: number) => void): Promise<void> {
  const already = running.get(database)
  if (already) return already
  const run = (async () => {
    await ensureCentres(embed, database)
    await ensureVectors(embed, database, onProgress)
  })().finally(() => running.delete(database))
  running.set(database, run)
  return run
}

async function ensureCentres(embed: Embed, database: LifeDesignDB) {
  const rows = await database.areaCentres.toArray()
  if (rows.length === LIFE_AREAS.length + 1 && rows.every((r) => r.hash === AREAS_HASH)) return
  const texts = LIFE_AREAS.flatMap((a) => a.examples)
  const vectors: Float32Array[] = []
  for (let i = 0; i < texts.length; i += BATCH) vectors.push(...(await embed(texts.slice(i, i + BATCH), 'passage')))
  const examples = new Map<AreaId, Float32Array[]>()
  let at = 0
  for (const area of LIFE_AREAS) {
    examples.set(area.id, vectors.slice(at, at + area.examples.length))
    at += area.examples.length
  }
  const { shared, centres } = areaCentres(examples)
  await database.transaction('rw', database.areaCentres, async () => {
    await database.areaCentres.clear()
    await database.areaCentres.bulkPut([
      { id: SHARED, hash: AREAS_HASH, vector: shared },
      ...[...centres].map(([id, vector]) => ({ id, hash: AREAS_HASH, vector })),
    ])
  })
}

async function loadCentres(database: LifeDesignDB): Promise<AreaCentres | null> {
  const rows = await database.areaCentres.toArray()
  if (rows.length !== LIFE_AREAS.length + 1 || rows.some((r) => r.hash !== AREAS_HASH)) return null
  const shared = rows.find((r) => r.id === SHARED)
  if (!shared) return null
  return { shared: shared.vector, centres: new Map(rows.filter((r) => r.id !== SHARED).map((r) => [r.id as AreaId, r.vector])) }
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

/**
 * Each finished entry's areas (most of it first), from the numbers already worked out; entries with none are left
 * out. Null until the areas' centres have been worked out once (ensureAreas).
 */
export async function lifeAreas(database: LifeDesignDB = defaultDb): Promise<Map<string, AreaId[]> | null> {
  const [centres, entries, rows] = await Promise.all([loadCentres(database), database.entries.toArray(), database.vectors.toArray()])
  if (!centres) return null
  const placeable = new Set(
    entries.filter((e) => e.status !== 'draft' && wordCount(writtenParts(e).join(' ')) >= MIN_AREA_WORDS).map((e) => e.id),
  )
  const pieces = new Map<string, Float32Array[]>()
  for (const row of rows.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))) {
    if (!placeable.has(row.entryId)) continue
    const list = pieces.get(row.entryId) ?? []
    list.push(row.vector)
    pieces.set(row.entryId, list)
  }
  return placeEntries(pieces, centres)
}

/** Forgets the areas' centres (with the model's files removed): worked out again if it's turned on. */
export const clearAreaCentres = (database: LifeDesignDB = defaultDb) => database.areaCentres.clear()
