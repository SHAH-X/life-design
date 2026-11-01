import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { createBackup } from '../../src/db/backup'
import { ACCOUNT_NAMES, accountNamesOf, bringInStatement, markClosed, markOwnPayee, nameAccount, namePayment, PAYMENT_NAMES, CLOSED_ACCOUNTS, matchReceiptPayment, PAYEE_KINDS, PAYMENT_NOTES, RECEIPT_REVIEWS, receiptReviewState, setPayeeKind, namePayee, removeAccount, OWN_PAYEES, ownPayeesOf, PAYEE_NAMES, unmatchReceiptPayment } from '../../src/db/statements'
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

  describe('receipt payment review state', () => {
    let phone: LifeDesignDB
    beforeEach(() => {
      phone = openDb(`receipt-reviews-${crypto.randomUUID()}`)
    })
    afterEach(async () => {
      await phone.delete()
    })

    it('keeps an owner’s explanation with a unique payment link, and removes both on unlink', async () => {
      await phone.bankLines.put({
        id: 'fictional-debit',
        account: 'Example Current',
        date: '2026-10-11',
        amount: -9071,
        description: 'CORNER SHOP',
        type: 'DEB',
        balance: null,
        adds: true,
        createdAt: 1,
        updatedAt: 1,
      })
      await matchReceiptPayment('fictional-receipt', 'fictional-debit', 'Gift-card discount', new Set(['fictional-receipt', 'other-receipt']), phone)
      expect(receiptReviewState((await phone.settings.get(RECEIPT_REVIEWS))?.value)).toMatchObject({
        paymentLinks: { 'fictional-receipt': 'fictional-debit' },
        paymentReasons: { 'fictional-receipt': 'Gift-card discount' },
      })
      await expect(matchReceiptPayment('other-receipt', 'fictional-debit', 'Other reason', new Set(['fictional-receipt', 'other-receipt']), phone)).rejects.toThrow(
        'This payment is already linked to another receipt.',
      )
      await unmatchReceiptPayment('fictional-receipt', phone)
      expect(receiptReviewState((await phone.settings.get(RECEIPT_REVIEWS))?.value)).toMatchObject({ paymentLinks: {}, paymentReasons: {} })
    })

    it('reads older review state without payment explanations', () => {
      expect(receiptReviewState({ acceptedDates: ['photo'], paymentLinks: { photo: 'debit' } })).toEqual({
        acceptedDates: ['photo'],
        paymentLinks: { photo: 'debit' },
        paymentReasons: {},
      })
    })
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

  it('removes an account wholly: its lines, statements and name (owner, 2026-10-26: one read wrongly)', async () => {
    const [lloyds] = accountsOf(LLOYDS_LIKE)
    await bringInStatement([lloyds!, { ...lloyds!, account: 'Other' }], phone, 5)
    await nameAccount(lloyds!.account, 'Joint', phone)
    await markClosed(lloyds!.account, true, phone)
    await markClosed('Other', true, phone)
    await removeAccount(lloyds!.account, phone)
    expect(await phone.bankLines.where('account').equals(lloyds!.account).count()).toBe(0)
    expect(await phone.statements.where('account').equals(lloyds!.account).count()).toBe(0)
    expect(await phone.bankLines.where('account').equals('Other').count()).toBe(4)
    expect(accountNamesOf(await phone.settings.get(ACCOUNT_NAMES))).toEqual({})
    expect(ownPayeesOf(await phone.settings.get(CLOSED_ACCOUNTS))).toEqual(['Other'])
  })

  it('keeps what a payee is for; empty takes it away (owner, 2026-10-26)', async () => {
    await setPayeeKind('a n other', 'Rent', phone)
    await setPayeeKind('example gym', 'Health', phone)
    await setPayeeKind('example gym', null, phone)
    expect(accountNamesOf(await phone.settings.get(PAYEE_KINDS))).toEqual({ 'a n other': 'Rent' })
  })

  it('naming a payment, or emptying its name, takes away the note written on it before v0.20.36, which was its name', async () => {
    await phone.settings.put({ key: PAYMENT_NOTES, value: { l1: 'Birthday present', l2: 'Winter bill', l3: 'Kept' }, updatedAt: 1 })
    await namePayment('l1', 'Present for Sam', phone)
    await namePayment('l2', '', phone)
    expect(accountNamesOf(await phone.settings.get(PAYMENT_NOTES))).toEqual({ l3: 'Kept' })
    expect(accountNamesOf(await phone.settings.get(PAYMENT_NAMES))).toEqual({ l1: 'Present for Sam' })
  })

  it('keeps a name for one payment alone, by the line’s id, in a backup; empty takes it away (v0.20.35)', async () => {
    await namePayment('l1', '  Fever medicine ', phone)
    await namePayment('l2', 'Gone', phone)
    await namePayment('l2', ' ', phone)
    await namePayee('example pharmacy', 'The pharmacy', phone)
    expect(accountNamesOf(await phone.settings.get(PAYMENT_NAMES))).toEqual({ l1: 'Fever medicine' })
    // It is not the payee's name: naming a payment leaves its shop's name alone, and the other way round.
    expect(accountNamesOf(await phone.settings.get(PAYEE_NAMES))).toEqual({ 'example pharmacy': 'The pharmacy' })
    const backup = await createBackup(phone, new Date('2026-11-01T12:00:00Z'))
    expect(backup.data.settings.find((row) => row.key === 'paymentNames')?.value).toEqual({ l1: 'Fever medicine' })
  })

  it('counts the lines whose printed balance doesn’t follow, to check', async () => {
    const [account] = accountsOf(LLOYDS_LIKE)
    const slipped = { ...account!, lines: account!.lines.map((l, i) => (i === 2 ? { ...l, adds: false } : l)) }
    expect(await bringInStatement([slipped], phone, 5)).toMatchObject([{ notAdding: 1 }])
    expect((await phone.bankLines.filter((l) => !l.adds).toArray()).map((l) => l.description)).toEqual(['EXAMPLE STREAMING'])
  })
})
