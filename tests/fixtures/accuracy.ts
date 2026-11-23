import { readReceipt } from '../../src/domain/receipts'
import type { ExpectedReceipt } from './receipts'

// Accuracy of the phone's own reading of a receipt's text, field by field (step 2, 2026-11-23: "do not report accuracy based
// on a handful of successful examples"). It measures only what the fixtures state: the shop, the day, the total, each item's
// name and each item's price. Quantities are not measured: the fixtures don't record them. What your AI reads can't be
// measured offline.

export const FIELDS = ['found', 'store', 'date', 'total', 'item names', 'item prices'] as const
export type Field = (typeof FIELDS)[number]

/** Right answers out of those asked, for one field. */
export interface Score {
  right: number
  of: number
}

export type Scores = Record<Field, Score>

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

const blank = (): Scores => Object.fromEntries(FIELDS.map((f) => [f, { right: 0, of: 0 }])) as Scores

/** Scores the phone's reading of each case against what a person would take from it. A case that isn't a receipt (a note)
 *  counts only for "found": reading nothing from it is right. */
export function measure(cases: readonly ExpectedReceipt[]): Scores {
  const scores = blank()
  const add = (field: Field, right: boolean) => {
    scores[field].of += 1
    if (right) scores[field].right += 1
  }
  for (const c of cases) {
    const read = readReceipt(c.text)
    add('found', c.expect === null ? read === null : read !== null)
    if (!c.expect) continue
    add('store', norm(read?.shop ?? '') === norm(c.expect.shop))
    add('date', (read?.date ?? null) === c.expect.date)
    add('total', read?.total === c.expect.total)
    const left = [...(read?.items ?? [])]
    for (const [name, price] of c.expect.items) {
      const at = left.findIndex((item) => norm(item.name) === norm(name))
      add('item names', at >= 0)
      add('item prices', at >= 0 && left[at]!.price === price)
      if (at >= 0) left.splice(at, 1)
    }
  }
  return scores
}

/** The lowest the true rate plausibly is, at 95% (Wilson): what a small sample can promise. 0 for no sample. */
export function lowerBound({ right, of }: Score): number {
  if (of === 0) return 0
  const z = 1.96
  const p = right / of
  const centre = p + (z * z) / (2 * of)
  const spread = z * Math.sqrt((p * (1 - p)) / of + (z * z) / (4 * of * of))
  return Math.max(0, (centre - spread) / (1 + (z * z) / of))
}

export const percent = (s: Score) => (s.of === 0 ? 'n/a' : `${((100 * s.right) / s.of).toFixed(0)}%`)
