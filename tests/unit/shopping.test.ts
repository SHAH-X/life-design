import { describe, expect, it } from 'vitest'
import { runTool } from '../../src/domain/ask'
import { type ItemKind, itemShown } from '../../src/domain/receipts'
import {
  amountsOf,
  inWords,
  type KnownReceipt,
  monthTotals,
  receiptsOf,
  shopKey,
  shoppingMonth,
  shoppingMonths,
  spendByShop,
} from '../../src/domain/shopping'
import { areaEntry } from '../fixtures/areas'

// Fictional receipts only. Today is Saturday 24 October 2026.

const TODAY = '2026-10-24'

const receipt = (id: string, shop: string, date: string, items: [name: string, price: number, quantity?: number][], over: Partial<KnownReceipt> = {}): KnownReceipt => {
  const list = items.map(([name, price, quantity = 1]) => ({ name, price, quantity }))
  return { id, entryId: `e-${id}`, shop, date, currency: '£', total: list.reduce((s, i) => s + i.price, 0), adds: true, items: list, dated: true, readBy: null, ...over }
}

const MILK = 'Semi Skimmed Milk 2.27L'
const RECEIPTS = [
  receipt('t1', 'Tesco Express', '2026-09-12', [[MILK, 145], ['Bananas', 95]]),
  receipt('s1', "Sainsbury's", '2026-09-20', [['Red wine', 800]]),
  receipt('s2', "Sainsbury's", '2026-09-28', [['Cheddar', 300]]),
  receipt('t2', 'TESCO', '2026-10-03', [[MILK, 145], ['Bananas', 95], ['Bread', 120]]),
  receipt('a1', 'ALDI', '2026-10-05', [['Bananas', 89], ['Coffee', 450]]),
  receipt('t3', 'Tesco', '2026-10-10', [['Bananas', 95], ['Loose Carrots 0.85kg', 60], ['Pasta', 80], ['Clubcard saving', -50]]),
  receipt('t4', 'Tesco Stores Ltd', '2026-10-17', [[MILK, 165], ['Loose Carrots 0.85kg', 70], ['Pasta', 80], ['Bread', 240, 2]]),
  receipt('a2', 'Aldi Stores Ltd', '2026-10-20', [['Coffee', 450]], { total: 999, adds: false }),
  receipt('x1', '', '2026-10-21', [['Thing', 200]]),
  receipt('c1', 'Café de Flore', '2026-10-22', [['Café crème', 730]], { currency: '€' }),
  receipt('j1', 'J Sainsbury plc', '2026-10-23', [['Big shop', 4210]], { dated: false }),
]
const ids = (receipts: readonly KnownReceipt[]) => receipts.map((r) => r.id)

describe('shopKey: one name for one shop', () => {
  it('reads a branch kind, a company word, "the", capitals and apostrophes as the same shop', () => {
    expect(new Set(['TESCO EXPRESS', 'Tesco', 'Tesco Stores Ltd', 'tesco extra', 'Tesco Metro'].map(shopKey))).toEqual(new Set(['tesco']))
    expect(shopKey("Sainsbury's Local")).toBe(shopKey('SAINSBURYS'))
    expect(shopKey('Co-op Food')).toBe(shopKey('CO-OP'))
    expect(shopKey('The Daily Grind Cafe')).toBe(shopKey('Daily Grind Cafe'))
  })

  it('keeps different shops apart, and keeps such a word when it starts the name', () => {
    expect(shopKey('Pizza Express')).not.toBe(shopKey('Pizza Hut'))
    expect(shopKey('M&S')).not.toBe(shopKey('Aldi'))
    expect(shopKey('Express')).toBe('express')
    expect(shopKey('Local Butcher')).toBe('local butcher')
  })

  it("reads a UK chain's other names, its company's included, as the chain: J Sainsbury plc is Sainsbury's", () => {
    const chains = [
      ["Sainsbury's", 'J Sainsbury plc', 'JS Sainsbury', "Sainsbury's Supermarkets Ltd", 'SAINSBURYS LOCAL'],
      ['M&S', 'M&S Simply Food', 'Marks & Spencer', 'Marks and Spencer plc', 'M & S'],
      ['Co-op', 'Co-op Food', 'The Co-operative Food', 'Co op'],
      ['Morrisons', 'Morrisons Daily', 'Wm Morrison Supermarkets', 'WM MORRISONS'],
      ['Lidl', 'Lidl GB', 'Lidl Great Britain Ltd'],
      ['Aldi', 'ALDI STORES LTD'],
      ['Asda', 'ASDA Superstore', 'Asda Stores Ltd'],
      ['Tesco', 'Tesco Stores Ltd', 'TESCO EXPRESS'],
      ['Waitrose', 'Waitrose & Partners'],
      ['Iceland', 'Iceland Foods Ltd'],
    ]
    for (const names of chains) expect(new Set(names.map(shopKey)), names[0]).toEqual(new Set([shopKey(names[0]!)]))
    // Each chain still its own shop.
    expect(new Set(chains.map((names) => shopKey(names[0]!))).size).toBe(chains.length)
  })
})

