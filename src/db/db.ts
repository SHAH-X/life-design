import Dexie, { type EntityTable } from 'dexie'
import type { Answer, Day, Entry, IkigaiItem, OdysseyPlan, PlanVersion, Review, Setting, Views } from './types'

export type LifeDesignDB = Dexie & {
  entries: EntityTable<Entry, 'id'>
  days: EntityTable<Day, 'date'>
  answers: EntityTable<Answer, 'id'>
  ikigaiItems: EntityTable<IkigaiItem, 'id'>
  odysseyPlans: EntityTable<OdysseyPlan, 'id'>
  planVersions: EntityTable<PlanVersion, 'id'>
  views: EntityTable<Views, 'id'>
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
  // v0.5 (Phase 2.6): feeling words on entries, and most alive / most neglected on reviews. Not edits, so updatedAt stays.
  database
    .version(4)
    .stores({})
    .upgrade(async (tx) => {
      await tx
        .table('entries')
        .toCollection()
        .modify((entry: { during?: unknown; after?: unknown }) => {
          if (!Array.isArray(entry.during)) entry.during = []
          if (!Array.isArray(entry.after)) entry.after = []
        })
      await tx
        .table('reviews')
        .toCollection()
        .modify((review: { alive?: unknown; neglected?: unknown; balanceWhy?: unknown }) => {
          if (review.alive === undefined) review.alive = null
          if (review.neglected === undefined) review.neglected = null
          if (typeof review.balanceWhy !== 'string') review.balanceWhy = ''
        })
    })
  // v0.6 (Phase 3a): earlier versions of Odyssey Plans, and Workview & Lifeview. Plans gain word answers in place of
  // gauges; a plan with content counts as written, so it opens as a page, not the guided flow. Not edits: updatedAt stays.
  database
    .version(5)
    .stores({
      planVersions: 'id, planId, savedAt, updatedAt',
      views: 'id, updatedAt',
    })
    .upgrade((tx) =>
      tx
        .table('odysseyPlans')
        .toCollection()
        .modify((plan: Record<string, unknown>) => {
          if (!Array.isArray(plan.feelings)) plan.feelings = []
          if (!Array.isArray(plan.needs)) plan.needs = []
          if (typeof plan.needsNote !== 'string') plan.needsNote = ''
          if (typeof plan.fit !== 'string') plan.fit = ''
          if (plan.writtenAt === undefined) plan.writtenAt = plan.title || plan.description ? plan.updatedAt : null
        }),
    )
  return database
}

/** The app's single on-device database. */
export const db = openDb()
