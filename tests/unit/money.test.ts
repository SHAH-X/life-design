import { describe, expect, it } from 'vitest'
import type { BankLine, StatementRecord } from '../../src/db/types'
import { titleCaseShouted, accountNames, classify, joinMoves, kindOf, notBroughtIn, linkReceipts, mayBeOwn, moneyMonth, moneyMonthTotals, payeeOf, regularPayments, regularPaymentsTotal, receiptPaymentCandidates, committedOf, upcoming, regularChanges, moneyYear, monthEndBalances, monthCoverage, averageOfComplete, searchPayments, paymentYears, nameOf, labelsOf, withFor, forNamesOf, suggestedPeople, NOBODY, isGiftCardBuy, giftCardsBefore } from '../../src/domain/money'
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

describe('titleCaseShouted: a bank prints names in capitals; they are shown in title case (restyle T5), at display time', () => {
  it('title-cases a name that is all capitals, keeping what is not a word as printed', () => {
    expect(titleCaseShouted('EXAMPLE SOFTWARE DUBLIN')).toBe('Example Software Dublin')
    expect(titleCaseShouted("EXAMPLE'S BAKERY")).toBe("Example's Bakery")
    expect(titleCaseShouted('COFFEE-HOUSE AND CAFE')).toBe('Coffee-House and Cafe')
    expect(titleCaseShouted('EXAMPLE PAY*1A2B3C')).toBe('Example Pay*1A2B3C')
    expect(titleCaseShouted('TFL TRAVEL')).toBe('TFL Travel')
    expect(titleCaseShouted('A N OTHER')).toBe('A N Other')
  })

  it('leaves a name that already has lower case exactly as printed, and a key is never touched', () => {
    expect(titleCaseShouted('Example Gym')).toBe('Example Gym')
    expect(titleCaseShouted('ExampleCo ltd')).toBe('ExampleCo ltd')
    expect(titleCaseShouted('')).toBe('')
    expect(payeeOf('EXAMPLE SOFTWARE DUBLIN IRL').key).toBe('example software dublin')
  })

  it('shows a bank-printed account name in title case, but never the name you gave it', () => {
    expect([...accountNames(['EXAMPLE BANK ···1234'], {}).values()]).toEqual(['Example Bank'])
    expect([...accountNames(['EXAMPLE BANK ···1234'], { 'EXAMPLE BANK ···1234': 'MY ACCOUNT' }).values()]).toEqual(['MY ACCOUNT'])
  })
})

