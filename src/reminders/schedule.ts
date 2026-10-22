// The reminders a person can put in their calendar, with one shared date range, turned into
// repeating iCalendar events. Times are floating local times; end dates are local too (RFC 5545).
import { addMonths, formatClockTime, formatDateKey, fromDateKey, isDateKey, toDateKey, weekdayName } from '../lib/dates'
import { buildIcs, DAILY_TIMES, type IcsEvent } from './ics'

/** JavaScript day numbers: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type ReviewSchedule = { kind: 'weekly'; day: Weekday } | { kind: 'monthly'; day: Weekday } | { kind: 'days'; every: number }

export type BackupSchedule = { kind: 'weekly'; day: Weekday } | { kind: 'monthly'; day: Weekday }

export type ReminderKind = 'daily' | 'review' | 'backup' | 'quarterly'

export interface ReminderPlan {
  /** First day reminders can fall on (YYYY-MM-DD). */
  from: string
  /** Last day (inclusive), or null for no end date. */
  to: string | null
  daily: { on: boolean; time: string }
  review: { on: boolean; time: string }
  backup: { on: boolean; time: string; schedule: BackupSchedule }
  quarterly: { on: boolean; time: string; day: Weekday }
}

export interface PlannedReminder {
  kind: ReminderKind
  title: string
  /** Plain words, e.g. "Every Sunday at 6:00 pm". */
  when: string
  /** Steps for setting the same reminder up by hand in the Reminders app. */
  remindersApp: string
  /** Null when no occurrence falls inside the date range. */
  event: IcsEvent | null
}

export const REVIEW_EVERY_MIN = 2
export const REVIEW_EVERY_MAX = 90
export const DEFAULT_REVIEW_SCHEDULE: ReviewSchedule = { kind: 'weekly', day: 0 }
export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0] // Monday first in pickers

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

export function defaultReminderPlan(today: string): ReminderPlan {
  return {
    from: today,
    to: addMonths(today, 12),
    daily: { on: true, time: '21:00' },
    review: { on: true, time: '18:00' },
    backup: { on: true, time: '18:30', schedule: { kind: 'weekly', day: 0 } },
    quarterly: { on: true, time: '10:00', day: 0 },
  }
}

/** The first given weekday on or after `from`. */
export function firstWeekday(from: string, day: number): string {
  const d = fromDateKey(from)
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7))
  return toDateKey(d)
}

/** The first "first <weekday> of a month" on or after `from` (this month's, or else next month's). */
export function firstMonthlyWeekday(from: string, day: number): string {
  const start = fromDateKey(from)
  let key = from
  for (let i = 0; i < 2; i += 1) {
    const first = new Date(start.getFullYear(), start.getMonth() + i, 1, 12)
    key = toDateKey(new Date(first.getFullYear(), first.getMonth(), 1 + ((day - first.getDay() + 7) % 7), 12))
    if (key >= from) break
  }
  return key
}

interface Rule {
  rrule: string
  firstDate: string
  when: string
  repeat: string // how to set the same repeat in the Reminders app
}

