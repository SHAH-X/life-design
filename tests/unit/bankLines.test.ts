import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { ACCOUNT_NAMES, accountNamesOf, bringInStatement, markOwnPayee, nameAccount, namePayee, OWN_PAYEES, ownPayeesOf, PAYEE_NAMES } from '../../src/db/statements'
import { readStatement, type StatementAccount } from '../../src/domain/statements'
import { piecesOf } from '../fixtures/pdf'
import { LLOYDS_LIKE, MONZO_LIKE } from '../fixtures/statements'

// Statements brought in (v0.20): fictional ones laid out like the owner's real Monzo and Lloyds PDFs.

const accountsOf = (pages: Parameters<typeof piecesOf>[0]): StatementAccount[] => {
  const read = readStatement(piecesOf(pages))
  if ('problem' in read) throw new Error(read.problem)
  return read.accounts
}

describe('bringInStatement: a statement’s lines kept on the phone, each once', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })

  it('keeps each account’s lines and says how many are new, and what the statement covers', async () => {
    const brought = await bringInStatement(accountsOf(MONZO_LIKE), phone, 5)
    expect(brought).toEqual([
      { account: 'Monzo ···5678', from: '2026-09-01', to: '2026-09-30', added: 9, already: 0, notAdding: 0 },
      { account: 'Monzo Savings pot', from: '2026-09-01', to: '2026-09-30', added: 2, already: 0, notAdding: 0 },
    ])
    expect(await phone.bankLines.where('account').equals('Monzo ···5678').count()).toBe(9)
    const coffee = await phone.bankLines.filter((l) => l.description === 'COFFEE PLACE SOMETOWN GBR').toArray()
    expect(coffee.map((l) => [l.date, l.amount, l.balance, l.adds]).sort((a, b) => Number(b[2]) - Number(a[2]))).toEqual([
      ['2026-09-20', -300, 8250, true],
      ['2026-09-20', -300, 7950, true],
    ])
    const records = (await phone.statements.toArray()).map(({ account, from, to, lines }) => ({ account, from, to, lines }))
    expect(records.sort((a, b) => b.lines - a.lines)).toEqual([
      { account: 'Monzo ···5678', from: '2026-09-01', to: '2026-09-30', lines: 9 },
      { account: 'Monzo Savings pot', from: '2026-09-01', to: '2026-09-30', lines: 2 },
    ])
  })

  it('brings in nothing twice: the same statement again adds no line and no second record', async () => {
    await bringInStatement(accountsOf(LLOYDS_LIKE), phone, 5)
    expect(await bringInStatement(accountsOf(LLOYDS_LIKE), phone, 9)).toEqual([{ account: 'Lloyds ···4321', from: '2026-09-01', to: '2026-09-30', added: 0, already: 4, notAdding: 0 }])
    expect(await phone.bankLines.count()).toBe(4)
    expect(await phone.statements.count()).toBe(1)
  })

  it('adds only what’s new from a statement that overlaps one already in; two alike lines on a day both stay', async () => {
    const [account] = accountsOf(LLOYDS_LIKE)
    const lines = account!.lines
    await bringInStatement([{ ...account!, to: '2026-09-12', lines: lines.slice(0, 3) }], phone, 5)
    const later = { ...account!, from: '2026-09-05', lines: lines.slice(1) }
    expect(await bringInStatement([later], phone, 9)).toMatchObject([{ added: 1, already: 2 }])
    // Without balances, two alike lines are told apart only by how many a statement has.
    const plain = { account: 'Card', from: '2026-09-01', to: '2026-09-30', lines: [0, 1].map(() => ({ date: '2026-09-03', amount: -250, description: 'BUS FARE', type: '', balance: null, adds: true })) }
    expect(await bringInStatement([plain], phone, 5)).toMatchObject([{ added: 2, already: 0 }])
    expect(await bringInStatement([plain], phone, 9)).toMatchObject([{ added: 0, already: 2 }])
  })

  it('keeps the payees you mark as your own account, and lets one go again', async () => {
    await markOwnPayee('a n other', true, phone)
    await markOwnPayee('example gym', true, phone)
    await markOwnPayee('a n other', true, phone)
    expect(ownPayeesOf(await phone.settings.get(OWN_PAYEES))).toEqual(['a n other', 'example gym'])
    await markOwnPayee('a n other', false, phone)
    expect(ownPayeesOf(await phone.settings.get(OWN_PAYEES))).toEqual(['example gym'])
    expect(ownPayeesOf(undefined)).toEqual([])
  })

  it('keeps the names you give your accounts; a blank one goes back to the bank’s', async () => {
    await nameAccount('Lloyds ···4321', '  Joint account ', phone)
    await nameAccount('Monzo ···5678', 'Spending', phone)
    await nameAccount('Monzo ···5678', ' ', phone)
    expect(accountNamesOf(await phone.settings.get(ACCOUNT_NAMES))).toEqual({ 'Lloyds ···4321': 'Joint account' })
    expect(accountNamesOf({ value: ['not', 'names'] })).toEqual({})
    expect(accountNamesOf({ value: { a: 'A', b: 2 } })).toEqual({ a: 'A' })
    await namePayee('a n other', 'Example savings', phone)
    expect(accountNamesOf(await phone.settings.get(PAYEE_NAMES))).toEqual({ 'a n other': 'Example savings' })
  })

  it('counts the lines whose printed balance doesn’t follow, to check', async () => {
    const [account] = accountsOf(LLOYDS_LIKE)
    const slipped = { ...account!, lines: account!.lines.map((l, i) => (i === 2 ? { ...l, adds: false } : l)) }
    expect(await bringInStatement([slipped], phone, 5)).toMatchObject([{ notAdding: 1 }])
    expect((await phone.bankLines.filter((l) => !l.adds).toArray()).map((l) => l.description)).toEqual(['EXAMPLE STREAMING'])
  })
})
