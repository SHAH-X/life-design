import { describe, expect, it } from 'vitest'
import type { BankLine } from '../../src/db/types'
import { accountMonth, accountMonths } from '../../src/domain/accountStatement'

// An account's statement, rebuilt from its lines (v0.30.0): months, days newest first, what came in and went out, and the
// balance at the month's end when the printed balances say it. Fictional lines only.

let n = 0
const line = (date: string, pounds: number, description: string, balance: number | null = null, over: Partial<BankLine> = {}): BankLine => ({
  id: `l${n++}`,
  account: 'Example ···1234',
  date,
  amount: Math.round(pounds * 100),
  description,
  type: '',
  balance: balance === null ? null : Math.round(balance * 100),
  adds: true,
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('accountMonths: every month from its first line to its last, gaps included', () => {
  it('lists them oldest first, and none for an account with no lines', () => {
    expect(accountMonths([line('2026-10-20', 1, 'a'), line('2026-08-02', 1, 'b'), line('2026-08-30', 1, 'c')])).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(accountMonths([])).toEqual([])
  })
})

describe('accountMonth', () => {
  it('shows a month newest day first, with what came in and went out and the balance at its end', () => {
    const lines = [
      line('2026-10-02', -12.4, 'SHOP', 87.6),
      line('2026-10-09', 50, 'PAYMENT IN', 137.6),
      line('2026-10-20', -7.6, 'CAFE', 130),
      line('2026-11-01', -30, 'NEXT MONTH', 100),
    ]
    const view = accountMonth(lines, '2026-10')
    expect(view.days.map((d) => [d.date, d.lines.map((l) => l.description)])).toEqual([
      ['2026-10-20', ['CAFE']],
      ['2026-10-09', ['PAYMENT IN']],
      ['2026-10-02', ['SHOP']],
    ])
    expect([view.in, view.out, view.closing, view.count]).toEqual([5000, 2000, 13000, 3])
  })

  it('puts a day’s lines in the order the balances give, newest first, whichever way the lines were kept', () => {
    // 10 -> 1010 -> 995: kept in the wrong order.
    const day = [line('2026-10-23', -15, 'THIRD', 995), line('2026-10-23', 10, 'FIRST', 10), line('2026-10-23', 1000, 'SECOND', 1010)]
    const view = accountMonth(day, '2026-10')
    expect(view.days[0]!.lines.map((l) => l.description)).toEqual(['THIRD', 'SECOND', 'FIRST'])
    expect(view.closing).toBe(99500)
  })

  it('orders a card’s day by what is owed, which money out raises', () => {
    const day = [line('2026-10-23', -20, 'B', 30), line('2026-10-23', -10, 'A', 10)]
    expect(accountMonth(day, '2026-10').days[0]!.lines.map((l) => l.description)).toEqual(['B', 'A'])
  })

  it('says whether the balances are what you hold or what you owe', () => {
    expect(accountMonth([line('2026-10-02', -5, 'A', 95), line('2026-10-03', -7, 'B', 88)], '2026-10').owed).toBe(false)
    expect(accountMonth([line('2026-10-02', -5, 'A', 5), line('2026-10-03', -7, 'B', 12)], '2026-10').owed).toBe(true)
  })

  it('does not claim a balance at the end of a day whose order the balances cannot give (+£350 then −£350)', () => {
    const day = [line('2026-10-29', 350, 'IN', 450), line('2026-10-29', -350, 'OUT', 100)]
    const view = accountMonth(day, '2026-10')
    expect(view.days[0]!.lines).toHaveLength(2)
    expect(view.closing).toBeNull()
  })

  it('has no balance for a statement that prints none, and still adds up what came in and went out', () => {
    const view = accountMonth([line('2026-10-02', -5, 'A'), line('2026-10-02', -6, 'B'), line('2026-10-03', 4, 'REFUND')], '2026-10')
    expect([view.in, view.out, view.closing]).toEqual([400, 1100, null])
  })

  it('has nothing for a month with no lines', () => {
    expect(accountMonth([line('2026-08-02', 1, 'a')], '2026-09')).toEqual({ days: [], in: 0, out: 0, closing: null, owed: false, count: 0 })
  })
})
