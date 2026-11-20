import { describe, expect, it } from 'vitest'
import type { BankLine, StatementRecord } from '../../src/db/types'
import { classify, linkGiftCards, linkReceipts, paymentsWithoutReceipt, receiptOutcomes, receiptPaymentCandidates } from '../../src/domain/money'
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
    expect(outcomes.get('gift')).toEqual({ state: 'gift', why: 'Paid by gift card · no gift card bought for about £5.00 in the accounts brought in' })
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

// Paid by gift card (owner 2026-11-20): the card was bought at a discount, so its "Blc" line is a little under what the
// receipt says went on it (£9.50 for a £10 card). A receipt paid by gift card is matched to that purchase, not to the exact sum.
describe('linkGiftCards: a receipt paid by gift card, and the gift card bought for a little less', () => {
  const buy = (date: string, pounds: number) => bank(date, pounds, 'BLC GIFTCARD DEMOTOWN')
  const paidByCard = (id: string, date: string, pounds: number, over: Partial<KnownReceipt> = {}) => receipt(id, 'Greenleaf Market', date, pounds, { byGiftCard: Math.round(pounds * 100), ...over })
  const link = (banks: BankLine[], receipts: KnownReceipt[]) => {
    const lines = classify(banks, new Set())
    return { lines, gift: linkGiftCards(lines, receipts) }
  }

  it('matches the Blc purchase of a little under what went on the card, bought before it', () => {
    const b = buy('2026-10-02', -9.5)
    const { gift, lines } = link([b], [paidByCard('r1', '2026-10-05', 10)])
    expect(gift.get('r1')?.id).toBe(lines[0]!.id)
  })

  it('matches only a purchase that cost no more than the amount, not far less, not after, not long before, not money back', () => {
    const none = (b: BankLine) => link([b], [paidByCard('r1', '2026-10-05', 10)]).gift.size === 0
    expect(none(buy('2026-10-02', -10.5))).toBe(true) // more than went on the card
    expect(none(buy('2026-10-02', -7))).toBe(true) // far less
    expect(none(buy('2026-10-06', -9.5))).toBe(true) // bought after
    expect(none(buy('2026-06-01', -9.5))).toBe(true) // months before
    expect(none(bank('2026-10-02', 9.5, 'BLC GIFTCARD DEMOTOWN'))).toBe(true) // money in
    expect(none(bank('2026-10-02', -9.5, 'GREENLEAF MARKET'))).toBe(true) // not a gift card
    expect(link([buy('2026-10-05', -10)], [paidByCard('r1', '2026-10-05', 10)]).gift.size).toBe(1) // the same day, no discount
  })

  it('uses each purchase once, the nearest before each receipt, oldest receipt first', () => {
    const { gift, lines } = link([buy('2026-09-20', -9.5), buy('2026-10-03', -9.5)], [paidByCard('late', '2026-10-09', 10), paidByCard('early', '2026-10-04', 10)])
    expect(gift.get('early')?.id).toBe(lines[1]!.id)
    expect(gift.get('late')?.id).toBe(lines[0]!.id)
    expect(link([buy('2026-10-03', -9.5)], [paidByCard('a', '2026-10-04', 10), paidByCard('b', '2026-10-05', 10)]).gift.size).toBe(1)
  })

  it('looks at what went on the card, not the whole receipt, and ignores a receipt with none or without a printed date', () => {
    const part = paidByCard('part', '2026-10-05', 35, { byGiftCard: 1000 })
    expect(link([buy('2026-10-02', -9.5)], [part]).gift.get('part')).toBeDefined()
    expect(link([buy('2026-10-02', -9.5)], [receipt('plain', 'Greenleaf Market', '2026-10-05', 10)]).gift.size).toBe(0)
    expect(link([buy('2026-10-02', -9.5)], [paidByCard('undated', '2026-10-05', 10, { dated: false, entryDate: '2026-10-05' })]).gift.size).toBe(0)
  })

  it('shows the receipt as matched, with the gift card’s purchase as its payment; a part-paid one is matched at the rest by card', () => {
    const banks = [buy('2026-10-02', -9.5), buy('2026-10-03', -9.5), bank('2026-10-06', -25, 'GREENLEAF MARKET SOMETOWN')]
    const lines = classify(banks, new Set())
    const receipts = [paidByCard('whole', '2026-10-05', 10), paidByCard('part', '2026-10-06', 35, { byGiftCard: 1000 }), paidByCard('none', '2026-10-07', 40)]
    const links = linkReceipts(lines, receipts)
    const gift = linkGiftCards(lines, receipts)
    const outcomes = receiptOutcomes(receipts, lines, links, {}, [statement(ACCOUNT, '2026-10-01', '2026-10-31')], names, gift)
    expect(outcomes.get('whole')).toMatchObject({ state: 'matched', giftCard: true, payment: { id: lines[1]!.id } })
    expect(outcomes.get('part')).toMatchObject({ state: 'matched', payment: { id: lines[2]!.id } })
    expect(outcomes.get('part')).not.toHaveProperty('giftCard')
    // No purchase left for the third: said so, in the same state as before.
    expect(outcomes.get('none')).toEqual({ state: 'gift', why: 'Paid by gift card · no gift card bought for about £40.00 in the accounts brought in' })
  })
})
