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
})
