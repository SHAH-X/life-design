import { describe, expect, it } from 'vitest'
import type { BankLine, Bill, DocumentRecord, Product, StatementRecord } from '../../src/db/types'
import { billsAnswer, biggestExpenses, cheapestShops, costChange, dueAnswer, kindsSpent, moneyNotice, needsLookAnswer, pricesRose, spentOnKind, type AnswerData } from '../../src/domain/answers'
import { classify } from '../../src/domain/money'
import { productViews } from '../../src/domain/products'
import { dayMonth, shortDayMonth } from '../../src/lib/dates'
import type { KnownReceipt } from '../../src/domain/shopping'

// Step 6 (owner-approved plan, 2026-11-23): questions about your money and papers answered on the phone to the penny, each saying its
// period, what the statements show apart from an estimate and a thing to look at, and never counting a missing month as nothing. The
// phone's quick answers are the only way your bank payments are asked about (owner: no AI sees them). Fictional data only.
// Today is Monday 23 November 2026.

const TODAY = '2026-11-23'
const ACCOUNT = 'Lloyds ···4321'
let n = 0
const line = (date: string, pounds: number, description: string): BankLine => ({ id: `l${n++}`, account: ACCOUNT, date, amount: Math.round(pounds * 100), description, type: 'DD', balance: null, adds: true, createdAt: 1, updatedAt: 1 })
const statement = (from: string, to: string): StatementRecord => ({ id: `s:${from}`, account: ACCOUNT, from, to, lines: 1, createdAt: 1, updatedAt: 1 })

const ENERGY = [['2026-05-03', 112], ['2026-06-03', 118], ['2026-07-03', 121], ['2026-08-03', 119], ['2026-09-03', 111], ['2026-10-03', 145]] as const
const BANK = [
  ...ENERGY.map(([d, p]) => line(d, -p, 'OCTOPUS ENERGY')),
  line('2026-09-05', -38, 'TESCO STORES 1234'),
  line('2026-09-15', -55, 'TESCO STORES 1234'),
  line('2026-09-28', -62, 'TESCO STORES 1234'),
  line('2026-10-05', -42, 'TESCO STORES 1234'),
  line('2026-10-12', -185, 'TESCO STORES 1234'),
  line('2026-10-26', -25, 'TESCO STORES 1234'),
  line('2026-10-08', -10.99, 'STREAMCO'),
  line('2026-09-08', -10.99, 'STREAMCO'),
  line('2026-08-08', -10.99, 'STREAMCO'),
  line('2026-10-28', 1500, 'EXAMPLE EMPLOYER SALARY'),
]
const lines = classify(BANK, new Set())
const data = (over: Partial<AnswerData> = {}): AnswerData => ({
  today: TODAY,
  lines,
  statements: [statement('2026-05-01', '2026-10-31')],
  closed: new Set(),
  kinds: {},
  bills: [],
  docs: [],
  products: [],
  held: [],
  accountName: (a) => a.replace(/ ···.*/, ''),
  ...over,
})

describe('what was spent on a kind last month', () => {
  it('lists the kinds with money out, biggest first', () => {
    expect(kindsSpent(data(), '2026-10').map((k) => [k.kind, k.total])).toEqual([['Groceries', 25200], ['Energy', 14500]])
  })
  it('says the total and how many payments, the payees under it, the period and the accounts', () => {
    const a = spentOnKind(data(), 'Groceries')
    expect(a.title).toBe('Groceries in October 2026')
    expect(a.period).toBe('1 – 31 October 2026 · from Lloyds')
    expect(a.facts[0]).toMatchObject({ heading: 'In all' })
    expect(a.facts[0]!.rows[0]).toMatchObject({ label: 'All of it', value: '£252.00', sub: '3 payments' })
    expect(a.facts[1]).toMatchObject({ heading: 'By who was paid' })
    expect(a.facts[1]!.rows[0]).toMatchObject({ label: 'Tesco', value: '£252.00' })
    expect(a.facts[1]!.rows[0]!.lines).toHaveLength(3)
    expect(a.caveats).toEqual([])
  })
  it('says when a statement is missing for the month, and when nothing was spent, never inventing an amount', () => {
    const missing = spentOnKind(data({ statements: [statement('2026-05-01', '2026-10-15')] }), 'Groceries')
    expect(missing.caveats.join(' ')).toMatch(/not every statement|statements are missing/i)
    expect(spentOnKind(data(), 'Fuel').facts).toEqual([])
    expect(spentOnKind(data(), 'Fuel').empty).toBe('Nothing was paid to Fuel in October 2026.')
  })
})

