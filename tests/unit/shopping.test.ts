import { describe, expect, it } from 'vitest'
import { runTool } from '../../src/domain/ask'
import { type KnownReceipt, shopKey, spendByShop } from '../../src/domain/shopping'

// Fictional receipts only.

const known = (id: string, shop: string, date: string, total: number, currency = '£'): KnownReceipt => ({
  id,
  entryId: `e-${id}`,
  shop,
  date,
  currency,
  total,
  adds: true,
  items: [{ name: 'Item', price: total, quantity: 1 }],
})

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
    const receipts = [known('a', 'TESCO EXPRESS', '2026-09-28', 1071), known('b', 'J Sainsbury plc', '2026-10-05', 300), known('c', "Sainsbury's", '2026-10-11', 210), known('d', 'Café de Flore', '2026-10-22', 730, '€')]
    const call = { id: 'c1', type: 'function' as const, function: { name: 'spend_by_shop', arguments: '{}' } }
    const { result } = await runTool(call, { receipts, findEntries: async () => [] })
    expect(JSON.parse(result)).toEqual(spendByShop(receipts))
  })
})
