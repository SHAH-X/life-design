import { describe, expect, it } from 'vitest'
import { classify } from '../../src/domain/money'
import { readStatement, type TextPiece } from '../../src/domain/statements'
import { notMatchingWords } from '../../src/domain/trading212'
import { piecesFromPdf } from '../../src/lib/pdfText'
import { makePdf, piecesOf } from '../fixtures/pdf'
import { activityLike, TRADING212_EXPECT, TRADING212_INVESTING_EXPECT, TRANSACTIONS_LIKE } from '../fixtures/trading212'

// Trading 212's two documents (v0.34.0, owner 2026-11-19: his transfers to it counted as spending): the cash it took in and
// paid out, as an account of its own. Fictional statements only.

function asRead(pieces: readonly TextPiece[]) {
  const read = readStatement(pieces)
  if ('problem' in read) return read
  return read.accounts.map((a) => ({ account: a.account, from: a.from, to: a.to, lines: a.lines.map((l) => [l.date, l.description, l.amount, l.type, l.balance]) }))
}

describe('a Trading 212 Transactions Statement', () => {
  it('is its transfers in and out, as the account it is by the last four of its ID; interest, a table carried over a page and empty accounts handled', () => {
    expect(asRead(piecesOf(TRANSACTIONS_LIKE))).toEqual(TRADING212_EXPECT)
  })
})

describe('a Trading 212 Activity statement', () => {
  it('is the same transfers, found among trades, dividends and positions it must not read as money moved, dated by the days it says (its start is midnight UK time)', () => {
    expect(asRead(piecesOf(activityLike()))).toEqual(TRADING212_EXPECT)
  })

  it('checks the transfers against its overview’s deposits and withdrawals, and flags them when they differ', () => {
    const fine = readStatement(piecesOf(activityLike()))
    if ('problem' in fine) throw new Error(fine.problem)
    expect(fine.accounts[0]!.lines.every((l) => l.adds)).toBe(true)
    // The overview says £160.00 came in, the lines say £150.00.
    const off = readStatement(piecesOf(activityLike(16000)))
    if ('problem' in off) throw new Error(off.problem)
    expect(off.accounts[0]!.lines.every((l) => !l.adds)).toBe(true)
  })
})

/** What a statement says about the account's trades, dividends and interest, as the fixtures write it. */
function investingOf(pieces: readonly TextPiece[]) {
  const read = readStatement(pieces)
  if ('problem' in read) throw new Error(read.problem)
  const one = read.investing?.[0]
  if (!one) return null
  const of = (kind: string) => one.lines.filter((l) => l.kind === kind)
  return {
    account: one.account,
    trades: of('trade').map((l) => [l.at, l.instrument, l.direction, l.orderId, l.value, l.fxFee, l.fees, l.result]),
    dividends: of('dividend').map((l) => [l.date, l.instrument, l.value, l.tax]),
    interest: of('interest').map((l) => [l.at, l.value]),
    summary: one.summary,
  }
}

describe('Trading 212’s trades, dividends and interest (v0.36.0)', () => {
  it('reads an Activity statement’s trades (fees and what each sale made), dividends (after tax, and the tax) and interest, with its overview’s figures and none of them in doubt', () => {
    const read = investingOf(piecesOf(activityLike()))!
    expect(read.account).toBe('Trading 212 ···0001')
    expect(read.trades).toEqual(TRADING212_INVESTING_EXPECT.trades)
    expect(read.dividends).toEqual(TRADING212_INVESTING_EXPECT.dividends)
    expect(read.interest).toEqual(TRADING212_INVESTING_EXPECT.interest)
    expect(read.summary).toEqual(TRADING212_INVESTING_EXPECT.summary)
  })

  it('says which of the overview’s totals the lines do not add up to', () => {
    const off = investingOf(piecesOf(activityLike(undefined, { 'FX fee': -200, 'Closed result': 9999 })))!
    expect(off.summary!.mismatches).toEqual(['FX fees £1.15, the statement says £2.00', 'Closed result £12.74, the statement says £99.99'])
  })

  it('reads a Transactions Statement’s interest, the same lines as the Activity statement’s, and no totals', () => {
    const read = investingOf(piecesOf(TRANSACTIONS_LIKE))!
    expect(read.interest).toEqual(TRADING212_INVESTING_EXPECT.interest)
    expect(read.trades).toEqual([])
    expect(read.dividends).toEqual([])
    expect(read.summary).toBeNull()
  })
})

describe('Trading 212’s documents as real PDFs (PDF.js joins words that touch, so this is what the phone reads)', () => {
  it('reads both documents’ transfers, and the Activity statement’s trades, dividends, interest and totals, as it does the pieces', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    expect(asRead(await piecesFromPdf(pdfjs, makePdf(TRANSACTIONS_LIKE)))).toEqual(TRADING212_EXPECT)
    const activity = await piecesFromPdf(pdfjs, makePdf(activityLike()))
    expect(asRead(activity)).toEqual(TRADING212_EXPECT)
    const read = investingOf(activity)!
    expect(read.trades).toEqual(TRADING212_INVESTING_EXPECT.trades)
    expect(read.dividends).toEqual(TRADING212_INVESTING_EXPECT.dividends)
    expect(read.interest).toEqual(TRADING212_INVESTING_EXPECT.interest)
    expect(read.summary).toEqual(TRADING212_INVESTING_EXPECT.summary)
  })
})

describe('Trading 212 in Money', () => {
  const bank = (id: string, date: string, pence: number, description: string, account = 'First Direct ···7887') => ({ id, account, date, amount: pence, description, type: '', balance: null, adds: true, createdAt: 1, updatedAt: 1 })
  const read = (pieces: readonly TextPiece[]) => {
    const r = readStatement(pieces)
    if ('problem' in r) throw new Error(r.problem)
    return r.accounts[0]!.lines.map((l, i) => ({ id: `t${i}`, account: r.accounts[0]!.account, ...l, createdAt: 1, updatedAt: 1 }))
  }

  it('pairs a payment to it with its deposit, and leaves a transfer with no bank side out of money in and out', () => {
    const lines = [...read(piecesOf(TRANSACTIONS_LIKE)), bank('b1', '2026-09-30', -10000, 'Example Broker Ref1'), bank('b2', '2026-10-02', -5000, 'Example Broker Ref2'), bank('b3', '2026-10-05', -2000, 'Example Broker Ref3')]
    const moved = classify(lines, new Set()).map((l) => [l.id, l.moving])
    // Both paired; the £20 has no deposit and stays what it is; the £75.25 payout has no bank side and is still no spending.
    expect(Object.fromEntries(moved)).toEqual({ t0: 'between', t1: 'between', t2: 'own', b1: 'between', b2: 'between', b3: null })
  })

  it('never counts its own lines as money in or out, with no bank statement in at all', () => {
    expect(classify(read(piecesOf(TRANSACTIONS_LIKE)), new Set()).every((l) => l.moving !== null)).toBe(true)
  })
})

describe('notMatchingWords', () => {
  it('says what a line is checked against: a bank’s printed balance, Trading 212’s statement totals', () => {
    expect(notMatchingWords('Lloyds ···4321', 1)).toBe('1 doesn’t match its printed balance')
    expect(notMatchingWords('Lloyds ···4321', 3)).toBe('3 don’t match their printed balance')
    expect(notMatchingWords('Trading 212 ···0001', 1)).toBe('1 doesn’t match the statement’s totals')
    expect(notMatchingWords('Trading 212 ···0001', 2)).toBe('2 don’t match the statement’s totals')
  })
})
