import { describe, expect, it } from 'vitest'
import type { BankLine, StatementRecord } from '../../src/db/types'
import { accountNames, classify, joinMoves, kindOf, notBroughtIn, linkReceipts, mayBeOwn, moneyMonth, moneyMonthTotals, payeeOf, regularPayments, receiptPaymentCandidates } from '../../src/domain/money'
import type { KnownReceipt } from '../../src/domain/shopping'

// Money (v0.20, step 2): what came in and went out of your accounts, worked out on the phone from statements brought in.
// Fictional lines only; today is Monday 26 October 2026.

const TODAY = '2026-10-26'
let n = 0
const line = (account: string, date: string, pounds: number, description: string, over: Partial<BankLine> = {}): BankLine => ({
  id: `l${n++}`,
  account,
  date,
  amount: Math.round(pounds * 100),
  description,
  type: '',
  balance: null,
  adds: true,
  createdAt: 1,
  updatedAt: 1,
  ...over,
})
const CURRENT = 'Monzo ···5678'
const POT = 'Monzo Savings pot'
const BANK = 'Lloyds ···4321'
const statement = (account: string, from: string, to: string): StatementRecord => ({ id: `${account}:${from}:${to}`, account, from, to, lines: 1, createdAt: 1, updatedAt: 1 })

describe('payeeOf: who a line was paid to or from, as one name', () => {
  it('leaves out the country, a foreign amount’s note and a payment’s reference; a UK chain is the chain', () => {
    expect(payeeOf('EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. Exchange rate: 1.250000.')).toEqual({ key: 'example software dublin', name: 'EXAMPLE SOFTWARE DUBLIN' })
    expect(payeeOf('Example Gym (Faster Payments) Reference: GYM00042')).toEqual({ key: 'example gym', name: 'Example Gym' })
    expect(payeeOf('TESCO SOMETOWN GBR')).toEqual({ key: 'tesco', name: 'Tesco' })
    expect(payeeOf('A N OTHER')).toEqual({ key: 'a n other', name: 'A N OTHER' })
  })
})

describe('accountNames: an account by its bank’s name, or the name you gave it (owner, 2026-10-26)', () => {
  it('drops the last 4 digits unless another account at that bank needs telling apart', () => {
    const names = accountNames([CURRENT, POT, BANK, 'Example Bank ···1111', 'Example Bank ···2222'])
    expect(Object.fromEntries(names)).toEqual({
      [CURRENT]: 'Monzo',
      [POT]: 'Monzo Savings pot',
      [BANK]: 'Lloyds',
      'Example Bank ···1111': 'Example Bank ···1111',
      'Example Bank ···2222': 'Example Bank ···2222',
    })
  })
  it('takes the name you gave, and a blank one falls back', () => {
    const names = accountNames([CURRENT, BANK], { [BANK]: '  Joint account ', [CURRENT]: '  ' })
    expect(names.get(BANK)).toBe('Joint account')
    expect(names.get(CURRENT)).toBe('Monzo')
  })
  it('never gives two accounts the same name', () => {
    expect(Object.fromEntries(accountNames([CURRENT, BANK], { [BANK]: 'Monzo' }))).toEqual({ [CURRENT]: 'Monzo ···5678', [BANK]: 'Monzo' })
  })
})

describe('classify: a payee by the name you gave it (owner, 2026-10-26)', () => {
  it('shows your name, keeping the payee as it was for what you said about it', () => {
    const [named, other] = classify([line(BANK, '2026-10-02', -50, 'A N OTHER', { type: 'FPO' }), line(BANK, '2026-10-03', -9, 'EXAMPLE GYM')], new Set(['a n other']), { 'a n other': 'Example savings' })
    expect(named!.payee).toEqual({ key: 'a n other', name: 'Example savings' })
    expect(named!.moving).toBe('own')
    expect(other!.payee.name).toBe('EXAMPLE GYM')
  })
})

