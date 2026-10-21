import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { openDb } from '../../src/db/db'

describe('database upgrade', () => {
  it('keeps everything from a Phase 1 phone and adds the reviews table', async () => {
    const name = `upgrade-${crypto.randomUUID()}`

    // A phone still running Phase 1 (schema version 1, no reviews table).
    const phase1 = new Dexie(name)
    phase1.version(1).stores({
      entries: 'id, date, createdAt, updatedAt',
      days: 'date, updatedAt',
      ikigaiItems: 'id, updatedAt',
      odysseyPlans: 'id, slot, updatedAt',
      settings: 'key',
    })
    await phase1.table('entries').put({ id: 'kept', date: '2026-10-20', activity: 'Choir rehearsal', updatedAt: 1, createdAt: 1 })
    await phase1.table('days').put({ date: '2026-10-20', smallJoy: 'Fresh bread', createdAt: 1, updatedAt: 1 })
    phase1.close()

    // The new app version opens the same database.
    const upgraded = openDb(name)
    expect(await upgraded.entries.get('kept')).toMatchObject({ activity: 'Choir rehearsal' })
    expect(await upgraded.days.get('2026-10-20')).toMatchObject({ smallJoy: 'Fresh bread' })
    expect(await upgraded.reviews.count()).toBe(0)
    expect(upgraded.verno).toBe(2)
    await upgraded.delete()
  })
})
