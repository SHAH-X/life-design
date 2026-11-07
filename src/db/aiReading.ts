import { AI_READING_INSTRUCTIONS, dueForAi, PARTS_INSTRUCTION, parseAiReading, READING_VERSION } from '../domain/aiReading'
import { READS_IMAGES } from '../lib/ai'
import type { AiProvider, AiReading, Entry, PhotoRef } from './types'
import { db as defaultDb, type LifeDesignDB } from './db'

// Photos read by your AI on the phone's side (v0.18): sending them (one at a time) and keeping what comes back on the
// photo's entry, where receipts, search, life areas and Ask read it. Not an edit you made, so updatedAt stays.

/** Sends one photo (a JPEG, base64) with how to read it, and a long receipt's later parts after it (v0.27.0); gives
 *  back the AI's reply. */
export type SendPhoto = (jpeg: string, instructions: string, parts?: readonly string[]) => Promise<string>

export interface PhotoReader {
  send: SendPhoto
  /** Who reads it, for the photo's note: "Gemini · gemini-2.5-flash". */
  by: string
}

/** What a reply that can't be used leaves on a photo not read before: tried, and counted (`dueForAi`). */
const unusable = (by: string, at: number): AiReading => ({ by, at, text: '', description: '', receipt: null })

/** Reads one photo with the AI now (a tap on "Read with AI", or by itself) and keeps what it read. A reply it can't
 *  use never wipes an earlier reading: that stays, with the try counted. */
export async function readOnePhoto(photoId: string, reader: PhotoReader, database: LifeDesignDB = defaultDb): Promise<AiReading | undefined> {
  const asked = await database.photos.get(photoId)
  if (!asked) throw new Error('That photo is not on this phone any more.')
  // A long receipt's part is read with its first photo, and the reading kept there (v0.27.0).
  const refs = (await database.entries.get(asked.entryId))?.photos ?? []
  const of = refs.find((p) => p.id === photoId)?.partOf
  const firstId = of && refs.some((p) => p.id === of) ? of : photoId // its first photo taken off: a photo of its own
  const photo = firstId === photoId ? asked : await database.photos.get(firstId)
  if (!photo) throw new Error('That photo is not on this phone any more.')
  const partIds = refs.filter((p) => p.partOf === firstId).map((p) => p.id)
  const parts = await database.photos.bulkGet(partIds)
  if (parts.some((part) => !part)) return undefined // a part not written yet (just added): next time
  const at = Date.now()
  const instructions = partIds.length ? `${AI_READING_INSTRUCTIONS}\n${PARTS_INSTRUCTION}` : AI_READING_INSTRUCTIONS
  const parsed = parseAiReading(await reader.send(photo.data, instructions, partIds.length ? parts.map((part) => part!.data) : undefined), reader.by, at)
  return database.transaction('rw', database.entries, async () => {
    const entry = await database.entries.get(photo.entryId)
    const before = entry?.photos.find((p) => p.id === firstId)?.ai
    if (!entry || !entry.photos.some((p) => p.id === firstId)) return undefined
    // Its parts changed while it was read (one added): this reading isn't of the whole receipt, so it's read again.
    if (entry.photos.filter((p) => p.partOf === firstId).map((p) => p.id).join() !== partIds.join()) return undefined
    const reading: AiReading = parsed
      ? { ...parsed, version: READING_VERSION }
      : { ...(before && (before.text || before.description) ? before : unusable(reader.by, at)), tries: (before?.tries ?? 0) + 1 }
    await database.entries.update(entry.id, { photos: entry.photos.map((p) => (p.id === firstId ? { ...p, ai: reading } : p)) })
    return reading
  })
}

const running = new WeakMap<LifeDesignDB, Promise<void>>()

/** Receipts your AI is still to read (`dueForAi`): those never read first, then those it couldn't read, then those
 *  read before kinds or plain names. */
export function waitingForAi(entries: readonly Entry[]): string[] {
  // A part whose first photo was taken off is a photo of its own (v0.27.0).
  const own = (p: PhotoRef, photos: readonly PhotoRef[]) => (p.partOf && !photos.some((q) => q.id === p.partOf) ? { ...p, partOf: undefined } : p)
  const due = entries.flatMap((e) => (e.photos ?? []).map((p) => ({ id: p.id, why: dueForAi(own(p, e.photos ?? [])) })))
  return (['new', 'retry', 'again'] as const).flatMap((why) => due.filter((d) => d.why === why).map((d) => d.id))
}

/** After a round that leaves receipts unread, the next is this long after, while the app is open (v0.19.4). */
const RETRY_MINUTES = [1, 5, 15, 30]
export const nextTryIn = (rounds: number) => RETRY_MINUTES[Math.min(rounds, RETRY_MINUTES.length - 1)]! * 60_000

/** Sends those, one at a time, each once a round; one whose picture isn't on the phone (not written yet) waits. A
 *  key, limit, busy or connection problem stops the round and is thrown: the next round tries again (AreasProvider). */
export function ensureAiReadings(reader: PhotoReader, database: LifeDesignDB = defaultDb): Promise<void> {
  const already = running.get(database)
  if (already) return already
  const run = (async () => {
    const waiting = waitingForAi(await database.entries.toArray())
    const pictures = new Set(await database.photos.where('id').anyOf(waiting).primaryKeys())
    for (const id of waiting) if (pictures.has(id)) await readOnePhoto(id, reader, database)
  })().finally(() => running.delete(database))
  running.set(database, run)
  return run
}

/**
 * Which AI reads photos, and whether reading receipts with it is on (More → Reading photos): a key of its own for
 * photos when one is set up there (v0.18.2: Groq for Ask and reviews, Gemini for photos), else the AI for Ask and
 * reviews (More → AI review) when it reads photos; null when neither does. `keyAt` is when that key was saved, so a
 * new key tries the waiting receipts again; `own` says it's the key for photos alone.
 */
export async function photoReaderSettings(
  database: LifeDesignDB = defaultDb,
): Promise<{ provider: AiProvider; key: string; model: string; auto: boolean; keyAt: number; own: boolean } | null> {
  const names = ['photoAiProvider', 'photoAiKey', 'photoAiModel', 'aiProvider', 'aiKey', 'aiModel', 'aiReceipts']
  const [photoProvider, photoKey, photoModel, provider, key, model, auto] = await Promise.all(names.map((name) => database.settings.get(name)))
  const usable = (p: typeof provider, k: typeof key, m: typeof model, own: boolean) => {
    const [service, secret, name] = [p?.value, k?.value, m?.value]
    if (!(READS_IMAGES as readonly unknown[]).includes(service) || typeof secret !== 'string' || !secret || typeof name !== 'string' || !name) return null
    return { provider: service as AiProvider, key: secret, model: name, auto: auto?.value !== false, keyAt: k!.updatedAt, own }
  }
  return usable(photoProvider, photoKey, photoModel, true) ?? usable(provider, key, model, false)
}
