import { describe, expect, it } from 'vitest'
import type { Entry, PhotoRef } from '../../src/db/types'
import { entryReceipt } from '../../src/domain/shopping'
import { areaEntry } from '../fixtures/areas'

// How a receipt's entry is listed (v0.32.0, owner 2026-11-19: "the logs of the receipt are not easily identified, and fill
// up with unnecessary text"): its shop and what it came to, not the words read from its photo. Fictional receipts only.

const read = (shop: string, items: [string, number][], total: number | null = items.reduce((s, [, p]) => s + p, 0)) => ({
  by: 'Gemini · gemini-2.5-flash',
  at: 1,
  text: `${shop.toUpperCase()}\nTEL: 0116 000 0000\nTOTAL`,
  description: '',
  receipt: { shop, date: '2026-10-12', currency: '£', items: items.map(([name, price]) => ({ name, price, quantity: 1 })), total },
})
const entry = (id: string, photos: PhotoRef[], over: Partial<Entry> = {}): Entry => ({ ...areaEntry({ id, text: '', expect: [] }, '2026-10-12'), photos, ...over })

describe('entryReceipt: a receipt entry in a list', () => {
  it('is the shop, and "Receipt", what it came to and how many items; not the text read from it', () => {
    const e = entry('e1', [{ id: 'p1', text: 'GREENLEAF MARKET TEL: 0116', ai: read('Greenleaf Market', [['Oat milk', 165], ['Bread', 120], ['Eggs', 249]]) }])
    expect(entryReceipt(e)).toEqual({ title: 'Greenleaf Market', words: 'Receipt · £5.34 · 3 items' })
  })

  it('says "1 item", and leaves out the items when none were read', () => {
    expect(entryReceipt(entry('e1', [{ id: 'p1', text: null, ai: read('Corner Chemist', [['Plasters', 299]]) }]))).toEqual({ title: 'Corner Chemist', words: 'Receipt · £2.99 · 1 item' })
    expect(entryReceipt(entry('e2', [{ id: 'p2', text: null, ai: read('Corner Chemist', [], 850) }]))).toEqual({ title: 'Corner Chemist', words: 'Receipt · £8.50' })
  })

  it('is as read by the phone when your AI has not', () => {
    const e = entry('e1', [{ id: 'p1', text: 'GREENLEAF MARKET\n12 Oct 2026\nOat milk 1.65\nTOTAL 1.65' }])
    expect(entryReceipt(e)).toMatchObject({ words: 'Receipt · £1.65 · 1 item' })
  })

  it('names several receipts in one entry, and what they came to together', () => {
    const e = entry('e1', [
      { id: 'p1', text: null, ai: read('Greenleaf Market', [['Oat milk', 165]]) },
      { id: 'p2', text: null, ai: read('Corner Chemist', [['Plasters', 299]]) },
    ])
    expect(entryReceipt(e)).toEqual({ title: '2 receipts', words: 'Greenleaf Market · Corner Chemist · £4.64' })
  })

  it('counts only what was spent in an entry of several, a refund slip beside them counted as a refund and taken off nothing (audit 2026-11-20)', () => {
    const refund = { id: 'p3', text: null, ai: { ...read('Greenleaf Market', [['Oat milk', -165]], -165), text: 'REFUND\nGREENLEAF MARKET\nOat milk -1.65\nTOTAL REFUND -1.65' } }
    const e = entry('e1', [{ id: 'p1', text: null, ai: read('Corner Chemist', [['Plasters', 299]]) }, { id: 'p2', text: null, ai: read('Greenleaf Market', [['Oat milk', 165], ['Bread', 120]]) }, refund])
    expect(entryReceipt(e)).toEqual({ title: '3 receipts', words: 'Corner Chemist · Greenleaf Market · £5.84 · 1 refund' })
  })

  it('says a refund slip is one, with the money back', () => {
    const e = entry('e1', [{ id: 'p1', text: null, ai: { ...read('Greenleaf Market', [['Oat milk', -165]], -165), text: 'REFUND\nGREENLEAF MARKET\nOat milk -1.65\nTOTAL REFUND -1.65' } }])
    expect(entryReceipt(e)).toMatchObject({ title: 'Greenleaf Market', words: 'Refund slip · £1.65 back' })
  })

  it('says what became of a photo added as a receipt that was not read as one', () => {
    const slip = { id: 'p1', text: '***For a chance to win £1,000!*** Please tell us how we did today', receipt: true as const }
    expect(entryReceipt(entry('e1', [{ ...slip, ai: { by: 'Gemini', at: 1, text: slip.text, description: '', receipt: null } }]))).toEqual({ title: 'Receipt photo', words: 'No items or total found' })
    // Not read by anyone yet: it is waiting, not lost.
    expect(entryReceipt(entry('e2', [{ id: 'p2', text: null, receipt: true }]))).toEqual({ title: 'Receipt photo', words: 'Waiting to be read' })
  })

  it('leaves everything else as it is: another photo, words of your own, a draft', () => {
    expect(entryReceipt(entry('e1', [{ id: 'p1', text: 'A view of the sea from the cliff path' }]))).toBeNull()
    expect(entryReceipt(entry('e2', [{ id: 'p2', text: null, ai: read('Greenleaf Market', [['Oat milk', 165]]) }], { note: 'Weekly shop, felt rushed' }))).toBeNull()
    expect(entryReceipt(entry('e3', [{ id: 'p3', text: null, ai: read('Greenleaf Market', [['Oat milk', 165]]) }], { status: 'draft' }))).toBeNull()
    expect(entryReceipt(entry('e4', []))).toBeNull()
  })
})
