import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyImport, createBackup, detectFile } from '../../src/db/backup'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { ensurePhotoText } from '../../src/db/photoText'
import { deleteEntry, restoreEntry, saveEntry, savePhoto } from '../../src/db/repo'
import type { Entry, Photo } from '../../src/db/types'
import { isPhoto } from '../../src/db/validate'
import { entryTitle } from '../../src/domain/areas'
import { findLoops } from '../../src/domain/loops'
import { meaningText } from '../../src/domain/meaning'
import { buildReviewPackage } from '../../src/domain/review'
import { matchesSearch } from '../../src/domain/search'
import { fitWithin, fromBase64, toBase64 } from '../../src/lib/photo'
import { OcrError, type ReadPhoto } from '../../src/lib/reader'
import { areaEntry } from '../fixtures/areas'

// Fictional example data. A "photo" here is a few made-up bytes; a stand-in reader says what's "in" each.

let phone: LifeDesignDB
let newPhone: LifeDesignDB

const bytes = (s: string) => new TextEncoder().encode(s)
const photo = (id: string, entryId: string, contents: string): Photo => ({
  id,
  entryId,
  type: 'image/jpeg',
  width: 1500,
  height: 2000,
  data: toBase64(bytes(contents)),
  createdAt: 1,
  updatedAt: 1,
})
const withPhotos = (id: string, note: string, photos: Entry['photos']): Entry => ({ ...areaEntry({ id, text: note, expect: [] }), photos })

beforeEach(() => {
  phone = openDb(`phone-${crypto.randomUUID()}`)
  newPhone = openDb(`new-${crypto.randomUUID()}`)
})

afterEach(async () => {
  await phone.delete()
  await newPhone.delete()
})

