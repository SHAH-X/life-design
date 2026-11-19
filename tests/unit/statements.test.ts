import { describe, expect, it } from 'vitest'
import { readStatement, type TextPiece } from '../../src/domain/statements'
import { piecesFromPdf } from '../../src/lib/pdfText'
import { makePdf, type Placed, piecesOf } from '../fixtures/pdf'
import { CARD_EXPECT, CARD_LIKE, FIRSTDIRECT_EXPECT, FIRSTDIRECT_LIKE, FIRSTDIRECT_PERIOD, FLEX_EXPECT, FLEX_LIKE, FLEX_TABLE_ON_PAGE_2, LLOYDS_EXPECT, LLOYDS_LIKE, MONZO_EXPECT, MONZO_LIKE } from '../fixtures/statements'

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

  it('reads one laid out like Monzo Flex’s: both money columns filled, a balance you owe, named from its title (owner, 2026-10-26)', () => {
    expect(asRead(piecesOf(FLEX_LIKE))).toEqual(FLEX_EXPECT)
    const read = readStatement(piecesOf(FLEX_LIKE))
    if ('problem' in read) throw new Error(read.problem)
    expect(read.accounts[0]!.lines.every((l) => l.adds)).toBe(true)
  })

  it('names and dates a Flex statement whose table starts on a later page than its title, as the whole statement (owner, 2026-11-01: it came in as "Account", dated by its first and last lines)', () => {
    expect(piecesOf(FLEX_TABLE_ON_PAGE_2).some((p) => p.page === 2 && p.str === 'Flex statement')).toBe(false)
    expect(asRead(piecesOf(FLEX_TABLE_ON_PAGE_2))).toEqual(FLEX_EXPECT)
  })

  it('reads one laid out like a credit card’s: headings on two lines, two dates a line (the transaction’s counts), plain amounts as money out and "CR" as money in, the card number under its label, dated to its statement date (owner, 2026-11-10: it came back as "no-table")', () => {
    expect(asRead(piecesOf(CARD_LIKE))).toEqual(CARD_EXPECT)
  })

  it('reads one laid out like first direct’s: one heading over a code and its words (kerned apart), the date on a day’s first line and the balance on its last, "Balance brought/carried forward" lines left out, the number under its label, a period with no year on its first day (owner, 2026-11-19: it came back as "no-table")', () => {
    expect(asRead(piecesOf(FIRSTDIRECT_LIKE))).toEqual(FIRSTDIRECT_EXPECT)
  })

  it('reads a first direct period that crosses the new year, its first day in the year before', () => {
    const read = asRead(piecesOf(changed(FIRSTDIRECT_LIKE, FIRSTDIRECT_PERIOD, '18 December to 18 January 2027')))
    expect(Array.isArray(read) && [read[0]!.from, read[0]!.to]).toEqual(['2026-12-18', '2027-01-18'])
  })

  it('checks a first direct day’s printed balance against the day before, and works out the lines before it from it', () => {
    const fine = readStatement(piecesOf(FIRSTDIRECT_LIKE))
    if ('problem' in fine) throw new Error(fine.problem)
    expect(fine.accounts[0]!.lines.every((l) => l.adds)).toBe(true)
    // 325.65 misread as 325.60: that day's balance no longer follows, nor does the next day's, which went from it.
    const slipped = readStatement(piecesOf(changed(FIRSTDIRECT_LIKE, '325.65', '325.60')))
    if ('problem' in slipped) throw new Error(slipped.problem)
    expect(slipped.accounts[0]!.lines.map((l) => l.adds)).toEqual([true, true, true, true, true, false, true, false, true, true, true])
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
    expect(asRead(await piecesFromPdf(pdfjs, makePdf(CARD_LIKE)))).toEqual(CARD_EXPECT)
    expect(asRead(await piecesFromPdf(pdfjs, makePdf(FIRSTDIRECT_LIKE)))).toEqual(FIRSTDIRECT_EXPECT)
  })
})