describe('the biggest expenses last month', () => {
  it('totals a payee as Money does, a refund taken off, while the single payments stay the payments themselves', () => {
    const withRefund = classify([...BANK, line('2026-10-14', 20, 'TESCO STORES 1234')], new Set())
    const a = biggestExpenses(data({ lines: withRefund }))
    expect(a.facts[0]!.rows.find((r) => r.label === 'Tesco')!.value).toBe('£232.00')
    expect(a.facts[1]!.rows.map((r) => r.value).slice(0, 2)).toEqual(['£185.00', '£145.00'])
  })
  it('ranks payees by what was paid, then the biggest single payments, each with its payments; money in is not an expense', () => {
    const a = biggestExpenses(data())
    expect(a.facts[0]!.heading).toBe('By who was paid')
    expect(a.facts[0]!.rows.map((r) => [r.label, r.value])).toEqual([['Tesco', '£252.00'], ['Octopus Energy', '£145.00'], ['Streamco', '£10.99']])
    expect(a.facts[1]!.heading).toBe('Biggest single payments')
    expect(a.facts[1]!.rows.map((r) => r.value).slice(0, 2)).toEqual(['£185.00', '£145.00'])
  })
})

describe('how a cost changed', () => {
  it('lists the months from the statements, the latest against the one before, a year at the latest as an estimate, and the regular payment that went up', () => {
    const a = costChange(data(), 'Energy')
    expect(a.period).toBe('1 May – 31 October 2026 · from Lloyds')
    expect(a.facts[0]!.rows.map((r) => [r.label, r.value])).toEqual([['May', '£112.00'], ['June', '£118.00'], ['July', '£121.00'], ['August', '£119.00'], ['September', '£111.00'], ['October', '£145.00']])
    expect(a.facts[0]!.note).toBe('October is £34.00 more than September.')
    expect(a.estimate).toBe('At October’s amount, a year of it would come to £1,740.00 (12 × £145.00). Nothing says it will stay there.')
    expect(a.look.map((l) => l.text)).toEqual([`Octopus Energy is a regular payment that went up by £34.00 a month on ${dayMonth('2026-10-03')}.`])
  })
  it('says a fall is a fall, with the amount as a positive number', () => {
    const falling = classify([...[['2026-05-03', 140], ['2026-06-03', 140], ['2026-07-03', 140], ['2026-08-03', 140], ['2026-09-03', 140], ['2026-10-03', 110]].map(([d, p]) => line(String(d), -Number(p), 'OCTOPUS ENERGY'))], new Set())
    const a = costChange(data({ lines: falling }), 'Energy')
    expect(a.look.map((l) => l.text)).toEqual([`Octopus Energy is a regular payment that went down by £30.00 a month on ${dayMonth('2026-10-03')}.`])
    expect(a.facts[0]!.note).toBe('October is £30.00 less than September.')
  })
  it('says there is no month to compare, not that nothing was paid, when no month has every statement in', () => {
    const a = costChange(data({ statements: [] }), 'Energy')
    expect(a.empty).toBe('No month in this time has every statement in, so there is nothing to compare yet.')
    expect(a.facts).toEqual([])
  })
  it('leaves out a month with a statement missing, and says so, never counting it as nothing', () => {
    const a = costChange(data({ statements: [statement('2026-05-01', '2026-08-31'), statement('2026-10-01', '2026-10-31')] }), 'Energy')
    expect(a.facts[0]!.rows.map((r) => r.label)).toEqual(['May', 'June', 'July', 'August', 'October'])
    expect(a.caveats.join(' ')).toContain('September has no statement')
    expect(a.facts[0]!.note).toBe('October is £26.00 more than August.')
  })
})

const bill = (over: Partial<Bill> = {}): Bill => ({ id: 'b1', name: 'Home insurance', kind: 'Insurance', amount: 24000, every: 'year', next: '2026-12-10', renewal: '2027-01-12', method: '', notes: '', payee: null, createdAt: 1, updatedAt: 1, ...over })
const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({ id: 'd1', title: 'Washing machine warranty', type: 'Warranty', kind: 'pdf', mime: 'application/pdf', size: 1, pages: 1, text: '', tracked: [{ date: '2026-12-01', kind: 'ends', label: 'Warranty ends' }], dismissed: [], billId: null, notes: '', createdAt: 1, updatedAt: 1, ...over })