describe('keeping photos', () => {
  it('fits a photo within 2000 px on its longest side, keeping its shape, and never makes one larger', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2000, height: 1500 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 1500, height: 2000 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('keeps a JPEG as base64 and gives back the same bytes', () => {
    const jpeg = new Uint8Array(70_000).map((_, i) => (i * 37) % 256)
    expect(fromBase64(toBase64(jpeg))).toEqual(jpeg)
  })

  it('lets a photo be all there is to free writing', async () => {
    const saved = await saveEntry({ ...withPhotos('x', '', [{ id: 'p1', text: null }]), kind: 'free' }, undefined, phone)
    expect(saved.photos).toEqual([{ id: 'p1', text: null }])
    expect(entryTitle(saved)).toBe('Photo')
    await expect(saveEntry({ ...withPhotos('y', '', []), kind: 'free' }, undefined, phone)).rejects.toThrow(/words or a photo/)
  })

  it('deletes an entry with its photos, and Undo brings both back', async () => {
    const entry = withPhotos('e1', 'Receipt from the market', [{ id: 'p1', text: 'TOTAL 14.20' }])
    await phone.entries.put(entry)
    await savePhoto(photo('p1', 'e1', 'jpeg-bytes'), phone)
    await savePhoto(photo('p2', 'other', 'another'), phone)
    const gone = await deleteEntry('e1', phone)
    expect(gone.map((p) => p.id)).toEqual(['p1'])
    expect((await phone.photos.toArray()).map((p) => p.id)).toEqual(['p2'])
    await restoreEntry(entry, gone, phone)
    expect(await phone.entries.get('e1')).toEqual(entry)
    expect(await phone.photos.get('p1')).toEqual(photo('p1', 'e1', 'jpeg-bytes'))
  })

  it('backs photos up and restores them; a damaged one is skipped, never imported', async () => {
    const entry = withPhotos('e1', 'Receipt from the market', [{ id: 'p1', text: 'TOTAL 14.20' }])
    await phone.entries.put(entry)
    await savePhoto(photo('p1', 'e1', 'jpeg-bytes'), phone)
    await phone.settings.put({ key: 'photoText', value: true, updatedAt: 1 })
    const backup = await createBackup(phone)
    expect(backup.schemaVersion).toBe(11)
    expect(backup.data.settings.map((s) => s.key)).not.toContain('photoText') // its download is this phone's
    const detected = detectFile(JSON.stringify(backup))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    await applyImport(detected.raw, newPhone)
    expect(await newPhone.entries.get('e1')).toEqual(entry)
    expect(await newPhone.photos.get('p1')).toEqual(photo('p1', 'e1', 'jpeg-bytes'))
    expect(isPhoto({ ...photo('p2', 'e1', 'x'), data: 'not base64!' })).toBe(false)
    expect(isPhoto({ ...photo('p2', 'e1', 'x'), type: 'image/png' })).toBe(false)
  })
})

describe('the text read from photos', () => {
  const receipt = withPhotos('r', '', [{ id: 'p1', text: 'GREENLEAF MARKET\nOat milk 1.45\nTOTAL 14.20' }])

  it('is found by search and read by search by meaning, and shows on the row', () => {
    expect(matchesSearch(receipt, 'oat milk')).toBe(true)
    expect(meaningText(receipt)).toContain('GREENLEAF MARKET Oat milk 1.45 TOTAL 14.20')
  })

  it('goes to a review as text, never the image', () => {
    const pack = buildReviewPackage(
      { entries: [{ ...receipt, date: '2026-10-21' }], days: [], answers: [], weeks: [], steps: [], purpose: { primary: 'free', focus: {}, goal: '' } },
      { start: '2026-10-19', end: '2026-10-25' },
      '',
    )
    expect(pack.data).toContain('Free writing')
    expect(pack.data).toContain('Text in a photo: GREENLEAF MARKET / Oat milk 1.45 / TOTAL 14.20')
    expect(pack.data).not.toContain(toBase64(bytes('jpeg-bytes')))
  })

  it('is never taken for an open loop: only your own words are', () => {
    const note = withPhotos('n', 'Lovely market.', [{ id: 'p1', text: 'Need to pay the parking fine by Friday.' }])
    expect(findLoops(note)).toEqual([])
  })
})

describe('ensurePhotoText: reading photos in the background', () => {
  const reader =
    (said: Record<string, string | OcrError>): ReadPhoto =>
    async (jpeg) => {
      const what = said[new TextDecoder().decode(jpeg)]
      if (what instanceof OcrError) throw what
      return what ?? ''
    }

  it('reads each photo not read yet, once, and keeps its text on its entry without making it an edit', async () => {
    await phone.entries.put({ ...withPhotos('e1', 'Shopping', [{ id: 'p1', text: null }, { id: 'p2', text: 'already read' }]), updatedAt: 5 })
    await savePhoto(photo('p1', 'e1', 'receipt'), phone)
    await savePhoto(photo('p2', 'e1', 'never asked'), phone)
    const asked: string[] = []
    const read: ReadPhoto = async (jpeg) => {
      asked.push(new TextDecoder().decode(jpeg))
      return 'TOTAL 14.20'
    }
    await ensurePhotoText(read, phone)
    expect(asked).toEqual(['receipt'])
    expect(await phone.entries.get('e1')).toMatchObject({ updatedAt: 5, photos: [{ id: 'p1', text: 'TOTAL 14.20' }, { id: 'p2', text: 'already read' }] })
  })

  it("keeps a photo that can't be opened, with no text, and stops at a download problem to try again later", async () => {
    await phone.entries.put(withPhotos('e1', 'Two photos', [{ id: 'bad', text: null }, { id: 'later', text: null }]))
    await savePhoto(photo('bad', 'e1', 'broken'), phone)
    await savePhoto(photo('later', 'e1', 'offline'), phone)
    await expect(ensurePhotoText(reader({ broken: new OcrError('photo'), offline: new OcrError('download') }), phone)).rejects.toThrow(/download/)
    expect((await phone.entries.get('e1'))?.photos).toEqual([
      { id: 'bad', text: '' },
      { id: 'later', text: null },
    ])
  })

  it('waits for a photo not written yet, instead of failing', async () => {
    await phone.entries.put(withPhotos('e1', 'Just added', [{ id: 'p1', text: null }]))
    await ensurePhotoText(reader({}), phone)
    expect((await phone.entries.get('e1'))?.photos).toEqual([{ id: 'p1', text: null }])
  })
})
