import { describe, expect, it } from 'vitest'
import type { Product } from '../../src/db/types'
import { compareShops, productViews, sizeOf, unitPriceOf } from '../../src/domain/products'
import type { ReceiptItem } from '../../src/domain/receipts'
import { type KnownReceipt, shopKey } from '../../src/domain/shopping'

// Step 3 (owner-approved plan, 2026-11-23): what you paid for a product, at each shop, per litre or kilogram where the
// receipt prints a size. Fictional receipts only.

describe('sizeOf: a size the receipt prints in an item’s name', () => {
  it('reads weight, volume, pints and packs into grams, millilitres and counts', () => {
    const sized = (name: string) => {
      const s = sizeOf(name)
      return s ? [s.kind, Math.round(s.base)] : null
    }
    expect(sized('Semi Skimmed Milk 2.27L')).toEqual(['litre', 2270])
    expect(sized('SEMI SKIMMED MILK 2PT')).toEqual(['litre', 1136])
    expect(sized('Cheddar mature 400g')).toEqual(['kg', 400])
    expect(sized('Basmati rice 1.5kg')).toEqual(['kg', 1500])
    expect(sized('Orange juice 750ml')).toEqual(['litre', 750])
    expect(sized('Cola 33cl')).toEqual(['litre', 330])
    expect(sized('Yoghurt 4 x 125g')).toEqual(['kg', 500])
    expect(sized('Eggs 6PK')).toEqual(['each', 6])
    expect(sized('Eggs x6')).toEqual(['each', 6])
    expect(sized('Avocados 4ct')).toEqual(['each', 4])
    expect(sized('Greek yoghurt, 4 pack')).toEqual(['each', 4])
  })

  it('reads nothing from what only looks like a size', () => {
    for (const name of ['Ibuprofen 200mg', 'Sun cream SPF50', 'Bananas', 'Oat milk', 'Batteries AA 4']) expect(sizeOf(name), name).toBeNull()
  })
})

const item = (name: string, price: number, over: Partial<ReceiptItem> = {}): ReceiptItem => ({ name, price, quantity: 1, ...over })
const receipt = (id: string, shop: string, date: string, items: ReceiptItem[], over: Partial<KnownReceipt> = {}): KnownReceipt => ({
  id,
  entryId: `e-${id}`,
  shop,
  date,
  currency: '£',
  total: items.reduce((s, i) => s + i.price, 0),
  adds: true,
  items,
  dated: true,
  readBy: null,
  ...over,
})

describe('unitPriceOf: what one litre, kilogram or item cost', () => {
  it('divides the line by its quantity, then by its size', () => {
    expect(unitPriceOf(item('Semi Skimmed Milk 2.27L', 165))).toMatchObject({ kind: 'litre' })
    expect(Math.round(unitPriceOf(item('Semi Skimmed Milk 2.27L', 165))!.perUnit)).toBe(73)
    // "2 @ 1.10 2.20": a line of 220 for 2 items: 110 each.
    expect(Math.round(unitPriceOf(item('Bread 800g', 220, { quantity: 2 }))!.perUnit)).toBe(Math.round((110 / 800) * 1000))
    expect(unitPriceOf(item('Eggs 6PK', 270))!.perUnit).toBe(45)
    expect(unitPriceOf(item('Bananas', 95))).toBeNull()
    expect(unitPriceOf(item('Chicken breast 0.65kg @ 7.00/kg', 455))).toBeNull() // sold by weight: no size to divide by
    expect(unitPriceOf(item('Clubcard saving', -50))).toBeNull()
  })

  it('reads the size from your AI’s plain name when the printed one has none', () => {
    expect(unitPriceOf(item('GRK YOG', 250, { plain: 'Greek yoghurt, 4 pack' }))).toMatchObject({ kind: 'each', perUnit: 62.5 })
  })
})

