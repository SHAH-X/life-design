import { describe, expect, it } from 'vitest'
import type { Bill, Budget } from '../../src/db/types'
import { billEvents, billsTotal, budgetRows, draftFromRegular, dueSoon, nextPayment, paidAgainst, quartersOf, renewalIn, yearOf } from '../../src/domain/bills'
import type { MoneyLine, Regular } from '../../src/domain/money'
import { buildIcs } from '../../src/reminders/ics'

// Step 4 (owner-approved plan, 2026-11-23): bills and subscriptions you list yourself, and a monthly budget for each kind of
// spending. Amounts in pence; fictional data only. Nothing is paid, changed or cancelled for you.

const bill = (over: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Streaming',
  kind: 'Subscriptions',
  amount: 1099,
  every: 'month',
  next: '2026-11-03',
  renewal: null,
  method: 'Lloyds direct debit',
  notes: '',
  payee: null,
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('what a bill comes to in a year', () => {
  it('multiplies, never averages: a week is 52, a month 12, three months 4, a year 1', () => {
    expect([yearOf(bill({ every: 'week', amount: 500 })), yearOf(bill()), yearOf(bill({ every: 'quarter', amount: 3000 })), yearOf(bill({ every: 'year', amount: 12000 }))]).toEqual([26000, 13188, 12000, 12000])
  })
  it('adds the bills into one yearly figure, and counts how many of each kind of cycle', () => {
    expect(billsTotal([bill(), bill({ id: 'b2', every: 'year', amount: 12000 }), bill({ id: 'b3', every: 'week', amount: 500 })])).toEqual({ year: 13188 + 12000 + 26000, count: 3, by: { week: 1, month: 1, quarter: 0, year: 1 } })
    expect(billsTotal([])).toEqual({ year: 0, count: 0, by: { week: 0, month: 0, quarter: 0, year: 0 } })
  })
})

describe('when a bill is next due', () => {
  it('is the date you gave while it is still to come, and a cycle at a time from it after', () => {
    expect(nextPayment(bill(), '2026-11-03')).toBe('2026-11-03')
    expect(nextPayment(bill(), '2026-11-23')).toBe('2026-12-03')
    expect(nextPayment(bill({ every: 'week', next: '2026-11-02' }), '2026-11-23')).toBe('2026-11-23')
    expect(nextPayment(bill({ every: 'quarter', next: '2026-08-15' }), '2026-11-23')).toBe('2027-02-15')
    expect(nextPayment(bill({ every: 'year', next: '2025-12-01' }), '2026-11-23')).toBe('2026-12-01')
    expect(nextPayment(bill({ next: '2027-01-10' }), '2026-11-23')).toBe('2027-01-10')
  })
  it('counts from the date you gave each time, so a short month does not pull later ones earlier', () => {
    expect(nextPayment(bill({ next: '2026-01-31' }), '2026-02-10')).toBe('2026-02-28')
    expect(nextPayment(bill({ next: '2026-01-31' }), '2026-03-01')).toBe('2026-03-31')
  })
  it('lists what is due in the next days, soonest first, the last day included', () => {
    const bills = [bill({ id: 'a', name: 'A', next: '2026-12-05' }), bill({ id: 'b', name: 'B', next: '2026-11-25' }), bill({ id: 'c', name: 'C', next: '2026-12-07' })]
    expect(dueSoon(bills, '2026-11-23', 14).map((d) => [d.bill.name, d.date])).toEqual([['B', '2026-11-25'], ['A', '2026-12-05'], ['C', '2026-12-07']])
    expect(dueSoon(bills, '2026-11-23', 13).map((d) => d.bill.name)).toEqual(['B', 'A'])
  })
  it('says how many days to a renewal, and nothing once it has passed', () => {
    expect(renewalIn(bill({ renewal: '2026-12-23' }), '2026-11-23')).toBe(30)
    expect(renewalIn(bill({ renewal: '2026-11-23' }), '2026-11-23')).toBe(0)
    expect(renewalIn(bill({ renewal: '2026-11-01' }), '2026-11-23')).toBeNull()
    expect(renewalIn(bill(), '2026-11-23')).toBeNull()
  })
})

const line = (id: string, date: string, amount: number, key: string, over: Partial<MoneyLine> = {}): MoneyLine =>
  ({ id, account: 'Lloyds', date, amount, description: key, type: '', balance: null, adds: true, createdAt: 1, updatedAt: 1, payee: { key, name: key.toUpperCase(), original: key.toUpperCase() }, moving: null, ...over }) as unknown as MoneyLine

describe('a bill against what the statements show', () => {
  const lines = [line('l1', '2026-09-03', -999, 'streamco'), line('l2', '2026-10-03', -1099, 'streamco'), line('l3', '2026-10-04', -500, 'other'), line('l4', '2026-10-20', 20000, 'streamco', { moving: 'own' })]
  it('is the latest payment to its payee: when, how much, and whether it differs from what you listed', () => {
    expect(paidAgainst(bill({ payee: 'streamco' }), lines)).toEqual({ date: '2026-10-03', amount: 1099, differs: false })
    expect(paidAgainst(bill({ payee: 'streamco', amount: 999 }), lines)).toEqual({ date: '2026-10-03', amount: 1099, differs: true })
  })
  it('is nothing for a bill with no payee, or a payee never paid, and leaves money moved and money in out', () => {
    expect(paidAgainst(bill(), lines)).toBeNull()
    expect(paidAgainst(bill({ payee: 'nobody' }), lines)).toBeNull()
  })
})

describe('regular payments found in the statements, offered as bills', () => {
  const regular = (key: string, name: string): Regular => ({ payee: { key, name, original: name.toUpperCase() }, every: 'month', amount: 1099, year: 13188, last: '2026-10-03', next: '2026-11-03', changed: null, lines: [] }) as unknown as Regular
  it('are drafted with their name, amount, cycle and next date, unless you already listed one for that payee', () => {
    const found = [regular('streamco', 'Streamco'), regular('gym', 'Gym')]
    expect(draftFromRegular(found[0]!)).toMatchObject({ name: 'Streamco', amount: 1099, every: 'month', next: '2026-11-03', payee: 'streamco' })
    expect(found.filter((r) => !draftsTaken([bill({ payee: 'gym' })], r)).map((r) => r.payee.key)).toEqual(['streamco'])
  })
})
const draftsTaken = (bills: readonly Bill[], r: Regular) => bills.some((b) => b.payee === r.payee.key)

describe('budget against what was spent, a month', () => {
  const budgets: Budget[] = [
    { id: 'Groceries', kind: 'Groceries', amount: 30000, createdAt: 1, updatedAt: 1 },
    { id: 'Eating out', kind: 'Eating out', amount: 8000, createdAt: 1, updatedAt: 1 },
    { id: 'Fuel', kind: 'Fuel', amount: 10000, createdAt: 1, updatedAt: 1 },
  ]
  it('says what is left, or what is over, for each kind you set one for, in the kinds’ own order, and in total', () => {
    const rows = budgetRows(budgets, { Groceries: 26500, 'Eating out': 9250, Rent: 90000 })
    expect(rows.rows.map((r) => [r.kind, r.budget, r.spent, r.left])).toEqual([['Groceries', 30000, 26500, 3500], ['Eating out', 8000, 9250, -1250], ['Fuel', 10000, 0, 10000]])
    expect(rows.total).toEqual({ budget: 48000, spent: 35750, left: 12250 })
  })
  it('has no row and no total when there is no budget', () => {
    expect(budgetRows([], { Groceries: 100 })).toEqual({ rows: [], total: null })
  })
})

describe('spending by quarter', () => {
  it('adds each three months of money out, calendar quarters, with how many of its months have statements', () => {
    const months = [['2026-01', 100], ['2026-02', 200], ['2026-03', 300], ['2026-04', 400], ['2026-07', 50], ['2026-09', 70]] as const
    expect(quartersOf(months.map(([month, out]) => ({ month, out, lines: 1 })))).toEqual([
      { quarter: '2026 Q1', out: 600, months: 3 },
      { quarter: '2026 Q2', out: 400, months: 1 },
      { quarter: '2026 Q3', out: 120, months: 2 },
    ])
  })
})

describe('calendar events for your bills', () => {
  const stamp = new Date('2026-11-23T10:00:00Z')
  it('repeat by each cycle, start on the next payment, carry the notes, and warn two days before', () => {
    const events = billEvents([bill({ notes: 'Cancel online, 30 days notice' }), bill({ id: 'b2', name: 'Cover', every: 'year', next: '2026-12-01', amount: 12000 }), bill({ id: 'b3', name: 'Water', every: 'quarter', next: '2026-12-10' })], '2026-11-23')
    expect(events.map((e) => [e.summary, e.startDate, e.rrule])).toEqual([
      ['Streaming £10.99 due', '2026-12-03', 'FREQ=MONTHLY'],
      ['Cover £120.00 due', '2026-12-01', 'FREQ=YEARLY'],
      ['Water £10.99 due', '2026-12-10', 'FREQ=MONTHLY;INTERVAL=3'],
    ])
    // A long line is folded onto the next with a space: read it unfolded.
    const text = buildIcs(events, stamp).replace(/\r\n /g, '')
    expect(text).toContain('RRULE:FREQ=MONTHLY;INTERVAL=3')
    expect(text).toContain('TRIGGER:-P2D')
    expect(text).toContain('Cancel online\\, 30 days notice')
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  })
  it('keeps a bill paid on the 29th to 31st in every month, on the last day a short month has, never skipping one', () => {
    const rule = (every: Bill['every'], next: string) => billEvents([bill({ every, next })], '2026-01-01')[0]!.rrule
    expect(rule('month', '2026-01-31')).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1')
    expect(rule('month', '2026-01-30')).toBe('FREQ=MONTHLY;BYMONTHDAY=27,28,29,30;BYSETPOS=-1')
    expect(rule('month', '2026-01-29')).toBe('FREQ=MONTHLY;BYMONTHDAY=26,27,28,29;BYSETPOS=-1')
    expect(rule('quarter', '2026-01-31')).toBe('FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=28,29,30,31;BYSETPOS=-1')
    expect(rule('month', '2026-01-28')).toBe('FREQ=MONTHLY')
    expect(rule('year', '2026-03-31')).toBe('FREQ=YEARLY')
    expect(rule('week', '2026-01-31')).toBe('FREQ=WEEKLY')
  })
  it('takes the repeat from the bill’s own day, not the shorter month it is next due in: a 31st in February still repeats on the last day', () => {
    const [event] = billEvents([bill({ next: '2026-01-31' })], '2026-02-10')
    expect(event!.startDate).toBe('2026-02-28')
    expect(event!.rrule).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1')
  })
  it('adds a one-off event for a renewal, with no repeat', () => {
    const events = billEvents([bill({ renewal: '2027-02-14', notes: 'Contract ends' })], '2026-11-23')
    expect(events.map((e) => [e.summary, e.startDate, e.rrule])).toEqual([['Streaming £10.99 due', '2026-12-03', 'FREQ=MONTHLY'], ['Streaming renews', '2027-02-14', undefined]])
    const text = buildIcs(events, stamp)
    expect(text.match(/RRULE:/g)).toHaveLength(1)
  })
  it('leaves a renewal that has passed out', () => {
    expect(billEvents([bill({ renewal: '2026-01-01' })], '2026-11-23')).toHaveLength(1)
  })
})
