// When a review is due and what period it looks back over.
import type { Period } from '../analysis/stats'
import type { Entry } from '../db/types'
import { addDays, addMonths, weekdayName } from '../lib/dates'
import { firstMonthlyWeekday, firstWeekday, type ReviewSchedule } from '../reminders/schedule'

/**
 * The next review date: the first scheduled day after the last review's period, or after logging began.
 * Null when there is nothing to review yet.
 */
export function nextReviewDate(schedule: ReviewSchedule, lastReviewEnd: string | null, firstEntryDate: string | null): string | null {
  const base = lastReviewEnd ?? (firstEntryDate ? addDays(firstEntryDate, -1) : null)
  if (base === null) return null
  const dayAfter = addDays(base, 1)
  switch (schedule.kind) {
    case 'weekly':
      return firstWeekday(dayAfter, schedule.day)
    case 'monthly':
      return firstMonthlyWeekday(dayAfter, schedule.day)
    case 'days':
      return addDays(base, schedule.every)
  }
}

/** "every Sunday", "on the first Sunday of every month", "every 14 days". */
export function describeReviewSchedule(schedule: ReviewSchedule, locale?: string): string {
  switch (schedule.kind) {
    case 'weekly':
      return `every ${weekdayName(schedule.day, locale)}`
    case 'monthly':
      return `on the first ${weekdayName(schedule.day, locale)} of every month`
    case 'days':
      return `every ${schedule.every} days`
  }
}

export function isReviewDue(today: string, next: string | null): boolean {
  return next !== null && today >= next
}

/** Since the last review if there was one; otherwise one schedule-length back (never before logging began). */
export function defaultReviewPeriod(today: string, schedule: ReviewSchedule, lastReviewEnd: string | null, firstEntryDate: string | null): Period {
  if (lastReviewEnd !== null && lastReviewEnd < today) return { start: addDays(lastReviewEnd, 1), end: today }
  const lengthStart =
    schedule.kind === 'monthly' ? addDays(addMonths(today, -1), 1) : addDays(today, -((schedule.kind === 'weekly' ? 7 : schedule.every) - 1))
  const start = firstEntryDate !== null && firstEntryDate > lengthStart ? firstEntryDate : lengthStart
  return { start: start > today ? today : start, end: today }
}

/** Best moment: most energy, then engagement, then flow. Worst: least energy, then engagement. Never the same entry. */
export function pickMoments(entries: readonly Entry[]): { best: Entry | null; worst: Entry | null } {
  if (entries.length === 0) return { best: null, worst: null }
  const best =
    [...entries].sort(
      (a, b) => b.energy - a.energy || b.engagement - a.engagement || Number(b.flow) - Number(a.flow) || b.createdAt - a.createdAt,
    )[0] ?? null
  const worst =
    [...entries]
      .filter((e) => e.id !== best?.id)
      .sort((a, b) => a.energy - b.energy || a.engagement - b.engagement || b.createdAt - a.createdAt)[0] ?? null
  // A "worst" that is just as good as the best isn't a low point.
  const isLower = worst !== null && best !== null && (worst.energy < best.energy || worst.engagement < best.engagement)
  return { best, worst: isLower ? worst : null }
}
