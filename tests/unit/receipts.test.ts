import { describe, expect, it } from 'vitest'
import { readReceipt, receiptDate } from '../../src/domain/receipts'
import { type ExpectedReceipt, RECEIPTS, RECEIPTS_UNSEEN } from '../fixtures/receipts'

/** What the rules made of each fictional receipt, as the fixture writes it. */
const asRead = (c: ExpectedReceipt) => {
  const r = readReceipt(c.text)
  return r && { shop: r.shop, date: r.date, items: r.items.map((i) => [i.name, i.price] as const), total: r.total }
}

describe('readReceipt: a receipt in the text read from a photo', () => {
  it.each(RECEIPTS.map((c) => [c.id, c] as const))('reads %s as a person would', (_, c) => {
    expect(asRead(c)).toEqual(c.expect)
  })

  it.each(RECEIPTS_UNSEEN.map((c) => [c.id, c] as const))('reads %s, never used to write the rules, as a person would', (_, c) => {
    expect(asRead(c)).toEqual(c.expect)
  })

  it('checks the items add up to the printed total, and says when they don’t', () => {
    expect(readReceipt(RECEIPTS.find((c) => c.id === 'quantities-discount')!.text)?.adds).toBe(true)
    expect(readReceipt('SHOP\nBread 1.20\nMilk 0.90\nTOTAL 3.10')?.adds).toBe(false)
  })

  it('keeps how many of an item from a "2 x 0.89" line above it', () => {
    const pasta = readReceipt(RECEIPTS.find((c) => c.id === 'quantities-discount')!.text)?.items.find((i) => i.name === 'Pasta Fusilli')
    expect(pasta).toMatchObject({ price: 178, quantity: 2 })
  })

  it('reads dates in their usual orders, and US order only when it must be or with a $', () => {
    expect(receiptDate('03/04/2026', false)).toBe('2026-04-03')
    expect(receiptDate('03/04/2026', true)).toBe('2026-03-04')
    expect(receiptDate('10/17/2026', false)).toBe('2026-10-17')
    expect(receiptDate('no date here', false)).toBeNull()
  })

  it('reads a month named between hyphens or after a day with its ending ("25-Oct-2026", "28th October 2026")', () => {
    expect(receiptDate('Order Date: 25-0ct-2026', false)).toBe('2026-10-25')
    expect(receiptDate('Paid 28th October 2026', false)).toBe('2026-10-28')
  })

  it('never takes a collection or delivery day, or a card’s expiry, for when it was bought', () => {
    expect(receiptDate('Free collection in store from MARKET SQUARE on\nWed. 28th Oct 2026\nOrder Date: 25-Oct-2026', false)).toBe('2026-10-25')
    expect(receiptDate('Delivery date 30/10/2026\n24/10/2026 15:10', false)).toBe('2026-10-24')
    expect(receiptDate('Exp. Date 01/30/25', false)).toBeNull()
    // "home delivery or collection in store" names no day: the date under it is when it was bought.
    expect(receiptDate('Shop online for easy home\ndelivery or collection in store\n24/10/2026 15:10', false)).toBe('2026-10-24')
  })

  it('keeps a saving negative when the photo lost its minus, under "Balance before Saving"', () => {
    const r = readReceipt('SHOP\nTea 3.00\nBalance before Saving 3.00\n**£1 off with Sparks** 1.00\nBalance to Pay 2.00')
    expect(r?.items.map((i) => i.price)).toEqual([300, -100])
    expect(r?.adds).toBe(true)
  })

  it('never reads an amount stuck to letters as a price ("ne.auj9,28M")', () => {
    expect(readReceipt('SHOP\nTea 3.00\nWed 28th Oct ne.auj9,28M ts bneqe\nTOTAL 3.00')?.items.map((i) => i.name)).toEqual(['Tea'])
  })
})