describe('joinMoves: the two sides of a move between your accounts as one row (owner, 2026-10-26)', () => {
  it('joins money out of one account with the same into another within 3 days, newest first; the rest stay single', () => {
    const lines = classify(
      [
        line(POT, '2026-10-08', -50, 'Withdrawal'),
        line(CURRENT, '2026-10-08', 50, 'Transfer from Pot'),
        line(BANK, '2026-10-12', -20, 'MONZO', { type: 'FPO' }),
        line(CURRENT, '2026-10-11', 20, 'LLOYDS'), // arrived first
        line(POT, '2026-10-01', 1.25, 'Interest for September 2026'),
      ],
      new Set(),
    )
    expect(joinMoves(lines).map((r) => [r.line.date, r.line.account, r.to?.account ?? null])).toEqual([
      ['2026-10-12', BANK, CURRENT],
      ['2026-10-08', POT, CURRENT],
      ['2026-10-01', POT, null],
    ])
  })
})

describe('classify: a Monzo Flex statement (owner, 2026-10-26)', () => {
  it('leaves out what was moved to Flex (the purchase is on the current account) and paying Flex; counts what Flex paid itself', () => {
    const flex = 'Monzo Flex'
    const moving = classify(
      [
        line(flex, '2026-09-01', -20, 'EXAMPLE SHOP moved to Flex'),
        line(flex, '2026-09-03', -15, 'EXAMPLE CINEMA'),
        line(flex, '2026-09-04', 5, 'Adjustment for EXAMPLE CINEMA'),
        line(flex, '2026-09-20', 20, 'You paid early'),
        line(flex, '2026-09-21', 9, 'You paid extra towards EXAMPLE CINEMA'),
      ],
      new Set(),
    ).map((l) => l.moving)
    expect(moving).toEqual(['flex', null, null, 'flex', 'flex'])
  })
})

describe('notBroughtIn: the days an account has no statement for, up to today or its last when closed (owner, 2026-10-26)', () => {
  it('lists the gaps between statements and after the last', () => {
    const had = [statement(BANK, '2026-07-01', '2026-07-31'), statement(BANK, '2026-09-01', '2026-09-30'), statement(BANK, '2026-09-15', '2026-10-10')]
    expect(notBroughtIn(had, TODAY)).toEqual([
      { from: '2026-08-01', to: '2026-08-31' },
      { from: '2026-10-11', to: TODAY },
    ])
    expect(notBroughtIn(had, TODAY, true)).toEqual([{ from: '2026-08-01', to: '2026-08-31' }])
    expect(notBroughtIn([statement(BANK, '2026-10-01', TODAY)], TODAY)).toEqual([])
    expect(notBroughtIn([], TODAY)).toEqual([])
    // A closed account isn't to check for statements after its last.
    const lines = classify([line(BANK, '2026-10-02', -9, 'EXAMPLE GYM')], new Set())
    expect(moneyMonth(lines, '2026-10', TODAY, had).toCheck.accounts).toEqual([{ account: BANK, until: '2026-10-10' }])
    expect(moneyMonth(lines, '2026-10', TODAY, had, new Set([BANK])).toCheck.accounts).toEqual([])
  })
})

describe('refunds take off what was spent there, never money in (owner, 2026-10-26: a petrol hold of £99 less £30.88 back)', () => {
  it('a refund, or money back from a payee you paid, lowers that payee’s spending', () => {
    const lines = classify(
      [
        line(CURRENT, '2026-10-15', -99, 'EXAMPLE PETROL SOMETOWN GBR'),
        line(CURRENT, '2026-10-15', 30.88, 'EXAMPLE PETROL SOMETOWN GBR This relates to a previous transaction'),
        line(CURRENT, '2026-10-16', 12.14, 'Refund for EXAMPLE SHOP'),
        line(CURRENT, '2026-10-20', 1500, 'EXAMPLE EMPLOYER LTD'),
      ],
      new Set(),
    )
    expect(lines.map((l) => l.refund)).toEqual([false, true, true, false])
    const month = moneyMonth(lines, '2026-10', TODAY, [])
    expect(month.out).toBe(9900 - 3088 - 1214)
    expect(month.in).toBe(150000)
    expect(month.payees.out.others.find((g) => g.payee.key === 'example petrol sometown')?.total).toBe(6812)
  })
  it('knows money back from a shop written another way by its first word (owner, 2026-10-26)', () => {
    const lines = classify([line(CURRENT, '2026-07-10', -60, 'EXAMPLESHOP.CO.UK LONDON GBR'), line(CURRENT, '2026-07-24', 12.14, 'EXAMPLESHOP* 972AB\\1 Some Street\\LONDON')], new Set())
    expect(lines.map((l) => l.refund)).toEqual([false, true])
  })
})