function weeklyRule(from: string, day: Weekday, time: string, locale?: string): Rule {
  const name = weekdayName(day, locale)
  return {
    rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[day]}`,
    firstDate: firstWeekday(from, day),
    when: `Every ${name} at ${formatClockTime(time, locale)}`,
    repeat: 'Repeat: Weekly',
  }
}

function monthlyRule(from: string, day: Weekday, time: string, locale?: string, every = 1): Rule {
  const name = weekdayName(day, locale)
  return {
    rrule: `FREQ=MONTHLY;${every > 1 ? `INTERVAL=${every};` : ''}BYDAY=1${BYDAY[day]}`,
    firstDate: firstMonthlyWeekday(from, day),
    when:
      every > 1
        ? `Every ${every} months on the first ${name} at ${formatClockTime(time, locale)}`
        : `First ${name} of every month at ${formatClockTime(time, locale)}`,
    repeat:
      every > 1
        ? `Repeat: Custom → Monthly, every ${every} months → On the first ${name}`
        : `Repeat: Custom → Monthly → On the first ${name}`,
  }
}

function everyDaysRule(from: string, every: number, time: string, locale?: string): Rule {
  return every === 1
    ? { rrule: 'FREQ=DAILY', firstDate: from, when: `Every day at ${formatClockTime(time, locale)}`, repeat: 'Repeat: Daily' }
    : {
        rrule: `FREQ=DAILY;INTERVAL=${every}`,
        firstDate: from,
        when: `Every ${every} days at ${formatClockTime(time, locale)}`,
        repeat: `Repeat: Custom → Daily, every ${every} days`,
      }
}

const DETAILS: Record<ReminderKind, { title: string; name: string; summary: string; description: string; screen: string; alarm: string }> = {
  daily: {
    title: 'Daily log',
    name: 'Log my day',
    summary: 'Life Design: log your day',
    description:
      'A minute or two: what you did, how it felt, and what it did to your energy. Open Life Design from your Home Screen.',
    screen: 'today',
    alarm: 'Time to log your day in Life Design',
  },
  review: {
    title: 'Look back',
    name: 'Life Design: look back',
    summary: 'Life Design: your week',
    description:
      'Your week, put together for you in Insights: what gave you energy, what took it, and your next steps. Open Life Design from your Home Screen.',
    screen: 'insights',
    alarm: 'Time to look back at your week',
  },
  backup: {
    title: 'Backup',
    name: 'Back up Life Design',
    summary: 'Life Design: back up',
    description: 'In Life Design: More → Back up now, then save or send the file.',
    screen: 'more',
    alarm: 'Time to back up Life Design',
  },
  quarterly: {
    title: 'Quarterly check-in',
    name: 'Life Design check-in',
    summary: 'Life Design: quarterly check-in',
    description: 'Look back over three months in Insights: what keeps giving you energy, and what you want more of.',
    screen: 'insights',
    alarm: 'Time for your quarterly Life Design check-in',
  },
}

export function planReminders(plan: ReminderPlan, review: ReviewSchedule, appUrl: string, locale?: string): PlannedReminder[] {
  const planned: PlannedReminder[] = []

  const add = (kind: ReminderKind, time: string, rule: Rule) => {
    const d = DETAILS[kind]
    const inRange = plan.to === null || rule.firstDate <= plan.to
    const until = plan.to ? `;UNTIL=${plan.to.replaceAll('-', '')}T235959` : ''
    const end = plan.to ? `End Repeat: ${formatDateKey(plan.to, locale)}` : 'End Repeat: Never'
    planned.push({
      kind,
      title: d.title,
      when: rule.when,
      remindersApp: `“${d.name}”: Date ${formatDateKey(rule.firstDate, locale)}, Time ${formatClockTime(time, locale)}, ${rule.repeat}, ${end}.`,
      event: inRange
        ? {
            uid: `life-design-${kind}-${rule.firstDate}-${time.replace(':', '')}@shah-x.github.io`,
            summary: d.summary,
            description: d.description,
            url: `${appUrl}#/${d.screen}`,
            startDate: rule.firstDate,
            startTime: time,
            durationMinutes: 10,
            rrule: `${rule.rrule}${until}`,
            alarm: d.alarm,
          }
        : null,
    })
  }

  if (plan.daily.on) add('daily', plan.daily.time, everyDaysRule(plan.from, 1, plan.daily.time, locale))
  if (plan.review.on) {
    const t = plan.review.time
    add(
      'review',
      t,
      review.kind === 'weekly'
        ? weeklyRule(plan.from, review.day, t, locale)
        : review.kind === 'monthly'
          ? monthlyRule(plan.from, review.day, t, locale)
          : everyDaysRule(plan.from, review.every, t, locale),
    )
  }
  if (plan.backup.on) {
    const { time, schedule } = plan.backup
    add(
      'backup',
      time,
      schedule.kind === 'weekly' ? weeklyRule(plan.from, schedule.day, time, locale) : monthlyRule(plan.from, schedule.day, time, locale),
    )
  }
  if (plan.quarterly.on) add('quarterly', plan.quarterly.time, monthlyRule(plan.from, plan.quarterly.day, plan.quarterly.time, locale, 3))

  return planned
}

export function remindersIcs(planned: readonly PlannedReminder[], stamp: Date): string {
  return buildIcs(
    planned.flatMap((p) => (p.event ? [p.event] : [])),
    stamp,
  )
}

export const REMINDERS_FILE_NAME = 'life-design-reminders.ics'

// ---- Checking stored settings (they may come from an older version or a backup file) ----

type Rec = Record<string, unknown>
const asRec = (x: unknown): Rec => (typeof x === 'object' && x !== null ? (x as Rec) : {})
const isTime = (x: unknown): x is string => typeof x === 'string' && DAILY_TIMES.includes(x)
const isWeekday = (x: unknown): x is Weekday => Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 6
const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback)

export function normalizeReviewSchedule(raw: unknown): ReviewSchedule {
  const r = asRec(raw)
  if ((r.kind === 'weekly' || r.kind === 'monthly') && isWeekday(r.day)) return { kind: r.kind, day: r.day }
  if (r.kind === 'days' && Number.isInteger(r.every) && (r.every as number) >= REVIEW_EVERY_MIN && (r.every as number) <= REVIEW_EVERY_MAX) {
    return { kind: 'days', every: r.every as number }
  }
  return DEFAULT_REVIEW_SCHEDULE
}

function normalizeBackupSchedule(raw: unknown, fallback: BackupSchedule): BackupSchedule {
  const r = asRec(raw)
  return (r.kind === 'weekly' || r.kind === 'monthly') && isWeekday(r.day) ? { kind: r.kind, day: r.day } : fallback
}

export function normalizeReminderPlan(raw: unknown, today: string): ReminderPlan {
  const d = defaultReminderPlan(today)
  if (typeof raw !== 'object' || raw === null) return d
  const r = raw as Rec
  const from = isDateKey(r.from) ? r.from : d.from
  const to = r.to === null ? null : isDateKey(r.to) && r.to >= from ? r.to : addMonths(from, 12)
  const daily = asRec(r.daily)
  const review = asRec(r.review)
  const backup = asRec(r.backup)
  const quarterly = asRec(r.quarterly)
  return {
    from,
    to,
    daily: { on: bool(daily.on, d.daily.on), time: isTime(daily.time) ? daily.time : d.daily.time },
    review: { on: bool(review.on, d.review.on), time: isTime(review.time) ? review.time : d.review.time },
    backup: {
      on: bool(backup.on, d.backup.on),
      time: isTime(backup.time) ? backup.time : d.backup.time,
      schedule: normalizeBackupSchedule(backup.schedule, d.backup.schedule),
    },
    quarterly: {
      on: bool(quarterly.on, d.quarterly.on),
      time: isTime(quarterly.time) ? quarterly.time : d.quarterly.time,
      day: isWeekday(quarterly.day) ? quarterly.day : d.quarterly.day,
    },
  }
}
