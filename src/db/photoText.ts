import { fromBase64 } from '../lib/photo'
import { OcrError, type ReadPhoto } from '../lib/reader'
import { db as defaultDb, type LifeDesignDB } from './db'

// Reading photos on the phone (v0.16): each photo not read yet is read once, in the background, one at a time, and its
// text kept with its entry (PhotoRef.text), where search, search by meaning, life areas and reviews read it. Not an
// edit you made, so updatedAt stays; search by meaning sees the new text by its fingerprint.

const running = new WeakMap<LifeDesignDB, Promise<void>>()

/** Reads every photo not read yet. A photo that can't be opened is kept, with no text; a download, space or start
 *  problem stops here and is thrown, to try again next time. */
export function ensurePhotoText(read: ReadPhoto, database: LifeDesignDB = defaultDb): Promise<void> {
  const already = running.get(database)
  if (already) return already
  const run = update(read, database).finally(() => running.delete(database))
  running.set(database, run)
  return run
}

async function update(read: ReadPhoto, database: LifeDesignDB) {
  const entries = await database.entries.toArray()
  for (const entry of entries) {
    for (const ref of entry.photos ?? []) {
      if (ref.text !== null) continue
      const photo = await database.photos.get(ref.id)
      if (!photo) continue // not written yet (just added): next time
      let text: string
      try {
        text = await read(fromBase64(photo.data))
      } catch (error) {
        if (error instanceof OcrError && error.problem === 'photo') text = ''
        else throw error
      }
      // The entry as it is now (it may have changed while the photo was read): only this photo's text is set.
      await database.transaction('rw', database.entries, async () => {
        const now = await database.entries.get(entry.id)
        if (!now?.photos.some((p) => p.id === ref.id && p.text === null)) return
        await database.entries.update(entry.id, { photos: now.photos.map((p) => (p.id === ref.id ? { ...p, text } : p)) })
      })
    }
  }
}
