import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { bringInInvesting, nameInvestmentAccounts } from '../../src/db/invest'
import { ACCOUNT_NAMES, accountNamesOf, nameAccount } from '../../src/db/statements'
import { readStatement } from '../../src/domain/statements'
import { piecesOf } from '../fixtures/pdf'
import { activityLike, TRANSACTIONS_LIKE } from '../fixtures/trading212'

// Trading 212's trades, dividends and interest kept on the phone, each once (v0.36.0). Fictional statements only.

const investingOf = (pages: Parameters<typeof piecesOf>[0]) => {
  const read = readStatement(piecesOf(pages))
  if ('problem' in read) throw new Error(read.problem)
  return read.investing ?? []
}

let phone: LifeDesignDB
beforeEach(() => {
  phone = openDb(`invest-${crypto.randomUUID()}`)
})
afterEach(async () => {
  await phone.delete()
})

describe('bringInInvesting', () => {
  it('keeps each trade, dividend and interest line, and the statement’s totals, saying how many were new', async () => {
    const [brought] = await bringInInvesting(investingOf(activityLike()), phone, 5)
    // 6 trades, 2 dividends, 3 interest.
    expect(brought).toEqual({ account: 'Trading 212 ···0001', from: '2026-09-20', to: '2026-10-18', trades: 6, dividends: 2, interest: 3, added: 11, already: 0, mismatches: [] })
    expect(await phone.investLines.where('kind').equals('trade').count()).toBe(6)
    const summaries = await phone.investSummaries.toArray()
    expect(summaries).toMatchObject([{ account: 'Trading 212 ···0001', accountValue: 500000, openResult: -41250, openResultChange: -3120, mismatches: [] }])
  })

  it('brings in nothing twice: the same statement again, and the other document’s interest, add no line', async () => {
    await bringInInvesting(investingOf(activityLike()), phone, 5)
    const again = await bringInInvesting(investingOf(activityLike()), phone, 6)
    expect(again[0]).toMatchObject({ added: 0, already: 11 })
    const other = await bringInInvesting(investingOf(TRANSACTIONS_LIKE), phone, 7)
    expect(other[0]).toMatchObject({ interest: 3, added: 0, already: 3 })
    expect(await phone.investLines.count()).toBe(11)
    // The document with no totals leaves the statement's alone.
    expect(await phone.investSummaries.count()).toBe(1)
    expect((await phone.investSummaries.toArray())[0]).toMatchObject({ openResult: -41250 })
  })

  it('keeps what the statement’s lines did not add up to', async () => {
    const [brought] = await bringInInvesting(investingOf(activityLike(undefined, { 'Closed result': 9999 })), phone, 5)
    expect(brought!.mismatches).toEqual(['Closed result £12.74, the statement says £99.99'])
    expect((await phone.investSummaries.toArray())[0]!.mismatches).toEqual(['Closed result £12.74, the statement says £99.99'])
  })
})

describe('nameInvestmentAccounts: each account is shown by its type', () => {
  const labels = { 'Trading 212 ···0001': 'Stocks ISA', 'Trading 212 ···0002': 'Invest' }
  it('names each "Trading 212 Stocks ISA", the account itself still known by its digits', async () => {
    await nameInvestmentAccounts(labels, phone)
    expect(accountNamesOf(await phone.settings.get(ACCOUNT_NAMES))).toEqual({ 'Trading 212 ···0001': 'Trading 212 Stocks ISA', 'Trading 212 ···0002': 'Trading 212 Invest' })
  })

  it('leaves a name you gave as it is, and does the rest', async () => {
    await nameAccount('Trading 212 ···0001', 'My ISA', phone)
    await nameInvestmentAccounts(labels, phone)
    expect(accountNamesOf(await phone.settings.get(ACCOUNT_NAMES))).toEqual({ 'Trading 212 ···0001': 'My ISA', 'Trading 212 ···0002': 'Trading 212 Invest' })
  })

  it('changes nothing when a statement had no types', async () => {
    await nameInvestmentAccounts(undefined, phone)
    expect(await phone.settings.get(ACCOUNT_NAMES)).toBeUndefined()
  })
})