describe('kindOf: what a payment was for (owner, 2026-10-26: “other transactions … are not very clear”)', () => {
  const one = (description: string, type = '') => classify([line(BANK, '2026-10-02', -10, description, { type })], new Set())[0]!
  it('guesses common UK payees from the description, a supermarket’s petrol as fuel', () => {
    expect(kindOf(one('BRITISH GAS (Direct Debit) Reference: X1'), {})).toBe('Energy')
    expect(kindOf(one('TESCO STORES 1234 SOMETOWN GBR'), {})).toBe('Groceries')
    expect(kindOf(one('ASDA PETROL 1234 SOMETOWN GBR'), {})).toBe('Fuel')
    expect(kindOf(one('EXAMPLE DISTRICT COUNCIL SOMETOWN GBR'), {})).toBe('Council tax')
    expect(kindOf(one('A N OTHER'), {})).toBeNull()
  })
  it('takes the kind you chose for the payee over any guess', () => {
    expect(kindOf(one('TESCO STORES 1234 SOMETOWN GBR'), { tesco: 'Shopping' })).toBe('Shopping')
    expect(kindOf(one('A N OTHER'), { 'a n other': 'Rent' })).toBe('Rent')
  })
  it('sorts a month’s money out by kind, ranked only with 3 or more payments, the unsorted last', () => {
    const lines = classify(
      [
        line(BANK, '2026-10-02', -20, 'TESCO STORES SOMETOWN GBR'),
        line(BANK, '2026-10-03', -30, 'ALDI SOMETOWN GBR'),
        line(BANK, '2026-10-04', -10, 'LIDL SOMETOWN GBR'),
        line(BANK, '2026-10-05', -500, 'EXAMPLE LETTINGS'),
        line(BANK, '2026-10-06', -7, 'A N OTHER'),
      ],
      new Set(),
    )
    const kinds = moneyMonth(lines, '2026-10', TODAY, [], new Set(), { 'example lettings': 'Rent' }).kinds
    expect(kinds.ranked.map((k) => [k.kind, k.total])).toEqual([['Groceries', 6000]])
    expect(kinds.others.map((k) => [k.kind, k.total])).toEqual([['Rent', 50000], ['Not sorted yet', 700]])
  })
})

describe('mayBeOwn: “It’s me, moving money” is offered only where it could be', () => {
  it('not for a known shop, nor a payee paid by card', () => {
    expect(mayBeOwn(classify([line(CURRENT, '2026-10-02', -18, 'ALDI SOMETOWN GBR')], new Set()))).toBe(false)
    expect(mayBeOwn(classify([line(BANK, '2026-10-02', -9, 'EXAMPLE CAFE', { type: 'DEB' })], new Set()))).toBe(false)
    expect(mayBeOwn(classify([line(BANK, '2026-10-02', -50, 'A N OTHER', { type: 'FPO' })], new Set()))).toBe(true)
    expect(mayBeOwn(classify([line(CURRENT, '2026-10-02', 100, 'A N OTHER')], new Set()))).toBe(true)
    // Monzo prints no type: its card payments end in the country, or carry a foreign amount.
    expect(mayBeOwn(classify([line(CURRENT, '2026-10-02', -9, 'EXAMPLE CAFE SOMETOWN GBR')], new Set()))).toBe(false)
    expect(mayBeOwn(classify([line(CURRENT, '2026-10-02', -4, 'EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. Exchange rate: 1.25.')], new Set()))).toBe(false)
    expect(mayBeOwn(classify([line(CURRENT, '2026-10-02', -200, 'Example Invest (Faster Payments) Reference: ABC123')], new Set()))).toBe(true)
  })
})

