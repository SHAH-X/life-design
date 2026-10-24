// Everything that happens "on a day" is keyed by the phone's local calendar date (YYYY-MM-DD), never UTC.

export type DayPart = 'morning' | 'afternoon' | 'evening'

export const DAY_PARTS: readonly { value: DayPart; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
]

export const PART_ORDER: Record<DayPart, number> = { morning: 0, afternoon: 1, evening: 2 }

export const DAY_MS = 86_400_000

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Local Date at noon for a YYYY-MM-DD key (noon keeps day arithmetic clear of daylight-saving jumps). */
export function fromDateKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDateKey(fromDateKey(value)) === value
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** Same day-of-month, n months later (clamped to the month's last day: 31 Jan + 1 month = 28 Feb). */
export function addMonths(key: string, months: number): string {
  const d = fromDateKey(key)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toDateKey(d)
}

/** "21 Oct 2026" for a YYYY-MM-DD key. */
export function formatDateKey(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "15–21 Oct 2026", "28 Sep – 4 Oct 2026" (in the phone's own style). */
export function formatPeriod(start: string, end: string, locale?: string): string {
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return start === end ? format.format(fromDateKey(start)) : format.formatRange(fromDateKey(start), fromDateKey(end))
}

/** "12 Oct" for weekly chart axes. */
export function dayMonth(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

/** When an entry was written: "21:14" in the phone's own format, with the day ("Fri 09:02") if that was another day. */
export function loggedAt(createdAt: number, date: string, locale?: string): string {
  const at = new Date(createdAt)
  const time = at.toLocaleTimeString(locale, { timeStyle: 'short' })
  return toDateKey(at) === date ? time : `${at.toLocaleDateString(locale, { weekday: 'short' })} ${time}`
}

/** "Mon 19 Oct": an entry's day, on a row away from its day's heading (Logs, "Also about this"). */
export function shortDayMonth(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Tue", for the week's chart axis. */
export function shortWeekday(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { weekday: 'short' })
}

/** "Tue 20" for chart axes and readouts. */
export function shortDay(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { weekday: 'short', day: 'numeric' })
}

/** Weekday name for JavaScript's day number (0 = Sunday). 4 Jan 2026 was a Sunday. */
export function weekdayName(day: number, locale?: string): string {
  return new Date(2026, 0, 4 + day, 12).toLocaleDateString(locale, { weekday: 'long' })
}

export function partOfDay(d: Date): DayPart {
  const hour = d.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  return 'evening'
}

export function wholeDaysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS)
}

/** Days since 1 Jan 1970 for a YYYY-MM-DD key: one step per calendar date, whatever the clocks do. */
export function dayNumber(key: string): number {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** "Today", "Yesterday", otherwise the weekday ("Sunday"). */
export function dayHeading(key: string, today: string, locale?: string): string {
  if (key === today) return 'Today'
  if (key === addDays(today, -1)) return 'Yesterday'
  return fromDateKey(key).toLocaleDateString(locale, { weekday: 'long' })
}

/** "Tuesday 21 October" (order follows the phone's locale). */
/** "22 October": for under a heading that already names the day ("Today", "Monday"). */
export function dayMonthLong(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
}

/** "18–22 Oct": a recent period, where the year goes without saying. */
export function formatRecentPeriod(start: string, end: string, locale?: string): string {
  const format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  return start === end ? format.format(fromDateKey(start)) : format.formatRange(fromDateKey(start), fromDateKey(end))
}

export function longDate(key: string, locale?: string): string {
  return fromDateKey(key).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** "21 Oct 2026" */
export function shortDate(ms: number, locale?: string): string {
  return new Date(ms).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** "21:00" → "9:00 pm" or "21:00", following the phone's settings. */
export function formatClockTime(hhmm: string, locale?: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}
