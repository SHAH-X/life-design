import { useLiveQuery } from 'dexie-react-hooks'
import type { Period } from '../analysis/stats'
import { db } from '../db/db'
import { getSetting } from '../db/repo'
import type { Review } from '../db/types'
import { toDateKey } from '../lib/dates'
import { normalizeReviewSchedule, type ReviewSchedule } from '../reminders/schedule'
import { defaultReviewPeriod, isReviewDue, nextReviewDate } from './period'

export interface ReviewStatus {
  schedule: ReviewSchedule
  /** Completed reviews, newest period first. */
  completed: Review[]
  draft: Review | null
  firstEntryDate: string | null
  next: string | null
  due: boolean
  defaultPeriod: Period
}

/** Everything the Review tab and the Today notice need; undefined while loading. */
export function useReviewStatus(): ReviewStatus | undefined {
  return useLiveQuery(async () => {
    const [reviews, scheduleRaw, first] = await Promise.all([
      db.reviews.toArray(),
      getSetting<unknown>('reviewSchedule', null),
      db.entries.orderBy('date').first(),
    ])
    const schedule = normalizeReviewSchedule(scheduleRaw)
    const completed = reviews.filter((r) => r.completedAt !== null).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
    const draft = reviews.filter((r) => r.completedAt === null).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    const firstEntryDate = first?.date ?? null
    const lastEnd = completed[0]?.periodEnd ?? null
    const today = toDateKey(new Date())
    const next = nextReviewDate(schedule, lastEnd, firstEntryDate)
    return {
      schedule,
      completed,
      draft,
      firstEntryDate,
      next,
      due: draft === null && isReviewDue(today, next),
      defaultPeriod: defaultReviewPeriod(today, schedule, lastEnd, firstEntryDate),
    }
  }, [])
}
