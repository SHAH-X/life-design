import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { openDb } from '../../src/db/db'

describe('database upgrade', () => {
  it('keeps everything from a Phase 1 phone and adds the newer tables', async () => {
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
    expect(upgraded.verno).toBe(6)
    await upgraded.delete()
  })

  it('keeps everything from a Phase 2 phone, adds evening answers and gives old reviews an empty "why"', async () => {
    const name = `upgrade-${crypto.randomUUID()}`

    // A phone still running Phase 2 (schema version 2: reviews, no evening answers).
    const phase2 = new Dexie(name)
    phase2.version(1).stores({
      entries: 'id, date, createdAt, updatedAt',
      days: 'date, updatedAt',
      ikigaiItems: 'id, updatedAt',
      odysseyPlans: 'id, slot, updatedAt',
      settings: 'key',
    })
    phase2.version(2).stores({ reviews: 'id, periodEnd, updatedAt' })
    const note = { entryId: null, activities: '', environments: 'Home', interactions: '', objects: '', users: '' }
    await phase2.table('reviews').put({
      id: 'r1',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      balance: { health: 6, work: 5, play: 3, love: 8 },
      best: note,
      worst: { ...note, environments: '' },
      reflection: 'Mornings matter',
      takeaway: 'Protect mornings',
      completedAt: 5,
      createdAt: 1,
      updatedAt: 7,
    })
    await phase2.table('entries').put({ id: 'kept', date: '2026-10-20', activity: 'Choir rehearsal', updatedAt: 1, createdAt: 1 })
    phase2.close()

    const upgraded = openDb(name)
    const review = await upgraded.reviews.get('r1')
    expect(review?.best).toMatchObject({ environments: 'Home', why: '' })
    expect(review?.worst.why).toBe('')
    expect(review?.takeaway).toBe('Protect mornings')
    expect(review?.updatedAt).toBe(7) // an upgrade is not an edit
    expect(await upgraded.entries.get('kept')).toMatchObject({ activity: 'Choir rehearsal' })
    expect(await upgraded.answers.count()).toBe(0)
    expect(upgraded.verno).toBe(6)
    await upgraded.delete()
  })

  it('gives entries and reviews from a Phase 2.5 phone empty feeling words and balance picks, changing nothing else', async () => {
    const name = `upgrade-${crypto.randomUUID()}`
    const phase25 = new Dexie(name)
    phase25.version(1).stores({
      entries: 'id, date, createdAt, updatedAt',
      days: 'date, updatedAt',
      ikigaiItems: 'id, updatedAt',
      odysseyPlans: 'id, slot, updatedAt',
      settings: 'key',
    })
    phase25.version(2).stores({ reviews: 'id, periodEnd, updatedAt' })
    phase25.version(3).stores({ answers: 'id, date, updatedAt' })
    await phase25.table('entries').put({ id: 'e1', date: '2026-10-20', activity: 'Choir rehearsal', energy: 2, engagement: 5, flow: true, updatedAt: 9, createdAt: 1 })
    const note = { entryId: null, activities: '', environments: '', interactions: '', objects: '', users: '', why: '' }
    await phase25.table('reviews').put({
      id: 'r1',
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      balance: { health: 6, work: 5, play: 3, love: 8 },
      best: note,
      worst: note,
      reflection: '',
      takeaway: 'Protect mornings',
      completedAt: 5,
      createdAt: 1,
      updatedAt: 7,
    })
    phase25.close()

    const upgraded = openDb(name)
    expect(await upgraded.entries.get('e1')).toMatchObject({ during: [], after: [], energy: 2, engagement: 5, flow: true, updatedAt: 9 })
    expect(await upgraded.reviews.get('r1')).toMatchObject({
      alive: null,
      neglected: null,
      balanceWhy: '',
      balance: { play: 3 },
      updatedAt: 7,
    })
    expect(upgraded.verno).toBe(6)
    await upgraded.delete()
  })

  it('gives Odyssey Plans from a Phase 2.6 phone their new fields, and adds plan versions and Workview & Lifeview', async () => {
    const name = `upgrade-${crypto.randomUUID()}`
    const phase26 = new Dexie(name)
    phase26.version(1).stores({
      entries: 'id, date, createdAt, updatedAt',
      days: 'date, updatedAt',
      ikigaiItems: 'id, updatedAt',
      odysseyPlans: 'id, slot, updatedAt',
      settings: 'key',
    })
    phase26.version(2).stores({ reviews: 'id, periodEnd, updatedAt' })
    phase26.version(3).stores({ answers: 'id, date, updatedAt' })
    phase26.version(4).stores({})
    await phase26.table('odysseyPlans').bulkPut([
      {
        id: 'plan-1',
        slot: 1,
        title: 'Open a small bakery',
        description: 'Early mornings',
        years: [[], [], [], [], []],
        questions: ['Would I enjoy early starts?'],
        gauges: { resources: 6, likability: 8, confidence: 5, coherence: 7 },
        notes: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    phase26.close()

    const upgraded = openDb(name)
    expect(await upgraded.odysseyPlans.get('plan-1')).toMatchObject({
      title: 'Open a small bakery',
      feelings: [],
      needs: [],
      needsNote: '',
      fit: '',
      writtenAt: 1, // it has content, so it opens as a written plan, not the guided flow
      gauges: { likability: 8 }, // kept, never shown
      updatedAt: 1,
    })
    expect(await upgraded.planVersions.count()).toBe(0)
    expect(await upgraded.views.count()).toBe(0)
    expect(upgraded.verno).toBe(6)
    await upgraded.delete()
  })

  it('gives entries from a Phase 3a phone the purpose-journaling fields, changing nothing else', async () => {
    const name = `upgrade-${crypto.randomUUID()}`
    const phase3a = new Dexie(name)
    phase3a.version(1).stores({
      entries: 'id, date, createdAt, updatedAt',
      days: 'date, updatedAt',
      ikigaiItems: 'id, updatedAt',
      odysseyPlans: 'id, slot, updatedAt',
      settings: 'key',
    })
    phase3a.version(2).stores({ reviews: 'id, periodEnd, updatedAt' })
    phase3a.version(3).stores({ answers: 'id, date, updatedAt' })
    phase3a.version(4).stores({})
    phase3a.version(5).stores({ planVersions: 'id, planId, savedAt, updatedAt', views: 'id, updatedAt' })
    const old = {
      id: 'e1',
      date: '2026-10-20',
      part: 'evening',
      activity: 'Team meeting',
      engagement: 2,
      energy: -1,
      flow: false,
      where: ['Office'],
      people: ['Alex'],
      objects: [],
      during: ['Distracted'],
      after: ['Tired'],
      note: 'Went in circles',
      source: 'evening',
      createdAt: 5,
      updatedAt: 9,
    }
    await phase3a.table('entries').put(old)
    phase3a.close()

    const upgraded = openDb(name)
    expect(upgraded.verno).toBe(6)
    expect(await upgraded.entries.get('e1')).toEqual({
      ...old,
      kind: 'activity',
      purpose: null,
      energyEffect: null,
      duration: null,
      reflections: [],
      intention: null,
      take: '',
      status: 'done',
      skipped: [],
    })
    expect(await upgraded.weeks.count()).toBe(0)
    await upgraded.delete()
  })
})
