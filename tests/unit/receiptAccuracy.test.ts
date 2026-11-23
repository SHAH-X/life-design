import { describe, expect, it } from 'vitest'
import { chainOf } from '../../src/domain/receipts'
import { FIELDS, lowerBound, measure, percent, type Scores } from '../fixtures/accuracy'
import { RECEIPTS, RECEIPTS_UNSEEN } from '../fixtures/receipts'

// Step 2 (owner-approved plan, 2026-11-23): accuracy of the phone's reading, field by field, on the fictional receipts we
// have. `npm run accuracy` prints the table. These are small samples, and RECEIPTS tuned the rules, so only the unseen set says
// anything about a new receipt; the floors below keep any of it from getting worse, they don't say it is good.

const table = (label: string, scores: Scores) =>
  FIELDS.map((f) => `${label.padEnd(10)} ${f.padEnd(12)} ${percent(scores[f]).padStart(5)}  (${scores[f].right}/${scores[f].of}, at least ${(100 * lowerBound(scores[f])).toFixed(0)}% likely)`).join('\n')

const UK = ['Tesco', 'Asda', 'Aldi', 'Lidl', "Sainsbury's", 'Morrisons', 'M&S', 'Co-op']
const chains = (cases: typeof RECEIPTS) => UK.map((name) => [name, cases.filter((c) => c.expect && chainOf(c.expect.shop)?.name === name).length] as const)

describe('the phone’s reading of a receipt, measured per field on the fixtures', () => {
  const tuned = measure(RECEIPTS)
  const unseen = measure(RECEIPTS_UNSEEN)

  it('reads every field of every fixture, tuned and unseen (the floor: never worse)', () => {
    if (process.env.ACCURACY) {
      console.log(`\n${table('tuned', tuned)}\n${table('unseen', unseen)}\n\nReceipts per UK chain, tuned + unseen: ${chains([...RECEIPTS, ...RECEIPTS_UNSEEN]).map(([n, c]) => `${n} ${c}`).join(', ')}\nNot measured: quantities (the fixtures don't record them); what your AI reads.`)
    }
    for (const field of FIELDS) {
      expect(tuned[field], `tuned ${field}`).toEqual({ right: tuned[field].of, of: tuned[field].of })
      expect(unseen[field], `unseen ${field}`).toEqual({ right: unseen[field].of, of: unseen[field].of })
    }
  })

  it('says how little a small sample can promise: 10 of 10 right is at least 72% likely, not 100%', () => {
    expect(lowerBound({ right: 10, of: 10 })).toBeCloseTo(0.722, 2)
    expect(lowerBound({ right: 0, of: 0 })).toBe(0)
  })

  it('counts a note as rightly not a receipt, and a missed receipt as wrong', () => {
    const note = RECEIPTS.find((c) => c.expect === null)!
    expect(measure([note]).found).toEqual({ right: 1, of: 1 })
    const broken = { ...RECEIPTS.find((c) => c.expect)!, text: 'nothing to read here' }
    expect(measure([broken]).found).toEqual({ right: 0, of: 1 })
  })
})
