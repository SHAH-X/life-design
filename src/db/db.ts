import Dexie, { type EntityTable } from 'dexie'
import type { Answer, Day, Entry, IkigaiItem, OdysseyPlan, Review, Setting } from './types'

export type LifeDesignDB = Dexie & {
  entries: EntityTable<Entry, 'id'>
  days: EntityTable<Day, 'date'>
  answers: EntityTable<Answer, 'id'>
  ikigaiItems: EntityTable<IkigaiItem, 'id'>
  odysseyPlans: EntityTable<OdysseyPlan, 'id'>
  reviews: EntityTable<Review, 'id'>
  settings: EntityTable<Setting, 'key'>
}

export const DB_NAME = 'life-design'

export function openDb(name = DB_NAME): LifeDesignDB {
  const database = new Dexie(name) as LifeDesignDB
  database.version(1).stores({
    entries: 'id, date, createdAt, updatedAt',
    days: 'date, updatedAt',
    ikigaiItems: 'id, updatedAt',
    odysseyPlans: 'id, slot, updatedAt',
    settings: 'key',
  })
  // v0.3 (Phase 2): reviews. Existing tables and data carry over unchanged.
  database.version(2).stores({
    reviews: 'id, periodEnd, updatedAt',
  })
  // v0.4 (Phase 2.5): evening answers; each review moment gains a "why". Not an edit, so updatedAt stays.
  database
    .version(3)
    .stores({
      answers: 'id, date, updatedAt',
    })
    .upgrade((tx) =>
      tx
        .table('reviews')
        .toCollection()
        .modify((review: { best?: { why?: unknown }; worst?: { why?: unknown } }) => {
          for (const note of [review.best, review.worst]) if (note && typeof note.why !== 'string') note.why = ''
        }),
    )
  return database
}

/** The app's single on-device database. */
export const db = openDb()
