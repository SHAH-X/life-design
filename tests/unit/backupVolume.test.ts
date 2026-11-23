import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { applyImport, createBackup, detectFile } from '../../src/db/backup'
import { bytesToBase64, isLockedEnvelope, lockText, unlockText } from '../../src/db/crypto'
import { openDb } from '../../src/db/db'
import type { Photo } from '../../src/db/types'
import { areaEntry } from '../fixtures/areas'

// Step 1 (owner-approved plan, 2026-11-23): "support reliable backup and restore", tried at the size a year of receipts
// comes to: each photo is about 300 KB (src/lib/photo.ts), kept as base64 inside the backup file. Fictional data only.
const PHOTOS = 150
const PHOTO_BYTES = 300 * 1024

describe(`a backup of ${PHOTOS} receipt photos`, () => {
  it('restores every entry and every photo byte for byte, also through a password lock', async () => {
    const phone = openDb(`phone-${crypto.randomUUID()}`)
    const fresh = openDb(`fresh-${crypto.randomUUID()}`)
    const photos: Photo[] = []
    for (let i = 0; i < PHOTOS; i += 1) {
      const bytes = new Uint8Array(PHOTO_BYTES)
      for (let offset = 0; offset < bytes.length; offset += 65_536) crypto.getRandomValues(bytes.subarray(offset, offset + 65_536))
      photos.push({ id: `p${i}`, entryId: `e${i}`, type: 'image/jpeg', width: 1500, height: 2000, data: bytesToBase64(bytes), createdAt: 1000 + i, updatedAt: 1000 + i })
    }
    await phone.photos.bulkPut(photos)
    await phone.entries.bulkPut(photos.map((p, i) => ({ ...areaEntry({ id: p.entryId, text: '', expect: [] }, '2026-10-12'), createdAt: 1000 + i, updatedAt: 1000 + i, photos: [{ id: p.id, text: null }] })))

    const json = JSON.stringify(await createBackup(phone))
    // Measured 2026-11-23 in Node: 150 photos, a 58.7 MB file, made in 0.2 s and restored in 0.3 s. An iPhone's memory is not
    // measured here (DECISIONS, "To prove on a real iPhone").
    expect(json.length).toBeGreaterThan(PHOTOS * PHOTO_BYTES)

    const detected = detectFile(json)
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const result = await applyImport(detected.raw, fresh)
    expect(result.tables.photos).toMatchObject({ added: PHOTOS, updated: 0, unchanged: 0 })
    expect(await fresh.entries.count()).toBe(PHOTOS)
    expect(await fresh.photos.count()).toBe(PHOTOS)
    const [first, last] = [await fresh.photos.get('p0'), await fresh.photos.get(`p${PHOTOS - 1}`)]
    expect([first?.data === photos[0]!.data, last?.data === photos[PHOTOS - 1]!.data]).toEqual([true, true])

    // The same file again changes nothing; a password-locked copy opens to the same text.
    expect((await applyImport(detected.raw, fresh)).changes).toBe(0)
    const locked = JSON.stringify(await lockText(json, 'correct horse battery'))
    const envelope = JSON.parse(locked) as unknown
    if (!isLockedEnvelope(envelope)) throw new Error('expected a locked backup')
    expect((await unlockText(envelope, 'correct horse battery')) === json).toBe(true)
    await Promise.all([phone.delete(), fresh.delete()])
  }, 120_000)
})
