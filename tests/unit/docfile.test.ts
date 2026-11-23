import { describe, expect, it } from 'vitest'
import { formatDateKey } from '../../src/lib/dates'
import { MAX_PDF_BYTES } from '../../src/db/documents'
import { DOCUMENT_PROBLEMS, fileOf, readDocumentFile, titleFromName } from '../../src/lib/docfile'

// Step 5 (owner-approved plan, 2026-11-23): a chosen file becomes a document. Fictional files only.
describe('titleFromName', () => {
  it('takes a title from the file’s name, and the day for a camera’s name, which says nothing', () => {
    expect(titleFromName('Tenancy agreement.pdf', '2026-11-23')).toBe('Tenancy agreement')
    expect(titleFromName('home_insurance_policy.PDF', '2026-11-23')).toBe('home insurance policy')
    expect(titleFromName('IMG_0042.jpg', '2026-11-23')).toBe(`Document ${formatDateKey('2026-11-23')}`)
    expect(titleFromName('image.jpg', '2026-11-23')).toBe(`Document ${formatDateKey('2026-11-23')}`)
    expect(titleFromName('.pdf', '2026-11-23')).toBe(`Document ${formatDateKey('2026-11-23')}`)
  })
})

describe('readDocumentFile', () => {
  it('refuses what is not a PDF or a photo, and a PDF over the size a backup should carry, saying what to do', async () => {
    await expect(readDocumentFile(new File(['hello'], 'notes.docx', { type: 'application/msword' }), '2026-11-23', null)).rejects.toThrow(DOCUMENT_PROBLEMS.type)
    await expect(readDocumentFile(new File([new Uint8Array(MAX_PDF_BYTES + 1)], 'big.pdf', { type: 'application/pdf' }), '2026-11-23', null)).rejects.toThrow(DOCUMENT_PROBLEMS.big)
  })
  it('words its problems for a document, not a statement', () => {
    for (const words of Object.values(DOCUMENT_PROBLEMS)) expect(words).not.toMatch(/statement|bank/i)
  })
})

describe('fileOf', () => {
  it('is named for the document with the right ending, and holds the bytes it was kept as', async () => {
    const pdf = fileOf('Home: insurance / policy', 'pdf', btoa('abc'))
    expect([pdf.name, pdf.type, await pdf.text()]).toEqual(['Home insurance policy.pdf', 'application/pdf', 'abc'])
    expect(fileOf('', 'image', btoa('x')).name).toBe('Document.jpg')
  })
})