describe('classify: money moved between your own accounts is left out of what came in and went out', () => {
  it('knows Monzo Flex, pots, the two sides of a transfer between accounts brought in, and payees you marked as yours', () => {
    const lines = [
      line(CURRENT, '2026-10-01', -12.4, 'CORNER SHOP SOMETOWN GBR'),
      line(CURRENT, '2026-10-02', 12.4, 'Flex'),
      line(CURRENT, '2026-10-17', -100, 'Flex'),
      line(CURRENT, '2026-10-08', 50, 'Transfer from Pot'),
      line(POT, '2026-10-08', -50, 'Withdrawal'),
      line(POT, '2026-10-01', 1.25, 'Interest for September 2026'),
      line(BANK, '2026-10-20', -300, 'A N OTHER'),
      line(CURRENT, '2026-10-22', 300, 'A N OTHER'),
      line(BANK, '2026-10-23', 25, 'MY OTHER NAME'),
      line(BANK, '2026-10-23', -45, 'EXAMPLE ENERGY', { type: 'DD' }),
    ]
    expect(classify(lines, new Set(['my other name'])).map((l) => [l.description, l.moving])).toEqual([
      ['CORNER SHOP SOMETOWN GBR', null],
      ['Flex', 'flex'],
      ['Flex', 'flex'],
      ['Transfer from Pot', 'pot'],
      ['Withdrawal', 'pot'],
      ['Interest for September 2026', null],
      ['A N OTHER', 'between'],
      ['A N OTHER', 'between'],
      ['MY OTHER NAME', 'own'],
      ['EXAMPLE ENERGY', null],
    ])
  })

  it('pairs a transfer only with the same amount, into another account, within 3 days', () => {
    const lines = [line(BANK, '2026-10-01', -80, 'TO SAVINGS'), line(CURRENT, '2026-10-06', 80, 'FROM LLOYDS'), line(BANK, '2026-10-01', -80, 'SHOP'), line(BANK, '2026-10-02', 80, 'REFUND')]
    expect(classify(lines, new Set()).map((l) => l.moving)).toEqual([null, null, null, null])
  })
})

