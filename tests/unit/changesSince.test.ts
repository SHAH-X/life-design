import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addDocument } from '../../src/db/documents'
import { saveBill, setBudget } from '../../src/db/bills'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { listProduct } from '../../src/db/products'
import { countChangesSince } from '../../src/db/repo'

// A day of adding documents, bills, budgets or products must not read "no changes" in the backup nudge (v0.57.0: they weren't counted).
describe('changes since the last backup', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })

  it('counts documents, bills, budgets and products you added or changed, and none made before the backup', async () => {
    const before = Date.now()
    await new Promise((r) => setTimeout(r, 5))
    await addDocument({ title: 'Policy', type: 'Insurance', kind: 'pdf', mime: 'application/pdf', size: 3, pages: 1, text: '', data: btoa('abc') }, phone)
    await saveBill({ name: 'Streaming', kind: '', amount: 1099, every: 'month', next: '2026-11-03', renewal: null, method: '', notes: '', payee: null }, null, phone)
    await setBudget('Groceries', 30000, phone)
    await listProduct({ id: 'tesco|milk', members: ['tesco|milk'] }, true, phone)
    expect(await countChangesSince(null, phone)).toBe(4)
    expect(await countChangesSince(before, phone)).toBe(4)
    expect(await countChangesSince(Date.now() + 1000, phone)).toBe(0)
  })
})
