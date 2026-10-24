import Dexie, { type EntityTable } from 'dexie'
import { stepsFromIntentions } from '../domain/steps'
import {
  type AiReview,
  type Answer,
  type AreaCentre,
  type Day,
  type Entry,
  entryDefaults,
  type IkigaiItem,
  type MeaningVector,
  type OdysseyPlan,
  type PlanVersion,
  type Review,
  type Setting,
  type Step,
  type Views,
  type Week,
} from './types'

export type LifeDesignDB = Dexie & {
  entries: EntityTable<Entry, 'id'>
  days: EntityTable<Day, 'date'>
  answers: EntityTable<Answer, 'id'>
  ikigaiItems: EntityTable<IkigaiItem, 'id'>
  odysseyPlans: EntityTable<OdysseyPlan, 'id'>
  planVersions: EntityTable<PlanVersion, 'id'>
  views: EntityTable<Views, 'id'>
  weeks: EntityTable<Week, 'id'>
  steps: EntityTable<Step, 'id'>
  aiReviews: EntityTable<AiReview, 'id'>
  reviews: EntityTable<Review, 'id'>
  settings: EntityTable<Setting, 'key'>
  vectors: EntityTable<MeaningVector, 'id'>
  areaCentres: EntityTable<AreaCentre, 'id'>
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
  // v0.8 (Phase 4, purpose journaling): entries gain a purpose, reflections, a next step, free writing and drafts;
  // weekly notes get a table. Existing entries are activities, done, with nothing skipped. Not edits: updatedAt stays.
  database
    .version(6)
    .stores({
      weeks: 'id, updatedAt',
    })
    .upgrade((tx) =>
      tx
        .table('entries')
        .toCollection()
        .modify((entry: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(entryDefaults())) if (entry[key] === undefined) entry[key] = value
        }),
    )
  // v0.11: next steps get their own list, to manage in Insights. Those kept on entries move there (done, let go and
  // open as they were); "Remember this" stays on the entry. Not edits: updatedAt stays.
  database
    .version(7)
    .stores({
      steps: 'id, status, updatedAt',
    })
    .upgrade(async (tx) => {
      const steps = stepsFromIntentions(await tx.table('entries').toArray())
      if (steps.length > 0) await tx.table('steps').bulkPut(steps)
      const moved = new Set(steps.flatMap((s) => s.entryIds))
      await tx
        .table('entries')
        .toCollection()
        .modify((entry: Record<string, unknown>) => {
          if (moved.has(entry.id as string)) entry.intention = null
        })
    })
  // v0.12 (Phase 5): reviews of a period by AI, kept to read again. A new, empty table: nothing else changes.
  database.version(8).stores({
    aiReviews: 'id, start, createdAt, updatedAt',
  })
  // v0.14: search by meaning. Each finished entry's meaning as numbers, worked out on the phone: derived, so never in a
  // backup and filled in when search is first used. A new, empty table: nothing else changes.
  database.version(9).stores({
    vectors: 'id, entryId',
  })
  // v0.16: life areas. Each area's centre, worked out from the app's own examples: derived, so never in a backup. A
  // new, empty table: nothing else changes.
  database.version(10).stores({
    areaCentres: 'id',
  })
  return database
}

/** The app's single on-device database. */
export const db = openDb()