describe('moneyMonth: a month of your accounts, worked out on the phone', () => {
  const lines = [
    // September
    line(BANK, '2026-09-03', -20, 'TESCO SOMETOWN GBR'),
    line(BANK, '2026-09-10', -10.99, 'EXAMPLE STREAMING'),
    line(BANK, '2026-09-25', 1500, 'EXAMPLE EMPLOYER LTD'),
    line(BANK, '2026-09-28', -40, 'TESCO SOMETOWN GBR'),
    // October
    line(BANK, '2026-10-02', -25, 'TESCO SOMETOWN GBR'),
    line(BANK, '2026-10-09', -30, 'TESCO EXPRESS GBR'),
    line(BANK, '2026-10-10', -12.99, 'EXAMPLE STREAMING'),
    line(BANK, '2026-10-12', -5, 'BUS FARE'),
    line(BANK, '2026-10-20', 2.5, 'REFUND SHOP'),
    line(BANK, '2026-10-21', -15, 'CORNER SHOP', { adds: false }),
    line(CURRENT, '2026-10-02', 12.4, 'Flex'),
  ]
  const statements = [statement(BANK, '2026-09-01', '2026-10-26'), statement(CURRENT, '2026-10-01', '2026-10-18')]
  const october = moneyMonth(classify(lines, new Set()), '2026-10', TODAY, statements)

  it('adds up what went out and came in, leaving out money moved, next to last month by the same day', () => {
    expect([october.out, october.in]).toEqual([8799, 250])
    // By 26 September: Tesco £20 and the streaming £10.99 (the pay came on the 25th, in).
    expect(october.before).toMatchObject({ until: '2026-09-26', out: 3099 })
  })

  it('says where spending rose: payees with more out than by this day last month, a chain’s names as one; ranked by how much more only with 3+ payments', () => {
    expect(october.rose.ranked.map((r) => [r.payee.name, r.now, r.before])).toEqual([['Tesco', 5500, 2000]])
    expect(october.rose.others.map((r) => [r.payee.name, r.now, r.before])).toEqual([
      ['BUS FARE', 500, 0],
      ['CORNER SHOP', 1500, 0],
      ['EXAMPLE STREAMING', 1299, 1099],
    ])
  })

  it('groups money out and in by payee (ranked only with 3+ payments, the rest by name), and lists money moved apart', () => {
    expect(october.payees.out.ranked).toEqual([])
    expect(october.payees.out.others.map((p) => [p.payee.name, p.total, p.lines.length])).toEqual([
      ['BUS FARE', 500, 1],
      ['CORNER SHOP', 1500, 1],
      ['EXAMPLE STREAMING', 1299, 1],
      ['Tesco', 5500, 2],
    ])
    const busier = moneyMonth(classify([...lines, line(BANK, '2026-10-14', -8, 'TESCO SOMETOWN GBR')], new Set()), '2026-10', TODAY, statements)
    expect(busier.payees.out.ranked.map((p) => [p.payee.name, p.total, p.lines.length])).toEqual([['Tesco', 6300, 3]])
    expect(october.payees.in.others.map((p) => [p.payee.name, p.total])).toEqual([['REFUND SHOP', 250]])
    expect(october.moved.map((m) => [m.why, m.lines.length])).toEqual([['flex', 1]])
  })

  it('lists what to check: lines whose printed balance doesn’t follow, and accounts whose statements stop before the month ends', () => {
    expect(october.toCheck.lines.map((c) => c.description)).toEqual(['CORNER SHOP'])
    expect(october.toCheck.accounts).toEqual([{ account: CURRENT, until: '2026-10-18' }])
  })

  it('gives each month’s money out for the chart, oldest first', () => {
    expect(moneyMonthTotals(classify(lines, new Set()), '2026-10', 3)).toEqual([
      { month: '2026-08', out: 0, lines: 0 },
      { month: '2026-09', out: 7099, lines: 3 },
      { month: '2026-10', out: 8799, lines: 5 },
    ])
  })
})

describe('regularPayments: the same payee paid every month or every week', () => {
  const monthly = (dates: string[], pounds: number[], description = 'EXAMPLE STREAMING') => dates.map((d, i) => line(BANK, d, -pounds[i]!, description))

  it('finds a payment on about the same day of 3 or more months, and says when its amount changed', () => {
    const lines = monthly(['2026-08-10', '2026-09-11', '2026-10-10'], [9.99, 9.99, 10.99])
    expect(regularPayments(classify(lines, new Set()), '2026-10').map((r) => [r.payee.name, r.every, r.amount, r.last, r.changed])).toEqual([
      ['EXAMPLE STREAMING', 'month', 1099, '2026-10-10', { from: 999, to: 1099, date: '2026-10-10' }],
    ])
  })

  it('finds one every week, from 4 payments', () => {
    const lines = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d) => line(BANK, d, -3.5, 'WEEKLY BOX'))
    expect(regularPayments(classify(lines, new Set()), '2026-10').map((r) => [r.payee.name, r.every, r.amount, r.changed])).toEqual([['WEEKLY BOX', 'week', 350, null]])
  })

  it('finds none from 2 months, from a shop paid on many days, or from money moved', () => {
    const lines = [
      ...monthly(['2026-09-10', '2026-10-10'], [5, 5], 'TWO MONTHS'),
      ...['2026-10-01', '2026-10-03', '2026-10-09', '2026-10-15', '2026-10-24'].map((d) => line(BANK, d, -20, 'TESCO SOMETOWN GBR')),
      ...['2026-08-17', '2026-09-17', '2026-10-17'].map((d) => line(CURRENT, d, -100, 'Flex')),
    ]
    expect(regularPayments(classify(lines, new Set()), '2026-10')).toEqual([])
  })
})

