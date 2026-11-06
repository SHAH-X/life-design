import { describe, expect, it } from 'vitest'
import { isRefundSlip, paymentOf, readReceipt, receiptDate, receiptTime } from '../../src/domain/receipts'
import { type ExpectedReceipt, RECEIPTS, RECEIPTS_UNSEEN, REFUND_SLIP } from '../fixtures/receipts'

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

  // Owner, 2026-11-01: a return slip showed as £… spent; "just show it as refund receipt … don't include in any
  // calculation, as I will also be marking it as returned in the original receipt".
  it('knows a refund slip, and never takes a receipt with a refund policy for one', () => {
    expect(readReceipt(REFUND_SLIP)?.refund).toBe(true)
    for (const c of [...RECEIPTS, ...RECEIPTS_UNSEEN].filter((c) => c.expect && c.text !== REFUND_SLIP)) expect(readReceipt(c.text)?.refund, c.id).toBeFalsy()
    expect(isRefundSlip('SHOP\nREFUND RECEIPT', [{ price: 1100 }, { price: 500 }])).toBe(true)
    expect(isRefundSlip('SHOP', [{ price: -1100 }, { price: -500 }])).toBe(true)
    expect(isRefundSlip('Refunds may still be given\nlast date for a refund/exchange is', [{ price: 1600 }])).toBe(false)
    // Savings can take a total below nothing; that alone isn't a refund.
    expect(isRefundSlip('SHOP', [{ price: 100 }, { price: -60 }, { price: -60 }])).toBe(false)
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
    // A bank statement's two-digit year after a month's name (Lloyds, v0.20).
    expect(receiptDate('09 Oct 26', false)).toBe('2026-10-09')
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

  it('reads the till’s time beside the date, never another time on the receipt (v0.19.5)', () => {
    expect(receiptTime('Open 08:00-22:00\nSHOP\n25/10/26 15:05 0000 000', false)).toBe('15:05')
    expect(receiptTime('GREENLEAF MARKET\n12 Oct 2026 9:05\nTea 3.00', false)).toBe('09:05')
    expect(receiptTime('SHOP 08:00-22:00\n25/10/2026\nTea 3.00', false)).toBeNull()
  })

  it('never reads an amount stuck to letters as a price ("ne.auj9,28M")', () => {
    expect(readReceipt('SHOP\nTea 3.00\nWed 28th Oct ne.auj9,28M ts bneqe\nTOTAL 3.00')?.items.map((i) => i.name)).toEqual(['Tea'])
  })
})

// Which card paid (v0.24.0, owner 2026-11-06: "detect the card from the receipt … so I know which account to look for
// the statement"): the last 4 digits a receipt prints, read on the phone from the text already stored. Made-up numbers.
describe('paymentOf: the card a receipt was paid with', () => {
  const card = (text: string) => paymentOf(text).card ?? null

  it.each([
    ['VISA ending 4417', { last4: '4417', scheme: 'Visa' }],
    ['Card ending in 5520', { last4: '5520' }],
    ['DEBIT MASTERCARD\nCARD:465800XXXXXX2913 AUTH:004417', { last4: '2913', scheme: 'Mastercard' }],
    ['Visa Debit\nCard number: ************7731\nPAN SEQ 01', { last4: '7731', scheme: 'Visa' }],
    ['PAN: XXXX XXXX XXXX 6620\nMAESTRO', { last4: '6620', scheme: 'Maestro' }],
    ['AMERICAN EXPRESS\n***********1005', { last4: '1005', scheme: 'Amex' }],
    ['Contactless •••• 3304', { last4: '3304' }],
    ['CARD xxxx-xxxx-xxxx-8810 VISA', { last4: '8810', scheme: 'Visa' }],
  ])('reads %j', (text, expected) => {
    expect(card(text)).toEqual(expected)
  })

  it('never takes a gift card’s, the terminal’s, the merchant’s or an account’s number for the card', () => {
    expect(card('Gift Card *x*x xx*x 0000 £22.75\nNew Balance £0.00')).toBeNull()
    expect(card('ASDA GIFT CARD\n************4412\nBalance £0.00')).toBeNull()
    expect(card('MID: ****8812\nTID: ****0042')).toBeNull()
    expect(card('Merchant ID XXXX1234')).toBeNull()
    expect(card('Account number ****9087')).toBeNull()
    // A masked run before a date or a time is not a card.
    expect(card('**** 2026-10-24')).toBeNull()
  })

  it('reads no card when two different ones are printed, and one when it is printed twice (both copies of the slip)', () => {
    expect(card('VISA ************1111\nVISA ************2222')).toBeNull()
    expect(card('CUSTOMER COPY\nVISA ************3141\nMERCHANT COPY\nVISA ************3141')).toEqual({ last4: '3141', scheme: 'Visa' })
  })

  it('takes the number on a card’s line over one with no word before it', () => {
    expect(card('XXXXXXXXXXXX5555\nVISA XXXXXXXXXXXX1234')).toEqual({ last4: '1234', scheme: 'Visa' })
  })

  it('reads the card on the fixtures that print one, and none on those paid another way', () => {
    const of = (id: string) => card(RECEIPTS.find((c) => c.id === id)!.text)
    expect(of('cafe')).toEqual({ last4: '4417', scheme: 'Visa' })
    expect(of('ms-food-sparks')).toEqual({ last4: '0000', scheme: 'Mastercard' })
    for (const id of ['greenleaf', 'codes-and-marks', 'asda-price-first', 'ms-order-collection', 'asda-delivery-line', 'quantities-discount']) expect(of(id), id).toBeNull()
  })
})