describe('payeeOf: who a line was paid to or from, as one name', () => {
  it('leaves out the country, a foreign amount’s note and a payment’s reference; a UK chain is the chain', () => {
    expect(payeeOf('EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. Exchange rate: 1.250000.')).toEqual({ key: 'example software dublin', name: 'Example Software Dublin' })
    expect(payeeOf('Example Gym (Faster Payments) Reference: GYM00042')).toEqual({ key: 'example gym', name: 'Example Gym' })
    expect(payeeOf('TESCO SOMETOWN GBR')).toEqual({ key: 'tesco', name: 'Tesco' })
    expect(payeeOf('A N OTHER')).toEqual({ key: 'a n other', name: 'A N Other' })
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
  it('shows your name, keeping the payee as it was for what you said about it and recording its original name', () => {
    const [named, other] = classify([line(BANK, '2026-10-02', -50, 'A N OTHER', { type: 'FPO' }), line(BANK, '2026-10-03', -9, 'EXAMPLE GYM')], new Set(['a n other']), { 'a n other': 'Example savings' })
    expect(named!.payee).toEqual({ key: 'a n other', name: 'Example savings', original: 'A N Other' })
    expect(named!.moving).toBe('own')
    expect(other!.payee.name).toBe('Example Gym')
  })

  it('uses the same saved name for old and newly imported lines with that payee key', () => {
    const lines = classify(
      [line(BANK, '2026-07-14', -9, 'EXAMPLE STREAMING'), line(BANK, '2026-10-14', -11, 'EXAMPLE STREAMING')],
      new Set(),
      { 'example streaming': 'Example streaming' },
    )
    expect(lines.map((item) => item.payee)).toEqual([
      { key: 'example streaming', name: 'Example streaming', original: 'Example Streaming' },
      { key: 'example streaming', name: 'Example streaming', original: 'Example Streaming' },
    ])
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

  it('knows a Flex statement by its words, whatever its account is called: one that came in as "Account" counted each purchase twice (v0.20.29)', () => {
    // The same £41.17: on the current account when it was paid, and again as "moved to Flex" on the Flex statement.
    const lines = classify(
      [
        line(CURRENT, '2026-10-08', -41.17, 'EXAMPLE VISA CENTRE LONDON'),
        line('Account', '2026-10-08', -41.17, 'Example Visa Centre moved to Flex'),
        line('Account', '2026-10-20', 50, 'You paid early'),
      ],
      new Set(),
    )
    expect(lines.map((l) => l.moving)).toEqual([null, 'flex', 'flex'])
    const october = moneyMonth(lines, '2026-10', TODAY, [])
    expect([october.out, october.in]).toEqual([4117, 0])
  })
  it('does not take an ordinary line for Flex because it mentions it', () => {
    const lines = classify([line(BANK, '2026-10-08', -10, 'FLEX GYM MEMBERSHIP'), line(BANK, '2026-10-09', -8, 'Moved to Flexible Savings')], new Set())
    expect(lines.map((l) => l.moving)).toEqual([null, null])
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
  it('guesses a delivery from the Uber app as eating out and a ride as transport (v0.20.23: Uber Eats was guessed as transport)', () => {
    expect(kindOf(one('UBER EATS LONDON GBR'), {})).toBe('Eating out')
    expect(kindOf(one('UBER *EATS HELP.UBER.COM'), {})).toBe('Eating out')
    expect(kindOf(one('UBER *TRIP HELP.UBER.COM'), {})).toBe('Transport')
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

  it('says where spending rose by at least £1 and had spending before, a chain’s names as one; ranked by how much more only with 3+ payments', () => {
    expect(october.rose.ranked.map((r) => [r.payee.name, r.now, r.before])).toEqual([['Tesco', 5500, 2000]])
    expect(october.rose.others.map((r) => [r.payee.name, r.now, r.before])).toEqual([['Example Streaming', 1299, 1099]])
  })

  it('groups money out and in by payee (ranked only with 3+ payments, the rest by name), and lists money moved apart', () => {
    expect(october.payees.out.ranked).toEqual([])
    expect(october.payees.out.others.map((p) => [p.payee.name, p.total, p.lines.length])).toEqual([
      ['Bus Fare', 500, 1],
      ['Corner Shop', 1500, 1],
      ['Example Streaming', 1299, 1],
      ['Tesco', 5500, 2],
    ])
    const busier = moneyMonth(classify([...lines, line(BANK, '2026-10-14', -8, 'TESCO SOMETOWN GBR')], new Set()), '2026-10', TODAY, statements)
    expect(busier.payees.out.ranked.map((p) => [p.payee.name, p.total, p.lines.length])).toEqual([['Tesco', 6300, 3]])
    expect(october.payees.in.others.map((p) => [p.payee.name, p.total])).toEqual([['Refund Shop', 250]])
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
    expect(regularPayments(classify(lines, new Set()), '2026-10', TODAY).map((r) => [r.payee.name, r.every, r.amount, r.last, r.changed])).toEqual([
      ['Example Streaming', 'month', 1099, '2026-10-10', { from: 999, to: 1099, date: '2026-10-10', year: 100 * 12 }],
    ])
  })

  it('finds one every week, from 4 payments', () => {
    const lines = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d) => line(BANK, d, -3.5, 'WEEKLY BOX'))
    expect(regularPayments(classify(lines, new Set()), '2026-10', TODAY).map((r) => [r.payee.name, r.every, r.amount, r.changed])).toEqual([['Weekly Box', 'week', 350, null]])
  })

  it('keeps a series regular when an earlier month is opened after later statements arrived', () => {
    const lines = monthly(['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10'], [9.99, 9.99, 9.99, 9.99])
    expect(regularPayments(classify(lines, new Set()), '2026-09', TODAY).map((r) => [r.payee.name, r.last])).toEqual([['Example Streaming', '2026-09-10']])
  })

  it('finds none from 2 months, from a shop paid on many days, or from money moved', () => {
    const lines = [
      ...monthly(['2026-09-10', '2026-10-10'], [5, 5], 'TWO MONTHS'),
      ...['2026-10-01', '2026-10-03', '2026-10-09', '2026-10-15', '2026-10-24'].map((d) => line(BANK, d, -20, 'TESCO SOMETOWN GBR')),
      ...['2026-08-17', '2026-09-17', '2026-10-17'].map((d) => line(CURRENT, d, -100, 'Flex')),
    ]
    expect(regularPayments(classify(lines, new Set()), '2026-10', TODAY)).toEqual([])
  })

  it('arranges regular payments in decreasing order of value, highest at the top', () => {
    const lines = [
      ...monthly(['2026-08-10', '2026-09-10', '2026-10-10'], [9.99, 9.99, 9.99], 'CHEAPER STREAMING'),
      ...monthly(['2026-08-01', '2026-09-01', '2026-10-01'], [120, 120, 120], 'EXPENSIVE GYM'),
      ...monthly(['2026-08-15', '2026-09-15', '2026-10-15'], [35, 35, 35], 'MEDIUM INTERNET'),
    ]
    const result = regularPayments(classify(lines, new Set()), '2026-10', TODAY)
    expect(result.map((r) => [r.payee.name, r.amount])).toEqual([
      ['Expensive Gym', 12000],
      ['Medium Internet', 3500],
      ['Cheaper Streaming', 999],
    ])
  })

  it('totals regular payments as a year, a monthly one 12 times and a weekly one 52 (v0.20.24: they were added up as one figure, £10 a month + £5 a week as £15)', () => {
    const lines = [
      ...monthly(['2026-08-10', '2026-09-10', '2026-10-10'], [10, 10, 10], 'STREAMING'),
      ...['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d) => line(BANK, d, -5, 'WEEKLY BOX')),
    ]
    const regular = regularPayments(classify(lines, new Set()), '2026-10', TODAY)
    expect(regular.map((r) => [r.payee.name, r.every, r.amount, r.year])).toEqual([
      ['Streaming', 'month', 1000, 1000 * 12],
      ['Weekly Box', 'week', 500, 500 * 52],
    ])
    expect(regularPaymentsTotal(regular)).toEqual({ monthly: 1000, weekly: 500, year: 1000 * 12 + 500 * 52, count: 2 })
  })

  it('says what a change comes to in a year, a rise as plus and a fall as minus (a weekly one 52 times)', () => {
    const weekly = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d, i) => line(BANK, d, -[3.5, 3.5, 3.5, 4][i]!, 'WEEKLY BOX'))
    expect(regularPayments(classify(weekly, new Set()), '2026-10', TODAY)[0]!.changed).toEqual({ from: 350, to: 400, date: '2026-10-22', year: 50 * 52 })
    const fall = monthly(['2026-08-10', '2026-09-10', '2026-10-10'], [10.99, 10.99, 9.99])
    expect(regularPayments(classify(fall, new Set()), '2026-10', TODAY)[0]!.changed?.year).toBe(-100 * 12)
  })

  describe('next: when it is due again (v0.20.25)', () => {
    const next = (dates: string[], month: string, today: string, description = 'EXAMPLE STREAMING') =>
      regularPayments(classify(monthly(dates, dates.map(() => 10), description), new Set()), month, today).map((r) => r.next)

    it('is a month after the latest payment, or a week', () => {
      expect(next(['2026-08-10', '2026-09-10', '2026-10-10'], '2026-10', TODAY)).toEqual(['2026-11-10'])
      const weekly = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d) => line(BANK, d, -5, 'WEEKLY BOX'))
      expect(regularPayments(classify(weekly, new Set()), '2026-10', TODAY).map((r) => r.next)).toEqual(['2026-10-29'])
    })
    it('moves on a cycle at a time until it is today or later, and today itself counts', () => {
      expect(next(['2026-07-12', '2026-08-12', '2026-09-12'], '2026-10', TODAY)).toEqual(['2026-11-12'])
      expect(next(['2026-07-26', '2026-08-26', '2026-09-26'], '2026-10', TODAY)).toEqual(['2026-10-26'])
      const weekly = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d) => line(BANK, d, -5, 'WEEKLY BOX'))
      expect(regularPayments(classify(weekly, new Set()), '2026-10', '2026-11-10').map((r) => r.next)).toEqual(['2026-11-12'])
    })
    it('clamps to a short month without pulling later ones earlier (31 Jan + 2 months is 31 Mar, not 28 Mar)', () => {
      expect(next(['2025-11-30', '2025-12-30', '2026-01-30'], '2026-01', '2026-02-01')).toEqual(['2026-02-28'])
      expect(next(['2025-11-30', '2025-12-31', '2026-01-31'], '2026-02', '2026-03-02')).toEqual(['2026-03-31'])
    })
  })
})

describe('committedOf: a month’s money out, what went to regular payments and the rest (v0.20.25)', () => {
  const monthly = (dates: string[], pounds: number[], description: string) => dates.map((d, i) => line(BANK, d, -pounds[i]!, description))

  it('counts a refund from a regular payee against it, and the rest is everyday', () => {
    const lines = classify(
      [
        ...monthly(['2026-08-10', '2026-09-10', '2026-10-10'], [10, 10, 10], 'EXAMPLE STREAMING'),
        line(BANK, '2026-10-12', 2, 'Refund for EXAMPLE STREAMING'),
        line(BANK, '2026-10-05', -30, 'EXAMPLE CORNER SHOP'),
        line(BANK, '2026-10-06', -20, 'ANOTHER SHOP'),
      ],
      new Set(),
    )
    const month = moneyMonth(lines, '2026-10', TODAY, [])
    expect(month.out).toBe(5800)
    expect(committedOf(month.outLines, regularPayments(lines, '2026-10', TODAY))).toEqual({ committed: 800, everyday: 5000 })
  })
  it('is all everyday when nothing is regular', () => {
    const lines = classify([line(BANK, '2026-10-05', -30, 'EXAMPLE CORNER SHOP')], new Set())
    expect(committedOf(moneyMonth(lines, '2026-10', TODAY, []).outLines, [])).toEqual({ committed: 0, everyday: 3000 })
  })
})

describe('upcoming: what regular payments are due in the next days (v0.20.25)', () => {
  it('lists a weekly one each week and a monthly one once, soonest first, up to and including the last day', () => {
    const lines = classify(
      [
        ...['2026-08-10', '2026-09-10', '2026-10-10'].map((d) => line(BANK, d, -10, 'EXAMPLE STREAMING')),
        ...['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map((d) => line(BANK, d, -3.5, 'WEEKLY BOX')),
      ],
      new Set(),
    )
    const regular = regularPayments(lines, '2026-10', TODAY)
    expect(upcoming(regular, TODAY, 30).map((u) => [u.date, u.payee.name, u.amount])).toEqual([
      ['2026-10-29', 'Weekly Box', 350],
      ['2026-11-05', 'Weekly Box', 350],
      ['2026-11-10', 'Example Streaming', 1000],
      ['2026-11-12', 'Weekly Box', 350],
      ['2026-11-19', 'Weekly Box', 350],
    ])
    // 26 Oct + 30 days is 25 Nov: the weekly one on 26 Nov is outside, and 26 Nov would be inside from 27 Oct.
    expect(upcoming(regular, '2026-10-27', 30).filter((u) => u.payee.name === 'Weekly Box').map((u) => u.date).at(-1)).toBe('2026-11-26')
  })
  it('is empty with nothing regular', () => {
    expect(upcoming([], TODAY, 30)).toEqual([])
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

  it('suggests a nearby debit despite a different amount, but never links it automatically', () => {
    const receiptWithOtherTender = receipt('r10', 'Corner Shop', '2026-10-05', 2000)
    const candidates = receiptPaymentCandidates(lines, receiptWithOtherTender)
    expect(candidates.map((candidate) => [candidate.description, candidate.amount])).toEqual([['CORNER SHOP SOMETOWN GBR', -1240]])
    expect(linkReceipts(lines, [receiptWithOtherTender])).toEqual(new Map())
    expect(linkReceipts(lines, [receiptWithOtherTender], { [receiptWithOtherTender.id]: candidates[0]!.id })).toEqual(
      new Map([[candidates[0]!.id, receiptWithOtherTender]]),
    )
  })

  // v0.24.0 (owner, 2026-11-06): a card you said is one of your accounts is looked for only there; one you said is none
  // of them is never matched to someone else's purchase.
  it('looks for a receipt’s payment only in the account its card is, and nowhere for a card that is none of them', () => {
    const paidBy = (last4: string) => ({ ...receipt('r11', 'Tesco', '2026-10-01', 2500), card: { last4, scheme: 'Visa' as const } })
    const ids = (cards: Record<string, string>) => [...linkReceipts(lines, [paidBy('4417')], {}, cards).values()].map((r) => r.id)
    expect(ids({})).toEqual(['r11'])
    expect(ids({ '4417': BANK })).toEqual(['r11'])
    expect(ids({ '4417': CURRENT })).toEqual([])
    expect(receiptPaymentCandidates(lines, paidBy('4417'), new Set(), { '4417': CURRENT })).toEqual([])
    expect(ids({ '4417': '' })).toEqual([])
    expect(receiptPaymentCandidates(lines, { ...paidBy('4417'), total: 2000 }, new Set(), { '4417': '' })).toEqual([])
    // Another card's choice says nothing about this one.
    expect(ids({ '9999': CURRENT })).toEqual(['r11'])
    // A link you chose stands whatever the card.
    const chosen = lines.find((l) => l.description === 'TESCO SOMETOWN GBR')!.id
    expect([...linkReceipts(lines, [paidBy('4417')], { r11: chosen }, { '4417': CURRENT }).keys()]).toEqual([chosen])
  })

  // v0.24.1 (owner, 2026-11-06): gift cards bought through Blue Light Card. No bank shows what went on one.
  it('never matches a receipt paid wholly by gift card, and matches one paid partly at the rest', () => {
    const whole = { ...receipt('r12', 'Tesco', '2026-10-01', 2500), byGiftCard: 2500 }
    expect(receiptPaymentCandidates(lines, whole)).toEqual([])
    expect(linkReceipts(lines, [whole])).toEqual(new Map())
    // £35 at Tesco, £5 of it on a gift card: the £30 payment is its own.
    const part = { ...receipt('r13', 'Tesco', '2026-10-09', 3500), byGiftCard: 500 }
    const linked = [...linkReceipts(lines, [part])]
    expect(linked.map(([id, r]) => [lines.find((l) => l.id === id)!.amount, r.id])).toEqual([[-3000, 'r13']])
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

// v0.24.1 (owner, 2026-11-06): "payments done through GIFT card, mostly they are marked as starting with Blc in the
// account statements" (gift cards bought through Blue Light Card; the line doesn't say which shop's). Made-up lines.
describe('isGiftCardBuy, giftCardsBefore: gift cards bought through Blue Light Card', () => {
  const lines = classify(
    [
      line(BANK, '2026-09-02', -47.5, 'BLC GIFTCARD DEMOTOWN', { type: 'DEB' }),
      line(CURRENT, '2026-09-20', -95, 'Blc Giftcard Demotown GBR'),
      line(CURRENT, '2026-10-01', -19, 'blc giftcard demotown'),
      line(CURRENT, '2026-10-02', 19, 'BLC GIFTCARD DEMOTOWN'),
      line(CURRENT, '2026-10-03', -12, 'BLACKWELLS BOOKS'),
      line(CURRENT, '2026-10-04', -12, 'PUBLC HOUSE BLC'),
    ],
    new Set(),
  )

  it('knows a Blc payment whatever its capitals, and nothing else: not money back, nor a name with blc inside it', () => {
    expect(lines.map(isGiftCardBuy)).toEqual([true, true, true, false, false, false])
  })

  it('lists the newest up to a day, at most three, from every account', () => {
    expect(giftCardsBefore(lines, '2026-09-30').map((l) => [l.date, l.account])).toEqual([['2026-09-20', CURRENT], ['2026-09-02', BANK]])
    expect(giftCardsBefore(lines, '2026-10-31', 2).map((l) => l.date)).toEqual(['2026-10-01', '2026-09-20'])
    expect(giftCardsBefore(lines, '2026-09-01')).toEqual([])
  })
})

describe('regularChanges: regular payments that started or stopped (v0.20.26)', () => {
  const monthly = (dates: string[], description: string, account = BANK) => dates.map((d) => line(account, d, -10, description))
  const weekly = (dates: string[], description: string, account = BANK) => dates.map((d) => line(account, d, -5, description))
  const changes = (lines: BankLine[], month: string, statements: StatementRecord[], closed: ReadonlySet<string> = new Set(), today = TODAY) =>
    regularChanges(classify(lines, new Set()), month, today, statements, closed)
  const names = (found: { payee: { name: string } }[]) => found.map((f) => f.payee.name)

  describe('lapsed: no payment for a cycle and a few days over', () => {
    const lines = monthly(['2026-03-10', '2026-04-10', '2026-05-10'], 'GYM CLUB')
    const covered = [statement(BANK, '2026-01-01', '2026-08-31')]

    it('is told once its next payment is a week late (35 days between payments and 7 over), for the 3 months from then', () => {
      // Last paid 10 May: still on time until 21 June.
      expect(names(changes(lines, '2026-05', covered).lapsed)).toEqual([])
      expect(names(changes(lines, '2026-06', covered).lapsed)).toEqual(['Gym Club'])
      expect(changes(lines, '2026-06', covered).lapsed[0]).toMatchObject({ every: 'month', last: '2026-05-10', amount: 1000 })
      expect(names(changes(lines, '2026-08', covered).lapsed)).toEqual(['Gym Club'])
      expect(names(changes(lines, '2026-09', covered).lapsed)).toEqual([])
    })
    it('is told for the month you are in, up to today', () => {
      expect(names(changes(monthly(['2026-06-10', '2026-07-10', '2026-08-10'], 'GYM CLUB'), '2026-10', [statement(BANK, '2026-01-01', TODAY)]).lapsed)).toEqual(['Gym Club'])
    })
    it('is never told when statements are missing for the days it should have been paid, only for a missing one', () => {
      expect(names(changes(lines, '2026-08', [statement(BANK, '2026-01-01', '2026-05-31'), statement(BANK, '2026-07-20', '2026-08-31')]).lapsed)).toEqual([])
      expect(names(changes(lines, '2026-06', [statement(BANK, '2026-01-01', '2026-05-31')]).lapsed)).toEqual([])
      expect(names(changes(lines, '2026-08', []).lapsed)).toEqual([])
    })
    it('is never told for a closed account', () => {
      expect(names(changes(lines, '2026-08', covered, new Set([BANK])).lapsed)).toEqual([])
    })
    it('is not told for a payment that carries on', () => {
      expect(names(changes(monthly(['2026-08-10', '2026-09-10', '2026-10-10'], 'GYM CLUB'), '2026-10', [statement(BANK, '2026-01-01', TODAY)]).lapsed)).toEqual([])
    })
    it('knows a weekly one a few days late (8 days between payments and 3 over)', () => {
      const box = weekly(['2026-03-04', '2026-03-11', '2026-03-18', '2026-03-25'], 'WEEKLY BOX')
      expect(names(changes(box, '2026-03', [statement(BANK, '2026-01-01', '2026-04-30')]).lapsed)).toEqual([])
      const april = changes(box, '2026-04', [statement(BANK, '2026-01-01', '2026-04-30')]).lapsed
      expect(names(april)).toEqual(['Weekly Box'])
      expect(april[0]).toMatchObject({ every: 'week', last: '2026-03-25' })
      expect(names(changes(box, '2026-04', [statement(BANK, '2026-01-01', '2026-03-31')]).lapsed)).toEqual([])
    })
  })

  describe('started: regular for the first time, with statements from before it began', () => {
    const lines = monthly(['2026-08-12', '2026-09-12', '2026-10-12'], 'NEW SUB')

    it('is told in the month it became regular (its 3rd payment, or the 4th of a weekly one), with when it began', () => {
      const from = [statement(BANK, '2026-06-01', TODAY)]
      expect(names(changes(lines, '2026-09', from).started)).toEqual([])
      const october = changes(lines, '2026-10', from).started
      expect(names(october)).toEqual(['New Sub'])
      expect(october[0]).toMatchObject({ every: 'month', first: '2026-08-12', amount: 1000 })
      const box = weekly(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'], 'NEW BOX')
      expect(changes(box, '2026-10', [statement(BANK, '2026-09-01', TODAY)]).started[0]).toMatchObject({ every: 'week', first: '2026-10-01' })
    })
    it('is not told when the statements begin too late to know it is new (less than a cycle before its first payment)', () => {
      expect(names(changes(lines, '2026-10', [statement(BANK, '2026-08-01', TODAY)]).started)).toEqual([])
      expect(names(changes(lines, '2026-10', []).started)).toEqual([])
    })
    it('is not told for a payee paid before, even long before', () => {
      const before = [line(BANK, '2026-06-12', -10, 'NEW SUB'), ...lines]
      expect(names(changes(before, '2026-10', [statement(BANK, '2026-05-01', TODAY)]).started)).toEqual([])
    })
  })
})

describe('moneyYear: a year of your accounts (v0.20.27)', () => {
  const own = new Set(['my own savings'])
  const lines = classify(
    [
      line(BANK, '2025-12-30', -50, 'EXAMPLE SHOP'), // another year
      line(BANK, '2026-02-03', 2000, 'EXAMPLE EMPLOYER'),
      line(BANK, '2026-06-01', 1500, 'EXAMPLE EMPLOYER'),
      line(BANK, '2026-02-10', -300, 'TESCO STORES SOMETOWN GBR'),
      line(BANK, '2026-03-04', -200, 'TESCO STORES SOMETOWN GBR'),
      line(BANK, '2026-04-10', -100, 'TESCO STORES SOMETOWN GBR'),
      line(BANK, '2026-04-12', 20, 'Refund for TESCO STORES SOMETOWN GBR'),
      line(BANK, '2026-05-01', -400, 'MY OWN SAVINGS'), // moved, not spent
      ...['2026-02-14', '2026-03-14', '2026-04-14', '2026-05-14'].map((d) => line(BANK, d, -10, 'EXAMPLE STREAMING')),
      ...['2026-01-10', '2026-02-10', '2026-03-10'].map((d) => line(BANK, d, -25, 'EXAMPLE OLD GYM')), // stopped since
    ],
    own,
  )
  const covered = [statement(BANK, '2026-01-01', TODAY)]
  const year = (statements = covered, closed: ReadonlySet<string> = new Set()) => moneyYear(lines, '2026', TODAY, statements, closed, {})

  it('adds up what went out and came in during the year, leaving out money moved and other years, a refund lowering its payee', () => {
    const y = year()
    expect(y.in).toBe(350000)
    // 300 + 200 + 100 - 20 at Tesco, 4 x 10 streaming, 3 x 25 gym.
    expect(y.out).toBe(58000 + 4000 + 7500)
    expect(y.months).toEqual({ first: '2026-01', last: '2026-06' })
  })
  it('groups it by what it was for and by payee, ranked only with 3 or more payments', () => {
    const y = year()
    expect(y.kinds.ranked.map((k) => [k.kind, k.total])).toEqual([['Groceries', 58000]])
    expect(y.payees.out.ranked.map((g) => [g.payee.name, g.total])).toEqual([['Tesco', 58000], ['Example Old Gym', 7500], ['Example Streaming', 4000]])
  })
  it('lists the regular payments paid in the year, what was paid and how often, a stopped one included', () => {
    expect(year().regular.map((r) => [r.payee.name, r.every, r.total, r.lines.length])).toEqual([
      ['Example Old Gym', 'month', 7500, 3],
      ['Example Streaming', 'month', 4000, 4],
    ])
  })
  it('names the days with no statement inside the year, per account, and none for a closed account after its last', () => {
    const broken = [statement(BANK, '2026-01-01', '2026-03-31'), statement(BANK, '2026-05-01', TODAY)]
    expect(year(broken).gaps).toEqual([{ account: BANK, from: '2026-04-01', to: '2026-04-30' }])
    expect(year([statement(BANK, '2026-01-01', '2026-08-31')]).gaps).toEqual([{ account: BANK, from: '2026-09-01', to: TODAY }])
    expect(year([statement(BANK, '2026-01-01', '2026-08-31')], new Set([BANK])).gaps).toEqual([])
    expect(year().gaps).toEqual([])
  })
  it('is empty for a year with nothing in it', () => {
    const none = moneyYear(lines, '2024', TODAY, covered, new Set(), {})
    expect([none.out, none.in, none.months, none.regular, none.gaps]).toEqual([0, 0, null, [], []])
  })
})

describe('monthEndBalances: what you hold and what you owe at the end of each month (v0.20.28)', () => {
  const CARD = 'M&S Card ···9999'
  const OTHER = 'First Direct ···1111'
  const TODAY_APRIL = '2026-04-15'
  /** An account's lines with the balance printed beside each, in the order given; a card's balance is what's owed. */
  const ledger = (account: string, opening: number, rows: [string, number][], owed = false) => {
    let balance = opening
    return rows.map(([date, pounds]) => {
      balance -= (owed ? 1 : -1) * Math.round(pounds * 100)
      return line(account, date, pounds, 'EXAMPLE', { balance })
    })
  }
  const run = (lines: BankLine[], statements: StatementRecord[], closed: ReadonlySet<string> = new Set(), today = TODAY_APRIL) =>
    monthEndBalances(classify(lines, new Set()), statements, closed, '2026', today)
  const heldBy = (found: ReturnType<typeof run>) => found.months.map((m) => [m.month, m.held])

  it('is the balance after the last line, kept from a quiet month, and the current month up to today', () => {
    const lines = ledger(BANK, 20000, [['2026-01-10', -10], ['2026-03-05', -20], ['2026-03-20', 50]])
    expect(heldBy(run(lines, [statement(BANK, '2026-01-01', TODAY_APRIL)]))).toEqual([
      ['2026-01', 19000],
      ['2026-02', 19000],
      ['2026-03', 22000],
      ['2026-04', 22000],
    ])
  })

  it('finds the last line of a day by chaining the balances, whatever order the lines come in', () => {
    const sameDay = ledger(BANK, 20000, [['2026-01-20', -1], ['2026-01-20', -2], ['2026-01-20', 0.5]])
    // 20000 - 100 - 200 + 50 = 19750, however they are handed over.
    for (const order of [sameDay, [...sameDay].reverse(), [sameDay[1]!, sameDay[2]!, sameDay[0]!]]) {
      expect(heldBy(run(order, [statement(BANK, '2026-01-01', TODAY_APRIL)]))[0]).toEqual(['2026-01', 19750])
    }
  })

  it('knows a card’s balance is what it owes, apart from what is held, and a pot is held', () => {
    const POT = 'Monzo Savings pot'
    const lines = [
      ...ledger(CARD, 5000, [['2026-01-12', -20], ['2026-01-20', -10], ['2026-02-05', 30]], true),
      ...ledger(POT, 10000, [['2026-02-02', 25]]),
    ]
    const found = run(lines, [statement(CARD, '2026-01-01', TODAY_APRIL), statement(POT, '2026-01-01', TODAY_APRIL)])
    expect(found.months.map((m) => [m.month, m.held, m.owed])).toEqual([
      ['2026-01', 10000, 8000],
      ['2026-02', 12500, 5000],
      ['2026-03', 12500, 5000],
      ['2026-04', 12500, 5000],
    ])
    expect(found.accounts.map((a) => [a.account, a.owed])).toEqual([[CARD, true], [POT, false]])
  })

  it('does not know a month when its account has no statement for the days up to its end, and says which', () => {
    const lines = ledger(BANK, 20000, [['2026-01-10', -10], ['2026-03-05', -20], ['2026-05-02', 5]])
    const gap = [statement(BANK, '2026-01-01', '2026-03-31'), statement(BANK, '2026-05-01', '2026-06-30')]
    const found = run(lines, gap, new Set(), '2026-06-30')
    expect(heldBy(found)).toEqual([['2026-01', 19000], ['2026-02', 19000], ['2026-03', 17000], ['2026-04', null], ['2026-05', 17500], ['2026-06', 17500]])
    expect(found.months[3]!.unknown).toEqual([{ account: BANK, owed: false, why: 'statement' }])
  })

  it('does not know a month when a balance is missing or the order of its last day cannot be told', () => {
    const missing = ledger(BANK, 20000, [['2026-01-10', -10], ['2026-01-10', -5]])
    missing[1] = { ...missing[1]!, balance: null }
    expect(run(missing, [statement(BANK, '2026-01-01', '2026-01-31')], new Set(), '2026-01-31').months[0]).toMatchObject({ held: null, unknown: [{ why: 'order' }] })
    // +£5.00 then -£5.00 on one day: each balance is the other's start, so which is last cannot be told.
    const loop = ledger(BANK, 20000, [['2026-01-10', 5], ['2026-01-10', -5]])
    expect(run(loop, [statement(BANK, '2026-01-01', '2026-01-31')], new Set(), '2026-01-31').months[0]).toMatchObject({ held: null, unknown: [{ why: 'order' }] })
  })

  it('knows the end of a day whose lines cancel out, from the day before: +£350.00 then -£350.00 ends where it began, in either order (a real statement had one, v0.20.31)', () => {
    // 20000 - 1000 = 19000 at the end of the 28th; the 29th ends there too, however its two lines are handed over.
    const lines = ledger(BANK, 20000, [['2026-01-28', -10], ['2026-01-29', 350], ['2026-01-29', -350]])
    for (const order of [lines, [lines[0]!, lines[2]!, lines[1]!], [...lines].reverse()]) {
      expect(run(order, [statement(BANK, '2026-01-01', '2026-01-31')], new Set(), '2026-01-31').months[0]).toMatchObject({ held: 19000, unknown: [] })
    }
  })
  it('still cannot tell such a day when nothing before it is known, or when a statement is missing before it', () => {
    const first = ledger(BANK, 20000, [['2026-01-29', 350], ['2026-01-29', -350]])
    expect(run(first, [statement(BANK, '2026-01-01', '2026-01-31')], new Set(), '2026-01-31').months[0]).toMatchObject({ held: null, unknown: [{ why: 'order' }] })
  })

  it('adds up several accounts held, but not when one of them is not known for the month', () => {
    const lines = [...ledger(BANK, 20000, [['2026-01-10', -10], ['2026-03-05', -20]]), ...ledger(OTHER, 1000, [['2026-01-15', 5], ['2026-03-10', 5]])]
    const both = [statement(BANK, '2026-01-01', TODAY_APRIL), statement(OTHER, '2026-01-01', TODAY_APRIL)]
    expect(heldBy(run(lines, both))).toEqual([['2026-01', 19000 + 1500], ['2026-02', 19000 + 1500], ['2026-03', 17000 + 2000], ['2026-04', 17000 + 2000]])
    const found = run(lines, [statement(BANK, '2026-01-01', TODAY_APRIL), statement(OTHER, '2026-01-01', '2026-02-28')])
    expect(heldBy(found)).toEqual([['2026-01', 20500], ['2026-02', 20500], ['2026-03', null], ['2026-04', null]])
    expect(found.months[2]!.unknown).toEqual([{ account: OTHER, owed: false, why: 'statement' }])
  })

  it('leaves out an account once it is closed, after its last statement, and months before it began', () => {
    const lines = [...ledger(BANK, 20000, [['2026-02-10', -10]]), ...ledger(OTHER, 1000, [['2026-01-15', 5]])]
    const statements = [statement(BANK, '2026-02-01', TODAY_APRIL), statement(OTHER, '2026-01-01', '2026-01-31')]
    // Other closed after January; the bank begins in February, so January has only Other.
    const found = run(lines, statements, new Set([OTHER]))
    expect(heldBy(found)).toEqual([['2026-01', 1500], ['2026-02', 19000], ['2026-03', 19000], ['2026-04', 19000]])
    expect(found.months.every((m) => m.unknown.length === 0)).toBe(true)
    expect(heldBy(run(lines, [statement(BANK, '2026-02-01', TODAY_APRIL)]))[0]).toEqual(['2026-02', 19000])
  })

  it('has no months for a year with nothing in it, nor beyond this month', () => {
    const lines = ledger(BANK, 20000, [['2026-01-10', -10]])
    expect(monthEndBalances(classify(lines, new Set()), [statement(BANK, '2026-01-01', TODAY_APRIL)], new Set(), '2024', TODAY_APRIL).months).toEqual([])
    expect(run(lines, [statement(BANK, '2026-01-01', TODAY_APRIL)]).months.at(-1)!.month).toBe('2026-04')
  })
})

describe('monthCoverage: which months have every statement in (v0.20.32: the chart’s average counted November, not begun, as £0, and October with one account’s statements)', () => {
  const OTHER = 'First Direct ···1111'
  const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-08', '2026-09', '2026-10', '2026-11']
  const coverage = (statements: StatementRecord[], closed: ReadonlySet<string> = new Set(), today = '2026-11-01') => monthCoverage(statements, closed, MONTHS, today)
  const complete = (found: ReturnType<typeof coverage>) => found.filter((m) => m.complete).map((m) => m.month)

  it('is complete when the month is over and every account begun by then has statements for all its days', () => {
    expect(complete(coverage([statement(BANK, '2026-01-01', '2026-10-31')]))).toEqual(['2026-01', '2026-02', '2026-03', '2026-08', '2026-09', '2026-10'])
  })
  it('is never complete for the month you are in, nor for one before any statement began', () => {
    const found = coverage([statement(BANK, '2026-03-01', '2026-10-31')])
    expect(found.find((m) => m.month === '2026-11')).toMatchObject({ complete: false })
    expect(found.find((m) => m.month === '2026-02')).toMatchObject({ complete: false, missing: [] })
    expect(complete(found)).toEqual(['2026-03', '2026-08', '2026-09', '2026-10'])
  })
  it('names the accounts missing days: one that stops early is missing every month after', () => {
    const found = coverage([statement(BANK, '2026-01-01', '2026-08-31'), statement(OTHER, '2026-03-01', '2026-10-31')])
    expect(complete(found)).toEqual(['2026-01', '2026-02', '2026-03', '2026-08'])
    expect(found.find((m) => m.month === '2026-09')).toMatchObject({ complete: false, missing: [BANK] })
    expect(found.find((m) => m.month === '2026-10')).toMatchObject({ complete: false, missing: [BANK] })
  })
  it('does not ask an account for months before its first statement, nor a closed one for days after its last', () => {
    const statements = [statement(BANK, '2026-01-01', '2026-10-31'), statement(OTHER, '2026-03-01', '2026-08-31')]
    // Other began in March: January and February need only the bank. Closed after August, it is not asked for more.
    expect(complete(coverage(statements, new Set([OTHER])))).toEqual(['2026-01', '2026-02', '2026-03', '2026-08', '2026-09', '2026-10'])
    expect(complete(coverage(statements))).toEqual(['2026-01', '2026-02', '2026-03', '2026-08'])
  })
  it('makes only the months a gap touches incomplete', () => {
    const found = coverage([statement(BANK, '2026-01-01', '2026-08-15'), statement(BANK, '2026-09-20', '2026-10-31')])
    expect(complete(found)).toEqual(['2026-01', '2026-02', '2026-03', '2026-10'])
    expect(found.find((m) => m.month === '2026-08')).toMatchObject({ complete: false, missing: [BANK] })
    expect(found.find((m) => m.month === '2026-09')).toMatchObject({ complete: false, missing: [BANK] })
    expect(found.find((m) => m.month === '2026-10')).toMatchObject({ complete: true, missing: [] })
  })
  it('is incomplete for every month with no statements at all', () => {
    expect(complete(coverage([]))).toEqual([])
  })

  describe('averageOfComplete', () => {
    const totals = [{ month: '2026-08', out: 4000 }, { month: '2026-09', out: 5000 }, { month: '2026-10', out: 6000 }, { month: '2026-11', out: 0 }]
    const covered = (...months: string[]) => totals.map((t) => ({ month: t.month, complete: months.includes(t.month), missing: [] as string[] }))
    it('averages only the complete months, leaving out the others rather than counting them as nothing', () => {
      expect(averageOfComplete(totals, covered('2026-08', '2026-09'))).toEqual({ value: 4500, months: 2 })
      expect(averageOfComplete(totals, covered('2026-08', '2026-09', '2026-10'))).toEqual({ value: 5000, months: 3 })
    })
    it('says nothing from fewer than 2 complete months', () => {
      expect(averageOfComplete(totals, covered('2026-08'))).toBeNull()
      expect(averageOfComplete(totals, covered())).toBeNull()
    })
  })
})

describe('Who it was for: a name on a payee’s payments or on one payment (v0.20.38)', () => {
  const PHARMACY = 'EXAMPLE PHARMACY LEICESTER'
  const bought = [
    line(BANK, '2026-10-03', -5, PHARMACY),
    line(BANK, '2026-10-07', -4.99, PHARMACY),
    line(BANK, '2026-10-15', -4.99, PHARMACY),
    line(BANK, '2026-10-16', -12, 'EXAMPLE TOY SHOP'),
    line(BANK, '2026-10-20', -20, 'EXAMPLE GROCER'),
    line(BANK, '2026-10-21', -30, 'EXAMPLE GROCER'),
    line(BANK, '2026-10-22', -40, 'EXAMPLE GROCER'),
    line(BANK, '2026-10-23', 4.99, `Refund for ${PHARMACY}`),
    line(BANK, '2026-10-24', -100, 'MY OWN SAVINGS'),
  ]
  const [first, second, third, toy, g1] = classify(bought, new Set(['my own savings']))
  const key = first!.payee.key
  const filed = (payeeFor: Record<string, string>, paymentFor: Record<string, string> = {}) => withFor(classify(bought, new Set(['my own savings'])), payeeFor, paymentFor)
  const whoOf = (lines: readonly { forWho?: string }[]) => lines.map((l) => l.forWho)

  it('files a shop’s payments under a name, earlier and later ones too; a payment’s own name beats it, and "" says nobody', () => {
    const lines = filed({ [key]: 'Riya' }, { [second!.id]: 'Home', [third!.id]: '' })
    expect(whoOf(lines.slice(0, 3))).toEqual(['Riya', 'Home', undefined])
    expect(lines[3]!.forWho).toBeUndefined()
  })
  it('groups money out by name: 3 or more payments ranked by amount, the rest by name, nobody apart; a refund takes off', () => {
    const lines = filed({ [key]: 'Riya', [g1!.payee.key]: 'Home' })
    const month = moneyMonth(lines, '2026-10', '2026-10-27', [])
    const who = month.forWho!
    // Riya: 5.00 + 4.99 + 4.99 less the 4.99 back; Home: 20 + 30 + 40.
    expect(who.ranked.map((g) => [g.who, g.total, g.lines.filter((l) => !l.refund).length])).toEqual([['Home', 9000, 3], ['Riya', 999, 3]])
    expect(who.others).toEqual([])
    // The toy shop is nobody in particular; money moved is in nothing.
    expect(who.nobody).toMatchObject({ who: NOBODY, total: 1200 })
    expect(who.nobody!.lines.map((l) => l.payee.name)).toEqual(['Example Toy Shop'])
  })
  it('lists fewer than 3 payments by name, and has no block until something is filed', () => {
    const lines = filed({}, { [toy!.id]: 'Sam', [first!.id]: 'Riya' })
    const who = moneyMonth(lines, '2026-10', '2026-10-27', []).forWho!
    expect(who.ranked.map((g) => g.who)).toEqual([])
    expect(who.others.map((g) => g.who)).toEqual(['Riya', 'Sam'])
    expect(moneyMonth(filed({}), '2026-10', '2026-10-27', []).forWho).toBeNull()
    expect(moneyYear(filed({}), '2026', '2026-10-27', [], new Set()).forWho).toBeNull()
  })
  it('is in the year too', () => {
    const year = moneyYear(filed({ [key]: 'Riya' }), '2026', '2026-10-27', [], new Set()).forWho!
    expect(year.others.concat(year.ranked).map((g) => g.who)).toEqual(['Riya'])
  })
  it('is found by a search', () => {
    expect(searchPayments(filed({ [key]: 'Riya' }), 'riya').map((l) => l.date)).toEqual(['2026-10-23', '2026-10-15', '2026-10-07', '2026-10-03'])
  })
  it('offers the names in use, then the people in your entries who are not', () => {
    expect(forNamesOf({ a: 'Sam', b: 'Riya' }, { c: 'sam', d: '', e: 'Home' })).toEqual(['Home', 'Riya', 'Sam'])
    // Receipt items name them too.
    expect(forNamesOf({ a: 'Sam' }, {}, { f: 'Asha' })).toEqual(['Asha', 'Sam'])
    expect(suggestedPeople(['Priya', 'riya', 'Priya', ' ', 'Asha', 'Priya', 'Asha'], ['Riya'])).toEqual(['Priya', 'Asha'])
    expect(suggestedPeople(['A', 'B', 'C'], [], 2)).toEqual(['A', 'B'])
  })
})

describe('labelsOf: a note you wrote before v0.20.36 is the payment’s name (v0.20.36)', () => {
  it('is its name when it has none of its own; a name beats a note, per payment', () => {
    expect(labelsOf({ a: 'Birthday present', b: 'Winter bill' }, { b: 'Gas', c: 'Fever medicine' })).toEqual({ a: 'Birthday present', b: 'Gas', c: 'Fever medicine' })
    expect(labelsOf({}, {})).toEqual({})
  })
})

describe('classify: a name for one payment alone (v0.20.35)', () => {
  // One pharmacy, three different medicines: renaming the payee would name all three the same.
  const bought = [line(BANK, '2026-07-01', -5, 'EXAMPLE PHARMACY LEICESTER'), line(BANK, '2026-08-21', -4.99, 'EXAMPLE PHARMACY LEICESTER'), line(BANK, '2026-10-07', -4.99, 'EXAMPLE PHARMACY LEICESTER')]
  const second = bought[1]!.id

  it('labels only that payment; it is still a payment to the same shop, so grouping, regular runs and refunds do not move', () => {
    const lines = classify(bought, new Set(), {}, { [second]: 'Fever medicine' })
    expect(lines.map((l) => l.label)).toEqual([undefined, 'Fever medicine', undefined])
    expect(new Set(lines.map((l) => l.payee.key)).size).toBe(1)
    expect(lines.map(nameOf)).toEqual(['Example Pharmacy Leicester', 'Fever medicine', 'Example Pharmacy Leicester'])
    expect(moneyMonth(lines, '2026-08', TODAY, []).payees.out.others.map((g) => [g.payee.name, g.lines.length])).toEqual([['Example Pharmacy Leicester', 1]])
  })
  it('is separate from the shop’s name: the label wins for that payment, the shop’s name for the rest', () => {
    const lines = classify(bought, new Set(), { 'example pharmacy leicester': 'The pharmacy' }, { [second]: 'Fever medicine' })
    expect(lines.map(nameOf)).toEqual(['The pharmacy', 'Fever medicine', 'The pharmacy'])
    expect(lines[1]!.payee.name).toBe('The pharmacy')
  })
  it('is found by a search, for the one payment, and the shop’s name still finds all three', () => {
    const lines = classify(bought, new Set(), {}, { [second]: 'Fever medicine' })
    expect(searchPayments(lines, 'fever').map((l) => l.date)).toEqual(['2026-08-21'])
    expect(searchPayments(lines, 'pharmacy').map((l) => l.date)).toEqual(['2026-10-07', '2026-08-21', '2026-07-01'])
  })
})

describe('searchPayments: find a payment across every month and account (v0.20.33)', () => {
  const all = classify(
    [
      line(BANK, '2025-03-02', -24.99, 'AMAZON.CO.UK*AB12 LONDON'),
      line(BANK, '2025-11-05', -10, 'AMAZON* 9X8 LUXEMBOURG'),
      line(CURRENT, '2026-02-10', -24.99, 'EXAMPLE SHOP SOMETOWN GBR'),
      line(BANK, '2026-03-03', -3, 'TESCO STORES 1234 GBR'),
      line(BANK, '2026-04-04', 12.5, 'Refund for AMAZON.CO.UK'),
      line(BANK, '2026-05-05', -400, 'MY OWN SAVINGS'),
      line(BANK, '2026-06-06', -8, 'COFFEE PLACE'),
    ],
    new Set(['my own savings']),
    { 'example shop sometown': 'The Corner Shop' },
  )
  const noted = all.find((l) => l.description === 'COFFEE PLACE')!
  const found = (query: string) => searchPayments(all, query).map((l) => l.date)

  it('finds a payee by its name or the statement’s words, whatever the case, newest first', () => {
    expect(found('amazon')).toEqual(['2026-04-04', '2025-11-05', '2025-03-02'])
    expect(found('AMAZON.co')).toEqual(['2026-04-04', '2025-03-02'])
  })
  it('finds a payee you renamed by the name you gave it and by the name as printed', () => {
    expect(found('corner shop')).toEqual(['2026-02-10'])
    expect(found('sometown')).toEqual(['2026-02-10'])
  })
  it('finds an amount, with or without the £, and as far as you have typed it', () => {
    expect(found('24.99')).toEqual(['2026-02-10', '2025-03-02'])
    expect(found('£24.99')).toEqual(['2026-02-10', '2025-03-02'])
    expect(found('24.9')).toEqual(['2026-02-10', '2025-03-02'])
    expect(found('12.50')).toEqual(['2026-04-04'])
  })
  it('finds the name you gave one payment, which is where a note you wrote before v0.20.36 went', () => {
    expect(found('birthday')).toEqual([])
    const named = classify([line(BANK, '2026-06-06', -8, 'COFFEE PLACE', { id: noted.id })], new Set(), {}, labelsOf({ [noted.id]: 'Birthday present' }, {}))
    expect(searchPayments(named, 'birthday').map((l) => l.date)).toEqual(['2026-06-06'])
  })
  it('finds money moved between your own accounts too, since it is on a statement', () => {
    expect(searchPayments(all, 'own savings').map((l) => l.moving)).toEqual(['own'])
  })
  it('needs two characters, and finds nothing for a blank search', () => {
    expect(found('a')).toEqual([])
    expect(found('  ')).toEqual([])
    expect(found('')).toEqual([])
    expect(found('zzz')).toEqual([])
  })

  describe('paymentYears', () => {
    it('groups what was found by year, newest first: payments out, what they come to, what came in', () => {
      const years = paymentYears(searchPayments(all, 'amazon'))
      expect(years.map((y) => [y.year, y.payments, y.out, y.in, y.moves.length])).toEqual([
        ['2026', 0, -1250, 0, 0], // only a refund: money back, no payment
        ['2025', 2, 3499, 0, 0],
      ])
      expect(years[1]!.lines.map((l) => l.date)).toEqual(['2025-11-05', '2025-03-02'])
    })
    it('takes a refund off what was paid, and counts money moved apart from both', () => {
      // "co": a .co.uk payment, the corner shop, Tesco, a refund from .co.uk and the coffee place; 2025 has the first only.
      const years = paymentYears(searchPayments(all, 'co'))
      // 2026: 3 payments (£8.00 + £3.00 + £24.99) less the £12.50 back.
      expect(years.map((y) => [y.year, y.payments, y.out, y.in, y.moves.length])).toEqual([
        ['2026', 3, 800 + 300 + 2499 - 1250, 0, 0],
        ['2025', 1, 2499, 0, 0],
      ])
      expect(paymentYears(searchPayments(all, 'savings')).map((y) => [y.year, y.payments, y.out, y.in, y.moves.length])).toEqual([['2026', 0, 0, 0, 1]])
    })
    it('keeps money moved apart from the payments, so a purchase and its Flex side are not two rows of one list (v0.20.34)', () => {
      const flex = classify(
        [
          line(BANK, '2026-10-08', -41, 'EXAMPLE PASSPORT OFFICE'),
          line(BANK, '2026-10-08', 41, 'Flex'),
          line('Monzo Flex', '2026-10-08', -41, 'EXAMPLE PASSPORT OFFICE moved to Flex'),
        ],
        new Set(),
      )
      const [year] = paymentYears(searchPayments(flex, 'passport'))
      expect(year!.payments).toBe(1)
      expect(year!.out).toBe(4100)
      expect(year!.lines.map((l) => [l.account, l.moving])).toEqual([[BANK, null]])
      expect(year!.moves.map((l) => [l.account, l.moving])).toEqual([['Monzo Flex', 'flex']])
    })
    it('says nothing for nothing found', () => {
      expect(paymentYears([])).toEqual([])
    })
  })
})
