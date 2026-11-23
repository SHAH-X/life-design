import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyImport, createBackup, detectFile } from '../../src/db/backup'
import { removeBill, saveBill, setBudget } from '../../src/db/bills'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { isBill, isBudget } from '../../src/db/validate'

// Step 4 (owner-approved plan, 2026-11-23): the bills and budgets you set, kept as your own records.
describe('bills and budgets you set', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const draft = { name: 'Streaming', kind: 'Subscriptions', amount: 1099, every: 'month' as const, next: '2026-11-03', renewal: null, method: 'Direct debit', notes: '', payee: null }

  it('saves a new bill with an id, and changes it keeping when it was made', async () => {
    const id = await saveBill(draft, null, phone)
    const [first] = await phone.bills.toArray()
    expect(first).toMatchObject({ id, name: 'Streaming', amount: 1099 })
    await new Promise((r) => setTimeout(r, 5))
    await saveBill({ ...draft, amount: 1199, notes: 'Cancel online' }, id, phone)
    const [changed] = await phone.bills.toArray()
    expect(await phone.bills.count()).toBe(1)
    expect(changed).toMatchObject({ id, amount: 1199, notes: 'Cancel online', createdAt: first!.createdAt })
    expect(changed!.updatedAt).toBeGreaterThan(first!.updatedAt)
  })

  it('trims its name and notes, and refuses what is not a bill: no name, a price that is not whole pence or not above nothing, no day', async () => {
    const id = await saveBill({ ...draft, name: '  Streaming  ', notes: ' x ' }, null, phone)
    expect(await phone.bills.get(id)).toMatchObject({ name: 'Streaming', notes: 'x' })
    await expect(saveBill({ ...draft, name: '  ' }, null, phone)).rejects.toThrow(/name/)
    await expect(saveBill({ ...draft, amount: 10.5 }, null, phone)).rejects.toThrow(/amount/)
    await expect(saveBill({ ...draft, amount: 0 }, null, phone)).rejects.toThrow(/amount/)
    await expect(saveBill({ ...draft, next: 'soon' }, null, phone)).rejects.toThrow(/day/)
    expect(await phone.bills.count()).toBe(1)
  })

  it('removes a bill, and only that one', async () => {
    const a = await saveBill(draft, null, phone)
    await saveBill({ ...draft, name: 'Gym' }, null, phone)
    await removeBill(a, phone)
    expect((await phone.bills.toArray()).map((b) => b.name)).toEqual(['Gym'])
  })

  it('sets one budget for each kind, changes it, and takes it away with null', async () => {
    await setBudget('Groceries', 30000, phone)
    await setBudget('Fuel', 10000, phone)
    await setBudget('Groceries', 32000, phone)
    expect((await phone.budgets.toArray()).map((b) => [b.id, b.kind, b.amount]).sort()).toEqual([['Fuel', 'Fuel', 10000], ['Groceries', 'Groceries', 32000]])
    await setBudget('Fuel', null, phone)
    expect(await phone.budgets.count()).toBe(1)
    await expect(setBudget('Groceries', 0, phone)).rejects.toThrow(/amount/)
  })

  it('is in a backup and restores, and a damaged one is refused', async () => {
    await saveBill({ ...draft, renewal: '2027-02-14', payee: 'streamco' }, null, phone)
    await setBudget('Groceries', 30000, phone)
    const detected = detectFile(JSON.stringify(await createBackup(phone)))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const fresh = openDb(`fresh-${crypto.randomUUID()}`)
    await applyImport(detected.raw, fresh)
    expect(await fresh.bills.toArray()).toEqual(await phone.bills.toArray())
    expect(await fresh.budgets.toArray()).toEqual(await phone.budgets.toArray())
    await fresh.delete()
    const [bill] = await phone.bills.toArray()
    const [budget] = await phone.budgets.toArray()
    expect([isBill(bill), isBill({ ...bill, every: 'fortnight' }), isBill({ ...bill, next: '3 Nov' }), isBill({ ...bill, amount: 1.5 }), isBill({ ...bill, renewal: 'later' }), isBill({ ...bill, payee: '' })]).toEqual([true, false, false, false, false, false])
    expect([isBudget(budget), isBudget({ ...budget, kind: 'Fuel' }), isBudget({ ...budget, amount: 0 })]).toEqual([true, false, false])
  })
})
