// Statements' PDFs read on the phone (v0.20): Mozilla's PDF.js (Apache-2.0) gives every piece of text with where it
// sits, for src/domain/statements.ts. Its worker comes with the app, and is handed the file itself, so it fetches
// nothing; scripts in the PDF never run (isEvalSupported off, no fonts loaded).
import type { TextPiece } from '../domain/statements'

export const PDF_PROBLEMS = {
  locked: 'This PDF has a password. Save the statement from your bank’s app again without one, then bring it in.',
  unreadable: 'This file couldn’t be opened as a PDF. Save the statement from your bank’s app as a PDF and try again.',
} as const

export class PdfError extends Error {
  constructor(readonly problem: keyof typeof PDF_PROBLEMS) {
    super(PDF_PROBLEMS[problem])
    this.name = 'PdfError'
  }
}

/** What's used of PDF.js: the app's build, or the legacy one in Node tests. */
interface PdfJs {
  getDocument(source: { data: Uint8Array; isEvalSupported: boolean; disableFontFace: boolean; useSystemFonts: boolean; verbosity: number }): {
    promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: readonly object[] }> }> }>
    destroy(): Promise<void>
  }
}

/** Every piece of text in a PDF, page by page. */
export async function piecesFromPdf(pdfjs: PdfJs, data: Uint8Array): Promise<TextPiece[]> {
  const task = pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 })
  try {
    let doc: Awaited<typeof task.promise>
    try {
      doc = await task.promise
    } catch (error) {
      throw new PdfError(error instanceof Error && error.name === 'PasswordException' ? 'locked' : 'unreadable')
    }
    const pieces: TextPiece[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const { items } = await (await doc.getPage(n)).getTextContent()
      for (const item of items as { str?: unknown; transform?: number[]; width?: number }[]) {
        if (typeof item.str !== 'string' || !item.str.trim() || !item.transform) continue
        const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = item.transform
        pieces.push({ str: item.str, x, y, w: item.width ?? 0, size: Math.hypot(c, d) || Math.hypot(a, b), page: n })
      }
    }
    return pieces
  } finally {
    await task.destroy()
  }
}

let worker: Worker | undefined

/** A statement's PDF, read in PDF.js's own worker. */
export async function readPdf(file: Blob): Promise<TextPiece[]> {
  const pdfjs = await import('pdfjs-dist')
  worker ??= new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
  pdfjs.GlobalWorkerOptions.workerPort = worker
  return piecesFromPdf(pdfjs as unknown as PdfJs, new Uint8Array(await file.arrayBuffer()))
}
