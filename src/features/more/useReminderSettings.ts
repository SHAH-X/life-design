import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from '../../db/repo'
import { toDateKey } from '../../lib/dates'
import { DAILY_TIMES } from '../../reminders/ics'
import { normalizeReminderPlan, normalizeReviewSchedule, type ReminderPlan, type ReviewSchedule } from '../../reminders/schedule'

export interface ReminderSettings {
  plan: ReminderPlan
  review: ReviewSchedule
  sentAt: number | null
}

/** Reminder settings, checked and filled with defaults; undefined while loading. */
export function useReminderSettings(): ReminderSettings | undefined {
  return useLiveQuery(async () => {
    const [stored, review, sentAt, oldDailyTime] = await Promise.all([
      getSetting<unknown>('reminders', null),
      getSetting<unknown>('reviewSchedule', null),
      getSetting<number | null>('remindersSentAt', null),
      getSetting<unknown>('reminderDailyTime', null), // from v0.2: the single daily reminder
    ])
    const plan = normalizeReminderPlan(stored, toDateKey(new Date()))
    if (stored === null && typeof oldDailyTime === 'string' && DAILY_TIMES.includes(oldDailyTime)) plan.daily.time = oldDailyTime
    return { plan, review: normalizeReviewSchedule(review), sentAt }
  }, [])
}
