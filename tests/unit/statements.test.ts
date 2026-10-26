import { describe, expect, it } from 'vitest'
import { readStatement, type TextPiece } from '../../src/domain/statements'
import { piecesFromPdf } from '../../src/lib/pdfText'
import { makePdf, type Placed, piecesOf } from '../fixtures/pdf'
import { LLOYDS_EXPECT, LLOYDS_LIKE, MONZO_EXPECT, MONZO_LIKE } from '../fixtures/statements'

// Bank statements (v0.20), fictional ones laid out like the owner's real Monzo and Lloyds PDFs (tests/fixtures).

/** What the reader made of a statement, as the fixtures write it. */
function asRead(pieces: readonly TextPiece[]) {
  const read = readStatement(pieces)
  if ('problem' in read) return read
  return read.accounts.map((a) => ({ account: a.account, from: a.from, to: a.to, lines: a.lines.map((l) => [l.date, l.description, l.amount, l.type, l.balance]) }))
}

/** A layout with one printed piece of text changed. */
const changed = (pages: Placed[][], from: string, to: string) => pages.map((page) => page.map((p) => (p.text === from ? { ...p, text: to } : p)))

describe('readStatement: a statement read from where its words sit on the page', () => {
  it('reads one laid out like Monzo’s: newest first, wrapped descriptions, a second page with no headings, and a pot', () => {
    expect(asRead(piecesOf(MONZO_LIKE))).toEqual(MONZO_EXPECT)
  })

  it('reads one laid out like Lloyds’: money in and out by their columns, its types, hidden labels skipped', () => {
    expect(asRead(piecesOf(LLOYDS_LIKE))).toEqual(LLOYDS_EXPECT)
  })

  it('checks every line against the balance printed beside it, and says which don’t follow', () => {
    const fine = readStatement(piecesOf(LLOYDS_LIKE))
    if ('problem' in fine) throw new Error(fine.problem)
    expect(fine.accounts[0]!.lines.map((l) => l.adds)).toEqual([true, true, true, true])
    // 10.99 misread as 10.90: its balance no longer follows; the next line's still does.
    const slipped = readStatement(piecesOf(changed(LLOYDS_LIKE, '10.99', '10.90')))
    if ('problem' in slipped) throw new Error(slipped.problem)
    expect(slipped.accounts[0]!.lines.map((l) => l.adds)).toEqual([true, true, false, true])
  })

  it('refuses a PDF with no words (a scan), and one with no transactions, saying which', () => {
    expect(readStatement([])).toEqual({ problem: 'no-text' })
    expect(readStatement(piecesOf([[{ text: 'Dear customer, your new card is on its way.', x: 57, y: 700 }]]))).toEqual({ problem: 'no-table' })
  })
})

describe('reading a PDF on the phone (PDF.js)', () => {
  it('gives the reader what it needs from real PDF files, for both layouts', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    expect(asRead(await piecesFromPdf(pdfjs, makePdf(MONZO_LIKE)))).toEqual(MONZO_EXPECT)
    expect(asRead(await piecesFromPdf(pdfjs, makePdf(LLOYDS_LIKE)))).toEqual(LLOYDS_EXPECT)
  })
})
