// Made-up PDFs for tests (v0.20): text placed exactly where given, in Helvetica, the way a bank's statement places
// it. Statements in tests are fictional (tests/fixtures/statements.ts); no real one is ever kept in the repo.

/** A piece of text on a page: its left edge (or right edge, for figures aligned right), its baseline, its size. A tiny
 *  size (0.05) is text a screen reader hears but nobody sees (a bank's hidden labels). */
export interface Placed {
  text: string
  x: number
  y: number
  size?: number
  right?: boolean
}

/** Helvetica's widths (thousandths of the size) for what's aligned right: figures and money. */
const WIDTHS: Record<string, number> = { '.': 278, ',': 278, '-': 333, '+': 584, '£': 556, ' ': 278, '(': 333, ')': 333 }
export const widthOf = (text: string, size: number) => ([...text].reduce((w, c) => w + (WIDTHS[c] ?? 556), 0) * size) / 1000

/** The pieces PDF.js gives for these pages, without a PDF: for tests of the reader alone. */
export const piecesOf = (pages: readonly (readonly Placed[])[]) =>
  pages.flatMap((page, i) =>
    page.map(({ text, x, y, size = 9, right }) => {
      const w = widthOf(text, size)
      return { str: text, x: right ? x - w : x, y, w, size, page: i + 1 }
    }),
  )

/** PDF strings: brackets and backslashes escaped; £ is one byte in WinAnsi. */
const pdfString = (text: string) => text.replace(/[\\()]/g, (c) => `\\${c}`)

export function makePdf(pages: readonly (readonly Placed[])[]): Uint8Array {
  const objects: string[] = []
  const add = (body: string) => objects.push(body) // object n is objects[n - 1]
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // the page tree, once the pages are numbered
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const kids: number[] = []
  for (const page of pages) {
    const content = page
      .map(({ text, x, y, size = 9, right }) => `BT /F1 ${size} Tf ${(right ? x - widthOf(text, size) : x).toFixed(2)} ${y} Td (${pdfString(text)}) Tj ET`)
      .join('\n')
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`)
    kids.push(objects.length)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = pdf.length
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  // One byte per character: WinAnsi (£ is 0xA3).
  return Uint8Array.from([...pdf].map((c) => c.charCodeAt(0) & 0xff))
}