describe('one sum for Ask and the Shopping tab', () => {
  it("gives Ask's spend_by_shop exactly what spendByShop works out", async () => {
    const call = { id: 'c1', type: 'function' as const, function: { name: 'spend_by_shop', arguments: '{}' } }
    const { result } = await runTool(call, { receipts: RECEIPTS, findEntries: async () => [] })
    expect(JSON.parse(result)).toEqual(spendByShop(RECEIPTS))
  })
})

describe('receiptsOf: whether a date was read, and who read it', () => {
  it('counts a receipt with no date on its entry’s day, and says the AI read it when it did', () => {
    const reading = { by: 'Gemini · gemini-2.5-flash', at: 1, text: '', description: '', receipt: { shop: 'Greenleaf Market', date: null, currency: '£', items: [{ name: 'Oat milk', price: 165, quantity: 1 }], total: 165 } }
    const [byAi] = receiptsOf([{ ...areaEntry({ id: 'e1', text: '', expect: [] }, '2026-10-12'), photos: [{ id: 'p1', text: null, ai: reading }] }])
    expect(byAi).toMatchObject({ date: '2026-10-12', dated: false, readBy: 'Gemini · gemini-2.5-flash' })
    const [byPhone] = receiptsOf([{ ...areaEntry({ id: 'e2', text: '', expect: [] }, '2026-10-20'), photos: [{ id: 'p2', text: 'GREENLEAF MARKET\n12 Oct 2026\nOat milk 1.65\nTOTAL 1.65' }] }])
    expect(byPhone).toMatchObject({ date: '2026-10-12', dated: true, readBy: null })
  })
})

describe('shoppingMonth: a month, worked out on the phone', () => {
  const october = shoppingMonth(RECEIPTS, '2026-10', TODAY)

  it('totals the month exactly, pounds and euros apart, next to last month up to the same day', () => {
    expect(ids(october.receipts)).toEqual(['t2', 'a1', 't3', 't4', 'a2', 'x1', 'c1', 'j1'])
    // A receipt that doesn't add up counts what it printed (a2: £9.99).
    expect(inWords(october.spent)).toBe('£70.48 and €7.30')
    expect(october.before).toEqual({ until: '2026-09-24', receipts: [RECEIPTS[0], RECEIPTS[1]], spent: [{ currency: '£', minor: 1040 }] })
    // Only the month you're in has a "by this day last month".
    expect(shoppingMonth(RECEIPTS, '2026-09', TODAY).before).toBeNull()
    expect(inWords([])).toBe('nothing')
  })

  it('ranks only shops with 3 or more receipts, and lists the rest by name, a chain’s names as one', () => {
    expect(october.shops.ranked.map((s) => [s.name, ids(s.receipts), inWords(s.spent)])).toEqual([['TESCO', ['t2', 't3', 't4'], '£11.00']])
    expect(october.shops.others.map((s) => [s.name, ids(s.receipts)])).toEqual([
      ['ALDI', ['a1', 'a2']],
      ['Café de Flore', ['c1']],
      ['J Sainsbury plc', ['j1']],
      [null, ['x1']],
    ])
  })

  it('adds up what offers took off, and shops under £10 when there are 3 or more', () => {
    expect(october.offers).toEqual({ saved: [{ currency: '£', minor: 50 }], receipts: [RECEIPTS[5]] })
    expect(ids(october.small!.receipts)).toEqual(['t2', 'a1', 't3', 't4', 'a2', 'x1'])
    expect(inWords(october.small!.spent)).toBe('£28.38')
    // September has 3 under £10; with 2, it says nothing.
    expect(shoppingMonth(RECEIPTS, '2026-09', TODAY).small?.receipts.length).toBe(3)
    expect(shoppingMonth(RECEIPTS.filter((r) => r.id !== 's2'), '2026-09', TODAY).small).toBeNull()
  })

  it('finds a price change at the same shop, never between shops, by weight or in another quantity', () => {
    // Milk at Tesco: £1.45 on 3 Oct, £1.65 on 17 Oct. Bananas are 89p at Aldi and 95p at Tesco: not a change. Carrots
    // by weight, and two loaves against one, aren't either.
    expect(october.priceChanges.map((c) => [c.name, c.shop, c.before.price, c.before.receipt.id, c.now.price, c.now.receipt.id])).toEqual([[MILK, 'TESCO', 145, 't2', 165, 't4']])
    // A name at two prices on one receipt is two things printed alike: left out.
    const twoSizes = [receipt('m1', 'Tesco', '2026-10-01', [['Milk', 95], ['Milk', 165]]), receipt('m2', 'Tesco', '2026-10-08', [['Milk', 165]])]
    expect(shoppingMonth(twoSizes, '2026-10', TODAY).priceChanges).toEqual([])
    // Only changes seen in the month itself.
    expect(shoppingMonth(RECEIPTS, '2026-09', TODAY).priceChanges).toEqual([])
  })

  it('finds what was bought again and again: on 3 or more receipts over the last 3 months', () => {
    expect(october.repeats.map((r) => [r.name, ids(r.receipts), inWords(r.spent)])).toEqual([
      ['Bananas', ['t1', 't2', 'a1', 't3'], '£3.74'],
      [MILK, ['t1', 't2', 't4'], '£4.55'],
    ])
  })

  it('lists receipts to check, saying why', () => {
    expect(october.toCheck.map((c) => [c.receipt.id, c.why])).toEqual([
      ['a2', ["its items don't add up to its total"]],
      ['x1', ['no shop read']],
      ['j1', ['no date read, so it counts on the day you added it']],
    ])
  })
})