describe('bills and subscriptions', () => {
  it('lists what you listed with its yearly cost, what the statements show that you have not listed, and a year of yours as an estimate', () => {
    const a = billsAnswer(data({ bills: [bill()] }))
    expect(a.facts[0]!.heading).toBe('Your bills')
    expect(a.facts[0]!.rows[0]).toMatchObject({ label: 'Home insurance', value: '£240.00' })
    expect(a.facts[1]!.heading).toBe('Found in your statements, not listed')
    expect(a.facts[1]!.rows.map((r) => r.label)).toEqual(['Octopus Energy', 'Streamco'])
    expect(a.estimate).toBe('A year of the bills you listed comes to £240.00, each counted from its cycle.')
  })
  it('does not offer a payee you already listed', () => {
    const a = billsAnswer(data({ bills: [bill({ name: 'Streaming', payee: 'streamco', amount: 1099, every: 'month' })] }))
    expect(a.facts[1]!.rows.map((r) => r.label)).toEqual(['Octopus Energy'])
  })
})

describe('what is due in the next 30 days', () => {
  it('puts your bills, regular payments you have not listed and tracked document dates in one list, soonest first, said to be around, with a total as an estimate', () => {
    const a = dueAnswer(data({ bills: [bill()], docs: [doc()] }))
    expect(a.facts[0]!.rows.map((r) => [r.label, r.sub])).toEqual([
      ['Washing machine warranty', `ends ${shortDayMonth('2026-12-01')}`],
      ['Octopus Energy', `around ${shortDayMonth('2026-12-03')}`],
      ['Streamco', `around ${shortDayMonth('2026-12-08')}`],
      ['Home insurance', `around ${shortDayMonth('2026-12-10')}`],
    ])
    expect(a.estimate).toBe('About £395.99 to pay, from the amounts last paid or listed.')
    expect(a.caveats.join(' ')).toContain('a pattern, not a promise')
  })
})

const receipt = (id: string, shop: string, date: string, items: [string, number][]): KnownReceipt => ({ id, entryId: `e-${id}`, shop, date, currency: '£', total: items.reduce((s, [, p]) => s + p, 0), adds: true, items: items.map(([name, price]) => ({ name, price, quantity: 1 })), dated: true, readBy: null })
const MILK = 'Semi Skimmed Milk 2.27L'
const RECEIPTS = [receipt('t1', 'Tesco', '2026-10-03', [[MILK, 145]]), receipt('t2', 'Tesco', '2026-10-17', [[MILK, 165]]), receipt('a1', 'Asda', '2026-10-05', [['Milk Semi Skimmed 2.27L', 155]]), receipt('o1', 'Tesco', '2026-06-01', [['Old thing', 100]]), receipt('o2', 'Tesco', '2026-06-20', [['Old thing', 120]])]
const joined: Product = { id: 'p1', members: ['tesco|semi skimmed milk 2.27l', 'asda|milk semi skimmed 2.27l'], notSame: [], regular: true, createdAt: 1, updatedAt: 1 }

describe('prices that rose', () => {
  it('lists the price rises at the same shop in the last 90 days, newest first, with what it was and now; nothing older', () => {
    const a = pricesRose(data({ products: productViews(RECEIPTS, []) }))
    expect(a.facts[0]!.rows.map((r) => [r.label, r.value, r.sub])).toEqual([[MILK, '▲ £0.20', `Tesco · £1.45 → £1.65 · ${shortDayMonth('2026-10-17')}`]])
  })
  it('says when there are none', () => {
    expect(pricesRose(data({ products: [] })).empty).toBe('No price you pay at the same shop has gone up in the last 90 days.')
  })
})

describe('the cheapest shop for what you buy', () => {
  it('compares only products you said are the same, by what a litre or kilogram cost, and says it may have changed since', () => {
    const a = cheapestShops(data({ products: productViews(RECEIPTS, [joined]) }))
    expect(a.facts[0]!.rows[0]).toMatchObject({ label: MILK, value: 'Asda £0.68 a litre' })
    expect(a.facts[0]!.rows[0]!.sub).toContain('Tesco £0.73 a litre')
    expect(a.look.map((l) => l.text)).toEqual(['Asda was £0.05 a litre less when last bought; it may have changed since.'])
  })
  it('says what to do when nothing is joined', () => {
    expect(cheapestShops(data({ products: productViews(RECEIPTS, []) })).empty).toContain('Same product')
  })
})

