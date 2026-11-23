import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { fileItem, ITEM_FOR_SETTING, ITEM_KINDS_SETTING, rememberItemKind } from '../../src/db/receiptItems'
import {
  ACCOUNT_NAMES,
  accountNamesOf,
  CARD_ACCOUNTS,
  CLOSED_ACCOUNTS,
  markClosed,
  markOwnPayee,
  nameAccount,
  nameCard,
  namePayee,
  namePayment,
  OWN_PAYEES,
  PAYEE_KINDS,
  PAYEE_NAMES,
  PAYMENT_NAMES,
  ownPayeesOf,
  setPayeeKind,
} from '../../src/db/statements'
import { rememberedKindsOf, rememberedNamesOf } from '../../src/domain/shopping'

// Step 1 (owner-approved plan, 2026-11-23): Money's choices are lists kept in `settings`. Two saved at nearly the same
// moment (two taps, or a tap as a save finishes) each read the list, added their own and wrote it back, so the later
// write could silently drop the earlier one. Each choice is now read and written in one transaction.
describe('settings that are lists keep every choice made at once', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const value = async (key: string) => (await phone.settings.get(key))?.value

  it('account names', async () => {
    await Promise.all([nameAccount('A', 'Alpha', phone), nameAccount('B', 'Beta', phone), nameAccount('C', 'Gamma', phone)])
    expect(accountNamesOf(await phone.settings.get(ACCOUNT_NAMES))).toEqual({ A: 'Alpha', B: 'Beta', C: 'Gamma' })
  })

  it('card accounts, payee names, payee kinds and payment names', async () => {
    await Promise.all([nameCard('1111', 'A', phone), nameCard('2222', 'B', phone), namePayee('p1', 'One', phone), namePayee('p2', 'Two', phone)])
    await Promise.all([setPayeeKind('p1', 'Bills', phone), setPayeeKind('p2', 'Food', phone), namePayment('l1', 'First', phone), namePayment('l2', 'Second', phone)])
    expect(accountNamesOf({ value: await value(CARD_ACCOUNTS) })).toEqual({ '1111': 'A', '2222': 'B' })
    expect(accountNamesOf({ value: await value(PAYEE_NAMES) })).toEqual({ p1: 'One', p2: 'Two' })
    expect(accountNamesOf({ value: await value(PAYEE_KINDS) })).toEqual({ p1: 'Bills', p2: 'Food' })
    expect(accountNamesOf({ value: await value(PAYMENT_NAMES) })).toEqual({ l1: 'First', l2: 'Second' })
  })

  it('own payees and closed accounts', async () => {
    await Promise.all([markOwnPayee('x', true, phone), markOwnPayee('y', true, phone), markClosed('A', true, phone), markClosed('B', true, phone)])
    expect(ownPayeesOf({ value: await value(OWN_PAYEES) }).sort()).toEqual(['x', 'y'])
    expect(ownPayeesOf({ value: await value(CLOSED_ACCOUNTS) }).sort()).toEqual(['A', 'B'])
  })

  it('kinds and who-for kept for items at a shop', async () => {
    await Promise.all([rememberItemKind('Aldi', 'Milk', 'Drinks', phone), rememberItemKind('Aldi', 'Bread', 'Cupboard', phone), fileItem('Aldi', 'Milk', 'Sam', phone), fileItem('Aldi', 'Bread', 'Alex', phone)])
    expect(Object.keys(rememberedKindsOf(await value(ITEM_KINDS_SETTING))).length).toBe(2)
    expect(Object.keys(rememberedNamesOf(await value(ITEM_FOR_SETTING))).length).toBe(2)
  })
})
