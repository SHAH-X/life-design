import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyImport, createBackup, detectFile } from '../../src/db/backup'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { addDocument, documentData, dismissDate, MAX_PDF_BYTES, removeDocument, setDocumentText, trackDate, untrackDate, updateDocument } from '../../src/db/documents'
import { isDocumentFile, isDocumentRecord } from '../../src/db/validate'
import { bytesToBase64 } from '../../src/db/crypto'

// Step 5 (owner-approved plan, 2026-11-23): your documents. A file is kept as it was added and never changed; nothing is deleted but
// by you. Fictional files only.
describe('documents you added', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const bytes = Uint8Array.from({ length: 3000 }, (_, i) => (i * 31 + 7) % 256)
  const draft = { title: 'Home insurance policy', type: 'Insurance', kind: 'pdf' as const, mime: 'application/pdf', size: bytes.length, pages: 6, text: 'Policy renewal date: 1 March 2027', data: bytesToBase64(bytes) }

  it('keeps the details and the file apart, the file exactly as it came, and a list never loads the files', async () => {
    const id = await addDocument(draft, phone)
    const record = await phone.documents.get(id)
    expect(record).toMatchObject({ title: 'Home insurance policy', type: 'Insurance', kind: 'pdf', size: 3000, pages: 6, tracked: [], dismissed: [], billId: null, notes: '' })
    expect(record).not.toHaveProperty('data')
    expect(await documentData(id, phone)).toBe(draft.data)
    expect(await phone.documentFiles.count()).toBe(1)
  })

  it('trims the title, and refuses what is not a document: no title, no file, a PDF over the size it keeps', async () => {
    const id = await addDocument({ ...draft, title: '  Policy  ' }, phone)
    expect((await phone.documents.get(id))!.title).toBe('Policy')
    await expect(addDocument({ ...draft, title: ' ' }, phone)).rejects.toThrow(/title/)
    await expect(addDocument({ ...draft, data: '' }, phone)).rejects.toThrow(/file/)
    await expect(addDocument({ ...draft, size: MAX_PDF_BYTES + 1 }, phone)).rejects.toThrow(/10 MB/)
    expect(await phone.documents.count()).toBe(1)
    expect(await phone.documentFiles.count()).toBe(1)
  })

  it('changes the title, type, notes and linked bill, and never the file', async () => {
    const id = await addDocument(draft, phone)
    await updateDocument(id, { title: ' Home cover ', type: 'Insurance', notes: 'Cancel online', billId: 'b1' }, phone)
    expect(await phone.documents.get(id)).toMatchObject({ title: 'Home cover', notes: 'Cancel online', billId: 'b1' })
    await updateDocument(id, { billId: null }, phone)
    expect((await phone.documents.get(id))!.billId).toBeNull()
    expect(await documentData(id, phone)).toBe(draft.data)
    await expect(updateDocument(id, { title: '  ' }, phone)).rejects.toThrow(/title/)
  })

  it('tracks a date once, and takes it back; a suggestion you dismiss is not tracked and a tracked one is not dismissed', async () => {
    const id = await addDocument(draft, phone)
    const renew = { date: '2027-03-01', kind: 'renews' as const, label: 'Policy renewal date' }
    await dismissDate(id, '2027-03-01|renews', phone)
    expect((await phone.documents.get(id))!.dismissed).toEqual(['2027-03-01|renews'])
    await trackDate(id, renew, phone)
    await trackDate(id, renew, phone)
    expect(await phone.documents.get(id)).toMatchObject({ tracked: [renew], dismissed: [] })
    await untrackDate(id, '2027-03-01|renews', phone)
    expect((await phone.documents.get(id))!.tracked).toEqual([])
    await Promise.all([trackDate(id, renew, phone), trackDate(id, { ...renew, date: '2027-04-01', kind: 'ends' }, phone), dismissDate(id, '2026-01-01|due', phone)])
    expect((await phone.documents.get(id))!.tracked.map((t) => t.date).sort()).toEqual(['2027-03-01', '2027-04-01'])
  })

  it('sets the words read from a file, and does nothing for a document that is gone', async () => {
    const id = await addDocument({ ...draft, text: null }, phone)
    await setDocumentText(id, 'Words read', phone)
    expect((await phone.documents.get(id))!.text).toBe('Words read')
    await setDocumentText('gone', 'x', phone)
    expect(await phone.documents.count()).toBe(1)
  })

  it('removes a document and its file together, and only that one', async () => {
    const a = await addDocument(draft, phone)
    await addDocument({ ...draft, title: 'Other' }, phone)
    await removeDocument(a, phone)
    expect((await phone.documents.toArray()).map((d) => d.title)).toEqual(['Other'])
    expect(await phone.documentFiles.count()).toBe(1)
    expect(await documentData(a, phone)).toBeNull()
  })

  it('is in a backup with its file byte for byte, restores, and a damaged one is refused', async () => {
    const id = await addDocument(draft, phone)
    await trackDate(id, { date: '2027-03-01', kind: 'renews', label: 'Policy renewal date' }, phone)
    const detected = detectFile(JSON.stringify(await createBackup(phone)))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const fresh = openDb(`fresh-${crypto.randomUUID()}`)
    await applyImport(detected.raw, fresh)
    expect(await fresh.documents.toArray()).toEqual(await phone.documents.toArray())
    expect(await documentData(id, fresh)).toBe(draft.data)
    await fresh.delete()
    const [record] = await phone.documents.toArray()
    const [file] = await phone.documentFiles.toArray()
    expect([isDocumentRecord(record), isDocumentRecord({ ...record, kind: 'word' }), isDocumentRecord({ ...record, tracked: [{ date: 'soon', kind: 'renews', label: '' }] }), isDocumentRecord({ ...record, pages: 0 }), isDocumentRecord({ ...record, size: 1.5 })]).toEqual([true, false, false, false, false])
    expect([isDocumentFile(file), isDocumentFile({ ...file, data: '' }), isDocumentFile({ ...file, data: 'not base64!' })]).toEqual([true, false, false])
  })
})