describe('linkReceipts: a card payment and the receipt for it (v0.20.2)', () => {
  const receipt = (id: string, shop: string, date: string, pence: number): KnownReceipt => ({
    id,
    entryId: `e-${id}`,
    shop,
    date,
    currency: '£',
    items: [{ name: 'Thing', price: pence, quantity: 1 }],
    total: pence,
    adds: true,
    dated: true,
    readBy: null,
  })
  const lines = classify(
    [
      line(BANK, '2026-10-02', -25, 'TESCO SOMETOWN GBR'),
      line(BANK, '2026-10-05', -12.4, 'CORNER SHOP SOMETOWN GBR'),
      line(BANK, '2026-10-09', -30, 'TESCO EXPRESS GBR'),
      line(BANK, '2026-10-09', -30, 'TESCO EXPRESS GBR'),
      line(CURRENT, '2026-10-12', 12.4, 'Flex'),
    ],
    new Set(),
  )
  const linked = (receipts: KnownReceipt[]) => [...linkReceipts(lines, receipts)].map(([lineId, r]) => [lines.find((l) => l.id === lineId)!.description, r.id])

  it('links a payment to its receipt: the same amount, within 3 days, the shop the payee (a chain’s names as one)', () => {
    expect(linked([receipt('r1', 'Tesco Stores Ltd', '2026-10-01', 2500), receipt('r2', 'Corner Shop', '2026-10-03', 1240)])).toEqual([
      ['TESCO SOMETOWN GBR', 'r1'],
      ['CORNER SHOP SOMETOWN GBR', 'r2'],
    ])
  })

  it('links nothing when the amount, the shop or the days differ, or for money moved; each payment to one receipt', () => {
    expect(linked([receipt('r1', 'Tesco', '2026-10-02', 2499), receipt('r2', 'Aldi', '2026-10-02', 2500), receipt('r3', 'Tesco', '2026-09-25', 2500)])).toEqual([])
    expect(linked([receipt('r4', 'Corner Shop', '2026-10-12', 1240)])).toEqual([])
    // Two alike payments, two alike receipts: one each.
    const two = linked([receipt('r5', 'TESCO', '2026-10-09', 3000), receipt('r6', 'TESCO', '2026-10-09', 3000)])
    expect(two.map(([, id]) => id).sort()).toEqual(['r5', 'r6'])
  })

  it('offers likely payments for an undated receipt but links only after the owner chooses one', () => {
    const undated = { ...receipt('r7', 'Corner Shop', '2026-10-04', 1240), dated: false, entryDate: '2026-10-04' }
    expect(linkReceipts(lines, [undated])).toEqual(new Map())
    const candidate = receiptPaymentCandidates(lines, undated)
    expect(candidate.map((line) => [line.description, line.date])).toEqual([['CORNER SHOP SOMETOWN GBR', '2026-10-05']])
    expect(linkReceipts(lines, [undated], { [undated.id]: candidate[0]!.id })).toEqual(new Map([[candidate[0]!.id, undated]]))
  })

  it('keeps owner-selected matches unique and takes them before automatic matches', () => {
    const first = receipt('r8', 'Tesco', '2026-10-09', 3000)
    const second = receipt('r9', 'Tesco', '2026-10-09', 3000)
    const paymentId = lines.find((line) => line.description === 'TESCO EXPRESS GBR')!.id
    const links = linkReceipts(lines, [first, second], { [second.id]: paymentId })
    expect(links.get(paymentId)?.id).toBe(second.id)
    expect([...links.values()].map((item) => item.id)).toHaveLength(2)
    expect(new Set(links.keys()).size).toBe(2)
  })
})