describe('kinds: what was bought, by the kind your AI gave each item', () => {
  const sorted = (id: string, date: string, items: [name: string, price: number, kind?: ItemKind][]) =>
    receipt(id, 'Tesco', date, [], { items: items.map(([name, price, kind]) => ({ name, price, quantity: 1, ...(kind ? { kind } : {}) })), total: items.reduce((s, [, p]) => s + p, 0) })
  const KINDS = [
    sorted('k1', '2026-10-03', [['Bananas', 95, 'Fruit and veg'], ['Apples', 150, 'Fruit and veg'], ['Milk', 145, 'Dairy and eggs'], ['Milk saving', -50, 'Dairy and eggs']]),
    sorted('k2', '2026-10-10', [['Carrots', 60, 'Fruit and veg'], ['Cheddar', 300, 'Dairy and eggs'], ['Bleach', 120, 'Household']]),
    // Read by the phone: no kinds.
    sorted('k3', '2026-10-12', [['Thing', 200], ['Other thing', 100]]),
    sorted('k4', '2026-09-30', [['Melon', 999, 'Fruit and veg']]),
  ]

  it('ranks only kinds with 3 or more items, lists the rest in the list’s own order, and counts items before offers', () => {
    const kinds = shoppingMonth(KINDS, '2026-10', TODAY).kinds!
    expect(kinds.ranked.map((k) => [k.kind, k.items.length, inWords(k.spent)])).toEqual([['Fruit and veg', 3, '£3.05']])
    // Dairy's saving isn't an item bought: offers have a line of their own.
    expect(kinds.others.map((k) => [k.kind, k.items.length, inWords(k.spent)])).toEqual([
      ['Dairy and eggs', 2, '£4.45'],
      ['Household', 1, '£1.20'],
    ])
    expect(kinds.notSorted).toEqual({ items: 2, receipts: [KINDS[2]], spent: [{ currency: '£', minor: 300 }] })
  })

  it('says nothing of kinds in a month where no item has one', () => {
    expect(shoppingMonth(RECEIPTS, '2026-10', TODAY).kinds).toBeNull()
  })
})

describe('plain names: what your AI took each item for (v0.19.3)', () => {
  const named = (id: string, date: string, plain: string, price: number) => receipt(id, 'M&S', date, [], { items: [{ name: 'GRK YOG 4PK', plain, price, quantity: 1 }], total: price })
  // The AI's words can differ between readings; the shop prints the same name each time.
  const YOGHURT = [named('y1', '2026-10-02', 'Greek yoghurt, 4 pack', 225), named('y2', '2026-10-09', 'Greek yogurt 4-pack', 225), named('y3', '2026-10-16', 'Greek yoghurt, 4 pack', 250)]

  it('shows the latest plain name, and matches price changes and repeats by the printed name', () => {
    const month = shoppingMonth(YOGHURT, '2026-10', TODAY)
    expect(month.repeats.map((r) => [r.name, ids(r.receipts)])).toEqual([['Greek yoghurt, 4 pack', ['y1', 'y2', 'y3']]])
    expect(month.priceChanges.map((c) => [c.name, c.before.price, c.now.price])).toEqual([['Greek yoghurt, 4 pack', 225, 250]])
  })

  it('shows an item as printed when it has no plain name (read by the phone, or before v0.19.3)', () => {
    expect(itemShown({ name: 'Bananas', price: 95, quantity: 1 })).toBe('Bananas')
    expect(itemShown({ name: 'GRK YOG 4PK', plain: 'Greek yoghurt, 4 pack', price: 225, quantity: 1 })).toBe('Greek yoghurt, 4 pack')
  })
})

describe('monthTotals and shoppingMonths', () => {
  it('gives 6 months for the chart, oldest first, in the currency most receipts are in', () => {
    const { currency, months } = monthTotals(RECEIPTS, '2026-10', 6)
    expect(currency).toBe('£')
    expect(months.map((m) => [m.month, m.receipts, m.minor])).toEqual([
      ['2026-05', 0, 0],
      ['2026-06', 0, 0],
      ['2026-07', 0, 0],
      ['2026-08', 0, 0],
      ['2026-09', 3, 1340],
      ['2026-10', 8, 7048],
    ])
    expect(months.at(-1)!.spent).toEqual(amountsOf(RECEIPTS.filter((r) => r.date >= '2026-10-01')))
  })

  it('lists the months with receipts, newest first', () => {
    expect(shoppingMonths(RECEIPTS)).toEqual(['2026-10', '2026-09'])
  })
})
