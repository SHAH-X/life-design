import { MAX_PDF_BYTES } from '../db/documents'
import { textFromPieces } from '../domain/documents'
import { formatDateKey } from './dates'
import { PhotoError, fromBase64, shrinkPhoto, toBase64 } from './photo'
import { PdfError, readPdfDocument } from './pdfText'
import { OcrError, type ReadPhoto } from './reader'

// A file chosen as a document (step 5, 2026-11-23): a PDF is kept byte for byte and its text read in PDF.js; a photo is shrunk like a
// receipt's and its text read by the on-phone reader when that is on. Nothing is sent anywhere.

export interface ReadDocument {
  title: string
  kind: 'pdf' | 'image'
  mime: string
  /** Bytes as kept. */
  size: number
  pages: number | null
  /** The words read; '' when there are none (a scan); null when not read yet. */
  text: string | null
  /** Base64. */
  data: string
}

/** What went wrong with a document's PDF, in words that fit here (not a statement's). */
export const DOCUMENT_PROBLEMS = {
  locked: 'This PDF has a password, so it can’t be read here. Save a copy without one and add that.',
  unreadable: 'This file couldn’t be opened as a PDF. Try another copy of it.',
  type: 'This isn’t a PDF or a photo. Add the document as a PDF, or take a photo of it.',
  big: 'This PDF is over 10 MB, more than a backup should carry. Save a smaller copy and add that.',
} as const

/** A title from a file's name: "Tenancy agreement.pdf" → "Tenancy agreement"; a camera's "IMG_0042.jpg" says nothing, so the day. */
export function titleFromName(name: string, today: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[_]+/g, ' ').trim()
  return !base || /^(img|image|photo|pxl|dsc|scan)[\s-]*\d*$/i.test(base) ? `Document ${formatDateKey(today)}` : base
}

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
const isImage = (file: File) => file.type.startsWith('image/')

/** Reads a chosen file for keeping. `ocr` reads a photo's words; none leaves them unread. Throws an Error whose message says what to do. */
export async function readDocumentFile(file: File, today: string, ocr: ReadPhoto | null): Promise<ReadDocument> {
  const title = titleFromName(file.name, today)
  if (isPdf(file)) {
    if (file.size > MAX_PDF_BYTES) throw new Error(DOCUMENT_PROBLEMS.big)
    let read: Awaited<ReturnType<typeof readPdfDocument>>
    try {
      read = await readPdfDocument(file)
    } catch (error) {
      throw new Error(DOCUMENT_PROBLEMS[error instanceof PdfError ? error.problem : 'unreadable'])
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    return { title, kind: 'pdf', mime: 'application/pdf', size: bytes.length, pages: read.pages, text: textFromPieces(read.pieces), data: toBase64(bytes) }
  }
  if (isImage(file)) {
    const shot = await shrinkPhoto(file).catch((error: unknown) => {
      throw new Error(error instanceof PhotoError ? error.message : new PhotoError().message)
    })
    let text: string | null = null
    if (ocr) {
      try {
        text = await ocr(fromBase64(shot.data))
      } catch (error) {
        // A photo that can't be read stays unread, to try again; any other problem is the reader's own to explain.
        if (!(error instanceof OcrError)) throw error
      }
    }
    return { title, kind: 'image', mime: 'image/jpeg', size: Math.floor((shot.data.length * 3) / 4), pages: null, text, data: shot.data }
  }
  throw new Error(DOCUMENT_PROBLEMS.type)
}

/** A kept file as a File, to send through the share menu: named for the document. */
export function fileOf(title: string, kind: 'pdf' | 'image', data: string): File {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Document'
  return new File([fromBase64(data) as Uint8Array<ArrayBuffer>], `${safe}.${kind === 'pdf' ? 'pdf' : 'jpg'}`, { type: kind === 'pdf' ? 'application/pdf' : 'image/jpeg' })
}
