import { PHOTO_TEXT_VERSION } from '../lib/ocrLines'
import { fromBase64 } from '../lib/photo'
import { OcrError, type ReadPhoto } from '../lib/reader'
import { db as defaultDb, type LifeDesignDB } from './db'
import type { PhotoRef } from './types'

// Reading photos on the phone (v0.16): each photo not read yet is read once, in the background, one at a time, and its
// text kept with its entry (PhotoRef.text), where search, search by meaning, life areas and reviews read it. Not an
// edit you made, so updatedAt stays; search by meaning sees the new text by its fingerprint. A photo read before its
// lines were put in order (PHOTO_TEXT_VERSION, v0.24.2) is read again once, after every photo not read yet; one your
// AI has read is left as it is, as its reading comes first.

const running = new WeakMap<LifeDesignDB, Promise<void>>()

/** Reads every photo not read yet, then those read the old way. A photo that can't be opened is kept, with no text (or
 *  the text it had); a download, space or start problem stops here and is thrown, to try again next time. */
export function ensurePhotoText(read: ReadPhoto, database: LifeDesignDB = defaultDb): Promise<void> {
  const already = running.get(database)
  if (already) return already
  const run = update(read, database).finally(() => running.delete(database))
  running.set(database, run)
  return run
}

/** Read before its lines were put in order, and not by your AI. */
const readTheOldWay = (ref: PhotoRef) => ref.text !== null && (ref.textVersion ?? 1) < PHOTO_TEXT_VERSION && !ref.ai?.text && !ref.ai?.description

async function update(read: ReadPhoto, database: LifeDesignDB) {
  const entries = await database.entries.toArray()
  const refs = (due: (ref: PhotoRef) => boolean) => entries.flatMap((entry) => (entry.photos ?? []).filter(due).map((ref) => ({ entryId: entry.id, ref })))
  for (const { entryId, ref } of [...refs((ref) => ref.text === null), ...refs(readTheOldWay)]) {
    const photo = await database.photos.get(ref.id)
    if (!photo) continue // not written yet (just added): next time
    let text: string
    try {
      text = await read(fromBase64(photo.data))
    } catch (error) {
      if (error instanceof OcrError && error.problem === 'photo') text = ref.text ?? ''
      else throw error
    }
    // The entry as it is now (it may have changed while the photo was read): only this photo's text is set, and only
    // while it's still the text it was read for.
    await database.transaction('rw', database.entries, async () => {
      const now = await database.entries.get(entryId)
      if (!now?.photos.some((p) => p.id === ref.id && p.text === ref.text)) return
      await database.entries.update(entryId, { photos: now.photos.map((p) => (p.id === ref.id ? { ...p, text, textVersion: PHOTO_TEXT_VERSION } : p)) })
    })
  }
}