describe('productViews: one product at each shop, by what each shop prints', () => {
  const MILK = 'Semi Skimmed Milk 2.27L'
  const receipts = [
    receipt('t1', 'Tesco Express', '2026-09-12', [item(MILK, 145), item('Bananas', 95)]),
    receipt('t2', 'TESCO', '2026-10-03', [item(MILK, 145)]),
    receipt('t3', 'Tesco Stores Ltd', '2026-10-17', [item(MILK, 165)]),
    receipt('a1', 'Asda', '2026-10-05', [item('Milk Semi Skimmed 2.27L', 155), item('Pasta 500g', 80, { saving: 30 })]),
    receipt('m1', 'M&S', '2026-10-09', [item('Whole milk 1L', 140), item('Returned thing', 300, { returned: true })]),
  ]
  const views = () => productViews(receipts, [])
  const milk = () => views().find((v) => v.title === MILK)!

  it('keeps a chain’s names as one shop and counts each time it was bought', () => {
    expect(milk().shops).toHaveLength(1)
    expect(milk()).toMatchObject({ times: 3, regular: false })
    expect(milk().last).toMatchObject({ date: '2026-10-17', each: 165 })
    expect(milk().shops[0]!.sightings.map((s) => [s.date, s.each])).toEqual([['2026-09-12', 145], ['2026-10-03', 145], ['2026-10-17', 165]])
  })

  it('says what changed last, at the same shop, from the shelf price', () => {
    expect(milk().change).toMatchObject({ from: 145, to: 165, fromDate: '2026-10-03', toDate: '2026-10-17' })
    expect(views().find((v) => v.title === 'Bananas')!.change).toBeNull()
  })

  it('counts an offer apart: the shelf price stays the price, the offer is told', () => {
    const pasta = views().find((v) => v.title === 'Pasta 500g')!
    expect(pasta.last).toMatchObject({ each: 80, saving: 30 })
  })

  it('leaves out what you returned, and every saving row', () => {
    expect(views().some((v) => v.title === 'Returned thing')).toBe(false)
    expect(views().some((v) => v.title.toLowerCase().includes('saving'))).toBe(false)
  })

  it('suggests another shop’s look-alike, never joins it, and only when the unit prices can be compared', () => {
    const suggested = milk().similar.map((s) => [s.title, s.shop])
    expect(suggested).toEqual([['Milk Semi Skimmed 2.27L', 'Asda']])
    // Whole milk, 1L, at M&S: a different product, said not to be even close.
    expect(milk().similar.some((s) => s.shop === 'M&S')).toBe(false)
    expect(milk().shops).toHaveLength(1)
    expect(compareShops(milk())).toBeNull()
  })

  it('joins them once you said they are the same, and compares by the litre with last-seen dates', () => {
    const record: Product = { id: 'p1', members: ['tesco|semi skimmed milk 2.27l', 'asda|milk semi skimmed 2.27l'], notSame: [], regular: true, createdAt: 1, updatedAt: 1 }
    const joined = productViews(receipts, [record])
    const one = joined.find((v) => v.id === 'p1')!
    expect(one).toMatchObject({ regular: true, times: 4 })
    expect(one.shops).toHaveLength(2)
    const compare = compareShops(one)!
    expect(compare.kind).toBe('litre')
    expect(compare.rows.map((r) => [shopKey(r.shop), Math.round(r.perUnit), r.date])).toEqual([['asda', 68, '2026-10-05'], ['tesco', 73, '2026-10-17']])
    expect(shopKey(compare.cheaper!.shop)).toBe('asda')
    expect(Math.round(compare.cheaper!.lessBy)).toBe(5)
    // Joined, the look-alike is no longer a product of its own, and nothing is suggested again.
    expect(joined.some((v) => v.title === 'Milk Semi Skimmed 2.27L' && v.id !== 'p1')).toBe(false)
  })

  it('does not suggest again what you said is not the same', () => {
    const record: Product = { id: 'p2', members: ['tesco|semi skimmed milk 2.27l'], notSame: ['asda|milk semi skimmed 2.27l'], regular: false, createdAt: 1, updatedAt: 1 }
    expect(productViews(receipts, [record]).find((v) => v.id === 'p2')!.similar).toEqual([])
  })

  it('drops a member whose receipts are gone, and a record left with none', () => {
    const record: Product = { id: 'p3', members: ['aldi|nothing bought'], notSame: [], regular: true, createdAt: 1, updatedAt: 1 }
    expect(productViews(receipts, [record]).some((v) => v.id === 'p3')).toBe(false)
  })

  it('compares nothing for one shop, or for sizes that cannot be told apart by unit', () => {
    const no = productViews([receipt('x', 'Tesco', '2026-10-01', [item('Bananas', 95)]), receipt('y', 'Asda', '2026-10-02', [item('Bananas', 90)])], [{ id: 'b', members: ['tesco|bananas', 'asda|bananas'], notSame: [], regular: false, createdAt: 1, updatedAt: 1 }])
    expect(compareShops(no.find((v) => v.id === 'b')!)).toBeNull()
  })
})