describe('what needs a look', () => {
  it('gathers tracked dates, renewals, receipts not counted and a statement missing, each in words', () => {
    const a = needsLookAnswer(data({ bills: [bill()], docs: [doc()], held: [{ id: 'h1', date: '2026-10-21' }, { id: 'h2', date: '2026-09-02' }], statements: [statement('2026-05-01', '2026-10-31')] }))
    const text = a.facts.flatMap((f) => f.rows.map((r) => `${r.label} ${r.sub ?? ''}`)).join(' | ')
    expect(text).toContain('Washing machine warranty')
    expect(text).toContain('Home insurance')
    expect(text).toContain('2 receipts')
    expect(a.facts[0]!.rows.find((r) => r.label.includes('receipts'))!.sub).toContain('their items')
    expect(needsLookAnswer(data({ held: [{ id: 'h1', date: '2026-10-21' }], statements: [statement('2026-05-01', '2026-11-23')] })).facts[0]!.rows[0]!.sub).toContain('its items')
    expect(a.facts[0]!.rows.every((r) => r.label === 'Home insurance' || r.href !== undefined)).toBe(true)
    // To the month of the oldest receipt held back, in its Receipts view.
    expect(a.facts[0]!.rows.find((r) => r.label.includes('receipts'))!.href).toBe('#/money/2026-09?view=receipts')
    expect(text).toMatch(/Lloyds.*statement/)
  })
  it('says there is nothing when there is nothing', () => {
    expect(needsLookAnswer(data({ statements: [statement('2026-05-01', '2026-11-23')] })).empty).toBe('Nothing needs a look right now.')
  })
})

describe('the one quiet line', () => {
  it('names a payment far above any earlier one to the same payee: over £20, over twice the largest of at least 3 earlier', () => {
    const notice = moneyNotice(data({ today: '2026-10-30' }), new Set())
    expect(notice).toMatchObject({ text: `£185.00 to Tesco on ${dayMonth('2026-10-12')} is the most you have paid there. The most before was £62.00.`, href: '#/money/2026-10' })
    expect(notice!.key).toMatch(/^big:/)
  })
  it('says nothing for a payment under £20, one with fewer than 3 earlier, or one that is not over twice the largest', () => {
    const small = classify([line('2026-10-05', -5, 'CAFE A'), line('2026-10-06', -4, 'CAFE A'), line('2026-10-07', -3, 'CAFE A'), line('2026-10-08', -15, 'CAFE A')], new Set())
    expect(moneyNotice(data({ lines: small, today: '2026-10-30' }), new Set())).toBeNull()
    const few = classify([line('2026-10-05', -40, 'SHOP B'), line('2026-10-06', -45, 'SHOP B'), line('2026-10-08', -200, 'SHOP B')], new Set())
    expect(moneyNotice(data({ lines: few, today: '2026-10-30' }), new Set())).toBeNull()
    const near = classify([line('2026-10-05', -40, 'SHOP C'), line('2026-10-06', -45, 'SHOP C'), line('2026-10-07', -50, 'SHOP C'), line('2026-10-08', -90, 'SHOP C')], new Set())
    expect(moneyNotice(data({ lines: near, today: '2026-10-30' }), new Set())).toBeNull()
  })
  it('does not show one already seen, nor a payment older than three weeks, nor money in', () => {
    const first = moneyNotice(data({ today: '2026-10-30' }), new Set())!
    expect(moneyNotice(data({ today: '2026-10-30' }), new Set([first.key]))).toBeNull()
    expect(moneyNotice(data({ today: '2026-11-05' }), new Set())).toBeNull()
    const credit = classify([line('2026-10-05', -40, 'SHOP D'), line('2026-10-06', -45, 'SHOP D'), line('2026-10-07', -50, 'SHOP D'), line('2026-10-12', 500, 'SHOP D')], new Set())
    expect(moneyNotice(data({ lines: credit, today: '2026-10-30' }), new Set())).toBeNull()
  })
  it('names a price that rose at a shop you buy from, when there is no big payment', () => {
    const quiet = data({ lines: [], products: productViews(RECEIPTS, []), today: '2026-10-25' })
    expect(moneyNotice(quiet, new Set())).toMatchObject({ text: `${MILK} rose £0.20 at Tesco on ${dayMonth('2026-10-17')} (£1.45 → £1.65).`, href: '#/shopping' })
    const small = productViews([receipt('x1', 'Tesco', '2026-10-03', [['Tea bags', 300]]), receipt('x2', 'Tesco', '2026-10-17', [['Tea bags', 305]])], [])
    expect(moneyNotice(data({ lines: [], products: small, today: '2026-10-25' }), new Set())).toBeNull()
    // 1p on a 10p item is 10%, but not worth a line; 5p on 50p is.
    const tiny = productViews([receipt('y1', 'Tesco', '2026-10-03', [['Mints', 10]]), receipt('y2', 'Tesco', '2026-10-17', [['Mints', 11]])], [])
    expect(moneyNotice(data({ lines: [], products: tiny, today: '2026-10-25' }), new Set())).toBeNull()
    const fifty = productViews([receipt('z1', 'Tesco', '2026-10-03', [['Biscuits', 50]]), receipt('z2', 'Tesco', '2026-10-17', [['Biscuits', 55]])], [])
    expect(moneyNotice(data({ lines: [], products: fifty, today: '2026-10-25' }), new Set())?.text).toContain('Biscuits rose')
  })
})