// Paid by gift card (v0.24.1, owner 2026-11-06: gift cards bought through Blue Light Card, "Blc" on the statement): how
// much a receipt's tender lines after its total say went on a gift card. Made-up amounts.
describe('paymentOf: what went on a gift card', () => {
  const gift = (text: string) => paymentOf(text).byGiftCard ?? null

  it('reads a gift card’s tender line after the total, whatever is printed between', () => {
    expect(gift('SHOP\nTea £3.00\nTOTAL £3.00\nGift Card £3.00\nNew Balance £0.00')).toBe(300)
    expect(gift('SHOP\nTea £3.00\nBalance to Pay £3.00\nGift Card *x*x xx*x 0000 £3.00')).toBe(300)
    expect(gift('SHOP\nTea £3.00\nTOTAL: £3.00\nE-GIFT CARD 3.00')).toBe(300)
    expect(gift('SHOP\nTea £3.00\nTOTAL: £3.00\nGiftcard -u£3.00')).toBe(300)
  })

  it('reads part paid by gift card, the rest by card', () => {
    const paid = paymentOf('SHOP\nTea £23.40\nTOTAL £23.40\nGift Card £20.00\nVISA ************2468 £3.40\nGift Card Balance £0.00')
    expect(paid).toEqual({ byGiftCard: 2000, card: { last4: '2468', scheme: 'Visa' } })
  })

  it('never takes a balance left, a gift card bought as an item, or a line with no amount for money paid', () => {
    expect(gift('SHOP\nTea £3.00\nTOTAL £3.00\nVISA £3.00\nGift Card Balance £12.00\nRemaining balance £12.00')).toBeNull()
    expect(gift('SHOP\nGift card £20.00\nTOTAL £20.00\nVISA ************2468 £20.00')).toBeNull()
    expect(gift('SHOP\nTea £3.00\nTOTAL £3.00\nAsda Gift Card Redemption\n0000000000000000\n£3.00')).toBeNull()
    // No total read: nothing is after it.
    expect(gift('SHOP\nGift Card £3.00')).toBeNull()
  })

  it('reads the fixtures paid by gift card at their totals, and none on the rest', () => {
    const of = (id: string) => gift([...RECEIPTS, ...RECEIPTS_UNSEEN].find((c) => c.id === id)!.text)
    expect(['codes-and-marks', 'asda-price-first', 'ms-order-collection', 'asda-delivery-line', 'asda-unseen'].map(of)).toEqual([2275, 725, 2000, 700, 395])
    for (const id of ['cafe', 'ms-food-sparks', 'greenleaf', 'supermarket-vat']) expect(of(id), id).toBeNull()
  })
})
