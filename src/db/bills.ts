import { isDateKey } from '../lib/dates'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import type { Bill } from './types'

// Your bills and budgets (step 4, 2026-11-23): what you say about them, kept as your own records. Nothing here pays, changes or
// cancels anything.

export type BillDraft = Omit<Bill, 'id' | 'createdAt' | 'updatedAt'>

/** Saves a bill: a new one with no id, or the changes to one. Refuses what isn't a bill, saying what is wrong. */
export async function saveBill(draft: BillDraft, id: string | null, database: LifeDesignDB = defaultDb): Promise<string> {
  const name = draft.name.trim()
  if (!name) throw new Error('A bill needs a name.')
  if (!Number.isInteger(draft.amount) || draft.amount <= 0) throw new Error('A bill needs an amount above nothing.')
  if (!isDateKey(draft.next)) throw new Error('A bill needs a day it is paid.')
  if (draft.renewal !== null && !isDateKey(draft.renewal)) throw new Error('The renewal day is not a day.')
  const now = Date.now()
  return guardWrite(() =>
    database.transaction('rw', database.bills, async () => {
      const was = id ? await database.bills.get(id) : undefined
      const bill: Bill = { ...draft, name, notes: draft.notes.trim(), method: draft.method.trim(), id: was?.id ?? crypto.randomUUID(), createdAt: was?.createdAt ?? now, updatedAt: now }
      await database.bills.put(bill)
      return bill.id
    }),
  )
}

/** Takes a bill off your list. */
export async function removeBill(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.bills.delete(id))
}

/** Sets what you set aside each month for a kind of spending, in pence; null takes the budget away. */
export async function setBudget(kind: string, amount: number | null, database: LifeDesignDB = defaultDb): Promise<void> {
  if (amount !== null && (!Number.isInteger(amount) || amount <= 0)) throw new Error('A budget needs an amount above nothing.')
  await guardWrite(() =>
    database.transaction('rw', database.budgets, async () => {
      if (amount === null) return database.budgets.delete(kind)
      const was = await database.budgets.get(kind)
      const now = Date.now()
      await database.budgets.put({ id: kind, kind, amount, createdAt: was?.createdAt ?? now, updatedAt: now })
    }),
  )
}
