import { describe, expect, it } from 'vitest'
import type { InvestLine, InvestSummary } from '../../src/db/types'
import { investingMonth, investingMonths } from '../../src/domain/investing'
import { dayMonth } from '../../src/lib/dates'

// Trading 212's costs and charges, profit and loss, and income, a month at a time (v0.36.0): plain sums, as printed; nothing
// averaged, rated or compared. Fictional lines only.

let n = 0
const line = (over: Partial<InvestLine>): InvestLine => ({
  id: `i${n++}`, account: 'Trading 212 ···0001', kind: 'trade', date: '2026-10-02', at: '2026-10-02 10:00:00', instrument: 'EXMP', direction: 'Sell', orderId: `${n}`,
  value: 10000, fxFee: 0, fees: 0, result: 0, tax: 0, createdAt: 1, updatedAt: 1, ...over,
})
const trade = (date: string, instrument: string, direction: 'Buy' | 'Sell', over: Partial<InvestLine> = {}) =>
  line({ date, at: `${date} 10:00:00`, instrument, direction, result: direction === 'Sell' ? 0 : null, ...over })
const dividend = (date: string, instrument: string, value: number, tax: number) => line({ kind: 'dividend', date, at: `${date} 12:00:00`, instrument, direction: '', orderId: '', value, result: null, tax })
const interest = (date: string, value: number) => line({ kind: 'interest', date, at: `${date} 01:00:00`, instrument: '', direction: '', orderId: '', value, result: null })

const LINES: InvestLine[] = [
  trade('2026-10-01', 'EXMP', 'Buy', { fees: 50 }),
  trade('2026-10-02', 'EXMP', 'Sell', { result: 251 }),
  trade('2026-10-05', 'EXMQ', 'Sell', { fxFee: 55, result: 856 }),
  trade('2026-10-06', 'EXMQ', 'Sell', { fxFee: 30, result: -333 }),
  trade('2026-10-07', 'EXMQ', 'Sell', { fxFee: 15, result: 120 }),
  trade('2026-10-07', 'EXMR', 'Sell', { fxFee: 15, result: 500 }),
  dividend('2026-10-01', 'EXMP', 63, 11),
  dividend('2026-10-05', 'EXMQ', 329, 0),
  interest('2026-10-03', 4),
  interest('2026-10-04', 3),
  trade('2026-11-02', 'EXMP', 'Buy', { fxFee: 10 }),
  interest('2026-11-02', 5),
]
const summary = (over: Partial<InvestSummary> = {}): InvestSummary => ({
  id: 's1', account: 'Trading 212 ···0001', from: '2026-10-01', to: '2026-11-18', accountValue: 500000, openResult: -41250, openResultChange: -3120, mismatches: [], createdAt: 1, updatedAt: 1, ...over,
})

describe('investingMonths', () => {
  it('lists the months with any line, oldest first', () => {
    expect(investingMonths(LINES)).toEqual(['2026-10', '2026-11'])
    expect(investingMonths([])).toEqual([])
  })
})

describe('investingMonth', () => {
  const october = investingMonth(LINES, [summary()], '2026-10')

  it('adds up the month’s costs: FX fees, exchange and government fees, and tax withheld on dividends', () => {
    expect(october.costs).toMatchObject({ fxFees: 115, fees: 50, tax: 11, total: 176 })
    expect(october.costs.fxLines.map((l) => [l.instrument, l.fxFee])).toEqual([['EXMP', 0], ['EXMQ', 55], ['EXMQ', 30], ['EXMQ', 15], ['EXMR', 15]].filter(([, fee]) => fee !== 0))
    expect(october.costs.feeLines).toHaveLength(1)
    expect(october.costs.taxLines).toHaveLength(1)
    expect(october.trades).toBe(6)
  })

  it('adds up what the month’s sales made or lost, by instrument, ranked only with 3 sales or more', () => {
    expect(october.result.closed).toBe(251 + 856 - 333 + 120 + 500)
    expect(october.result.sells).toBe(5)
    // EXMQ sold 3 times: ranked. EXMP and EXMR once each: by name.
    expect(october.result.byInstrument.ranked.map((g) => [g.instrument, g.result, g.lines.length])).toEqual([['EXMQ', 643, 3]])
    expect(october.result.byInstrument.others.map((g) => [g.instrument, g.result])).toEqual([['EXMP', 251], ['EXMR', 500]])
  })

  it('says what the statement ending in the month printed of what is still held, and only in that month', () => {
    expect(investingMonth(LINES, [summary()], '2026-11').result.summary).toMatchObject({ openResult: -41250, accountValue: 500000 })
    expect(october.result.summary).toBeNull()
  })

  it('takes the month’s FX and exchange fees off the closed result, which the statement prints before charges (owner 2026-11-20)', () => {
    // The statement's result is the sale less the purchase with every fee added back (16 of 18 buy-and-sell pairs on a real one);
    // its own account value takes the fees off separately. Tax on dividends is not here: dividends are already after it.
    expect(october.result.afterCharges).toBe(october.result.closed - 115 - 50)
  })

  it('adds up the month’s income: dividends after tax and interest, each opening to its lines', () => {
    expect(october.income).toMatchObject({ dividends: 392, interest: 7 })
    expect(october.income.dividendLines.map((l) => l.instrument)).toEqual(['EXMP', 'EXMQ'])
    expect(october.income.interestLines).toHaveLength(2)
  })

  it('carries what the statement’s totals did not match, for the months it covers', () => {
    const off = investingMonth(LINES, [summary({ mismatches: ['Closed result £12.74, the statement says £99.99'] })], '2026-10')
    expect(off.checked).toBe(true)
    // Each says which statement it is about, so the right one can be found.
    expect(off.mismatches).toEqual([`${dayMonth('2026-10-01')} – ${dayMonth('2026-11-18')}: Closed result £12.74, the statement says £99.99`])
    expect(october.mismatches).toEqual([])
    expect(investingMonth(LINES, [], '2026-10').checked).toBe(false)
  })
})
