import { describe, expect, it } from 'vitest'
import type { BankLine, StatementRecord } from '../../src/db/types'
import { classify, linkReceipts, paymentsWithoutReceipt, receiptOutcomes, receiptPaymentCandidates } from '../../src/domain/money'
import type { KnownReceipt } from '../../src/domain/shopping'
import { dayMonth } from '../../src/lib/dates'

// Receipts and the bank, from both sides (v0.35.0, owner 2026-11-19: "I can't see the link from both sides"): what became of
// each receipt, and which payments have none. Fictional lines and receipts only.

let n = 0
const bank = (date: string, pounds: number, description: string, account = 'Example ···1234', type = ''): BankLine => ({
  id: `b${n++}`, account, date, amount: Math.round(pounds * 100), description, type, balance: null, adds: true, createdAt: 1, updatedAt: 1,
})
const receipt = (id: string, shop: string, date: string, pounds: number, over: Partial<KnownReceipt> = {}): KnownReceipt => ({
  id, entryId: `e-${id}`, shop, date, currency: '£', total: Math.round(pounds * 100), adds: true, items: [{ name: 'Thing', price: Math.round(pounds * 100), quantity: 1 }], dated: true, readBy: null, ...over,
})
const statement = (account: string, from: string, to: string): StatementRecord => ({ id: `${account}:${from}:${to}`, account, from, to, lines: 1, createdAt: 1, updatedAt: 1 })

const ACCOUNT = 'Example ···1234'
const names = new Map([[ACCOUNT, 'Example']])

function run(banks: BankLine[], receipts: KnownReceipt[], statements = [statement(ACCOUNT, '2026-10-01', '2026-10-31')], cards: Record<string, string> = {}) {
  const lines = classify(banks, new Set())
  const links = linkReceipts(lines, receipts, {}, cards)
  const outcomes = receiptOutcomes(receipts, lines, links, cards, statements, names)
  return { lines, links, outcomes }
}

describe('receiptOutcomes: what became of a receipt', () => {
  it('matched: its payment, which is the one a payment shows as its receipt', () => {
    const b = bank('2026-10-05', -10.63, 'GREENLEAF MARKET SOMETOWN')
    const { outcomes, lines } = run([b], [receipt('r1', 'Greenleaf Market', '2026-10-05', 10.63)])
    expect(outcomes.get('r1')).toMatchObject({ state: 'matched', payment: { id: lines[0]!.id } })
  })

  it('says why there is no payment: no such payment, a different amount, a statement not in, a gift card, a card that is not yours', () => {
    const banks = [bank('2026-10-09', -3.1, 'CORNER CHEMIST SOMETOWN')]
    const { outcomes } = run(
      banks,
      [
        receipt('none', 'Greenleaf Market', '2026-10-05', 4.5),
        receipt('differs', 'Corner Chemist', '2026-10-09', 2.99),
        receipt('later', 'Greenleaf Market', '2026-11-12', 4.5),
        receipt('gift', 'Greenleaf Market', '2026-10-06', 5, { byGiftCard: 500 }),
        receipt('other', 'Greenleaf Market', '2026-10-07', 5, { card: { last4: '9999' } }),
        receipt('euro', 'Café', '2026-10-08', 5, { currency: '€' }),
      ],
      undefined,
      { '9999': '' },
    )
    expect(outcomes.get('none')).toEqual({ state: 'none', why: 'No payment of £4.50 within 3 days at Greenleaf Market in the accounts brought in' })
    expect(outcomes.get('differs')).toMatchObject({ state: 'maybe', why: `A payment of £3.10 on ${dayMonth('2026-10-09')} differs by £0.11` })
    expect(outcomes.get('later')).toEqual({ state: 'not-in', why: `No statement for ${dayMonth('2026-11-12')} brought in` })
    expect(outcomes.get('gift')).toEqual({ state: 'gift', why: 'Paid by gift card' })
    expect(outcomes.get('other')).toEqual({ state: 'elsewhere', why: 'Paid with a card that isn’t one of your accounts' })
    expect(outcomes.get('euro')).toEqual({ state: 'elsewhere', why: 'Not in pounds' })
  })

  it('says a points slip was paid with points and a nothing receipt had nothing to pay, not "gift card" (audit 2026-11-20)', () => {
    const { outcomes } = run([], [receipt('points', 'Greenleaf Market', '2026-10-06', 0, { points: 120 }), receipt('free', 'Greenleaf Market', '2026-10-07', 0)])
    expect(outcomes.get('points')).toEqual({ state: 'gift', why: 'Paid with points' })
    expect(outcomes.get('free')).toEqual({ state: 'gift', why: 'Nothing to pay on this receipt' })
  })

  it('does not take Trading 212’s statement, or another account’s, for the one a payment would be on, and says so when the card is not known (audit 2026-11-20)', () => {
    // Only a Trading 212 statement covers the day: the payment's own account has none brought in.
    const only212 = run([], [receipt('r', 'Greenleaf Market', '2026-10-05', 4.5)], [statement('Trading 212 ···0001', '2026-10-01', '2026-10-31')])
    expect(only212.outcomes.get('r')).toEqual({ state: 'not-in', why: `No statement for ${dayMonth('2026-10-05')} brought in` })
    // Another bank's statement does cover it, and no card is known: not found in the accounts brought in, which may not include it.
    const another = run([], [receipt('r', 'Greenleaf Market', '2026-10-05', 4.5)])
    expect(another.outcomes.get('r')).toEqual({ state: 'none', why: 'No payment of £4.50 within 3 days at Greenleaf Market in the accounts brought in' })
  })

  it('names the account whose statement is missing when the card says which it is', () => {
    const { outcomes } = run([], [receipt('r1', 'Greenleaf Market', '2026-11-12', 4.5, { card: { last4: '1234' } })], undefined, { '1234': ACCOUNT })
    expect(outcomes.get('r1')).toEqual({ state: 'not-in', why: `Example statement for ${dayMonth('2026-11-12')} not in yet` })
  })

  it('offers a payment as a maybe when the receipt has no printed date, never as matched', () => {
    const { outcomes } = run([bank('2026-10-05', -10.63, 'GREENLEAF MARKET SOMETOWN')], [receipt('r1', 'Greenleaf Market', '2026-10-05', 10.63, { dated: false, entryDate: '2026-10-05' })])
    expect(outcomes.get('r1')).toMatchObject({ state: 'maybe', why: `Date not read: a payment of £10.63 on ${dayMonth('2026-10-05')} could be it` })
  })
})

describe('paymentsWithoutReceipt: payments you would expect a receipt for', () => {
  it('lists shop payments since your first receipt that no receipt is linked to, and leaves out bills, moves and what a receipt could still match', () => {
    const banks = [
      bank('2026-09-20', -8, 'GREENLEAF MARKET SOMETOWN'), // before your first receipt
      bank('2026-10-05', -10.63, 'GREENLEAF MARKET SOMETOWN'), // linked
      bank('2026-10-06', -6.2, 'GREENLEAF MARKET SOMETOWN'), // no receipt
      bank('2026-10-07', -45, 'EXAMPLE ENERGY', ACCOUNT, 'DD'), // a bill
      bank('2026-10-08', -3.1, 'CORNER CHEMIST SOMETOWN'), // a receipt could still be its own (differs)
    ]
    const receipts = [receipt('r1', 'Greenleaf Market', '2026-10-05', 10.63), receipt('r2', 'Corner Chemist', '2026-10-08', 2.99)]
    const lines = classify(banks, new Set())
    const links = linkReceipts(lines, receipts)
    const linked = new Set([...links.values()].map((r) => r.id))
    const possible = new Set(receipts.filter((r) => !linked.has(r.id)).flatMap((r) => receiptPaymentCandidates(lines, r, new Set(links.keys())).map((l) => l.id)))
    expect(paymentsWithoutReceipt(lines, links, {}, receipts, possible).map((l) => l.description)).toEqual(['GREENLEAF MARKET SOMETOWN'])
  })
})
