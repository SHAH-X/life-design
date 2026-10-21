// Patterns in the journal, computed on the phone (no AI). Small numbers mislead, so groups need at
// least MIN_COUNT entries before they are ranked, and every average comes with its count.
import type { Balance, BalanceArea, Day, Entry, Review } from '../db/types'
import { BALANCE_AREAS } from '../db/types'
import { addDays, DAY_PARTS, fromDateKey, toDateKey, weekdayName } from '../lib/dates'

export interface Period {
  /** Inclusive YYYY-MM-DD dates. */
  start: string
  end: string
}

export const MIN_COUNT = 3

export function inPeriod<T extends { date: string }>(items: readonly T[], period: Period): T[] {
  return items.filter((item) => item.date >= period.start && item.date <= period.end)
}

export function daysInPeriod(period: Period): string[] {
  const days: string[] = []
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) days.push(d)
  return days
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : null)

export interface Overview {
  entries: number
  daysLogged: number
  days: number
  avgEnergy: number | null
  avgEngagement: number | null
  flow: number
}

export function overview(entries: readonly Entry[], period: Period): Overview {
  const within = inPeriod(entries, period)
  return {
    entries: within.length,
    daysLogged: new Set(within.map((e) => e.date)).size,
    days: daysInPeriod(period).length,
    avgEnergy: mean(within.map((e) => e.energy)),
    avgEngagement: mean(within.map((e) => e.engagement)),
    flow: within.filter((e) => e.flow).length,
  }
}

export interface GroupStat {
  label: string
  count: number
  avgEnergy: number
  avgEngagement: number
  flow: number
}

/** Groups entries by one or more labels each (case-insensitive); the label shown is the most recent spelling. */
function group(entries: readonly Entry[], labelsOf: (e: Entry) => string[]): GroupStat[] {
  const groups = new Map<string, { label: string; latest: number; items: Entry[] }>()
  for (const entry of entries) {
    for (const label of labelsOf(entry)) {
      const key = label.trim().toLowerCase()
      if (!key) continue
      const found = groups.get(key)
      if (!found) groups.set(key, { label, latest: entry.updatedAt, items: [entry] })
      else {
        found.items.push(entry)
        if (entry.updatedAt > found.latest) {
          found.latest = entry.updatedAt
          found.label = label
        }
      }
    }
  }
  return [...groups.values()].map(({ label, items }) => ({
    label,
    count: items.length,
    avgEnergy: mean(items.map((e) => e.energy)) ?? 0,
    avgEngagement: mean(items.map((e) => e.engagement)) ?? 0,
    flow: items.filter((e) => e.flow).length,
  }))
}

export function activityStats(entries: readonly Entry[]): GroupStat[] {
  return group(entries, (e) => [e.activity])
}

/** Activities that reliably give energy: logged 3+ times, average energy above zero, best first. */
export function energisers(entries: readonly Entry[], limit = 5): GroupStat[] {
  return activityStats(entries)
    .filter((g) => g.count >= MIN_COUNT && g.avgEnergy > 0)
    .sort((a, b) => b.avgEnergy - a.avgEnergy || b.count - a.count)
    .slice(0, limit)
}

/** Activities that reliably drain: logged 3+ times, average energy below zero, most draining first. */
export function drainers(entries: readonly Entry[], limit = 5): GroupStat[] {
  return activityStats(entries)
    .filter((g) => g.count >= MIN_COUNT && g.avgEnergy < 0)
    .sort((a, b) => a.avgEnergy - b.avgEnergy || b.count - a.count)
    .slice(0, limit)
}

/** Where flow happens: activities with flow moments, most first. */
export function flowFinder(entries: readonly Entry[], limit = 5): GroupStat[] {
  return activityStats(entries)
    .filter((g) => g.flow > 0)
    .sort((a, b) => b.flow - a.flow || b.flow / b.count - a.flow / a.count)
    .slice(0, limit)
}

export interface MomentGroup {
  /** The activity's strongest moment in this direction. */
  entry: Entry
  count: number
}

/**
 * High or low points for a review, one line per activity: each activity is represented by its strongest
 * moment, ranked by that moment's energy, then engagement, then by how often it happened.
 */
export function momentGroups(entries: readonly Entry[], direction: 'high' | 'low', limit = 3): MomentGroup[] {
  const sign = direction === 'high' ? 1 : -1
  const stronger = (a: Entry, b: Entry) =>
    sign * (b.energy - a.energy) || sign * (b.engagement - a.engagement) || Number(b.flow) - Number(a.flow) || b.createdAt - a.createdAt
  const groups = new Map<string, MomentGroup>()
  for (const entry of entries) {
    if (sign * entry.energy <= 0) continue
    const key = entry.activity.trim().toLowerCase()
    const group = groups.get(key)
    if (!group) groups.set(key, { entry, count: 1 })
    else {
      group.count += 1
      if (stronger(entry, group.entry) < 0) group.entry = entry
    }
  }
  // Rank activities by peak energy, then peak engagement, then how often; recency only picks each group's entry.
  return [...groups.values()]
    .sort(
      (a, b) =>
        sign * (b.entry.energy - a.entry.energy) || sign * (b.entry.engagement - a.entry.engagement) || b.count - a.count || stronger(a.entry, b.entry),
    )
    .slice(0, limit)
}

export type ContextKey = 'where' | 'people' | 'objects' | 'part' | 'weekday'

export const CONTEXT_LABELS: Record<ContextKey, string> = {
  where: 'Where',
  people: 'With whom',
  objects: 'Using',
  part: 'Time of day',
  weekday: 'Day of the week',
}

/** Average energy per place, person, object, part of day or weekday (groups with 3+ entries), best first. */
export function contextStats(entries: readonly Entry[], key: ContextKey, locale?: string): GroupStat[] {
  const labelsOf = (e: Entry): string[] => {
    switch (key) {
      case 'where':
        return e.where
      case 'people':
        return e.people
      case 'objects':
        return e.objects
      case 'part':
        return [DAY_PARTS.find((p) => p.value === e.part)?.label ?? e.part]
      case 'weekday':
        return [weekdayName(fromDateKey(e.date).getDay(), locale)]
    }
  }
  return group(entries, labelsOf)
    .filter((g) => g.count >= MIN_COUNT)
    .sort((a, b) => b.avgEnergy - a.avgEnergy || b.count - a.count)
}

export interface SeriesPoint {
  start: string
  end: string
  count: number
  avgEnergy: number | null
  avgEngagement: number | null
}

/** One point per day, or per week (Monday start) when the period is longer than 45 days. */
export function energySeries(entries: readonly Entry[], period: Period): SeriesPoint[] {
  const within = inPeriod(entries, period)
  const days = daysInPeriod(period)
  const weekly = days.length > 45
  const buckets: { start: string; end: string }[] = []
  if (!weekly) for (const d of days) buckets.push({ start: d, end: d })
  else {
    let start = period.start
    while (start <= period.end) {
      const dow = fromDateKey(start).getDay() // 0 = Sunday
      const end = addDays(start, (7 - dow) % 7) // up to Sunday
      buckets.push({ start, end: end > period.end ? period.end : end })
      start = addDays(end, 1)
    }
  }
  return buckets.map(({ start, end }) => {
    const items = within.filter((e) => e.date >= start && e.date <= end)
    return {
      start,
      end,
      count: items.length,
      avgEnergy: mean(items.map((e) => e.energy)),
      avgEngagement: mean(items.map((e) => e.engagement)),
    }
  })
}

const STOPWORDS = new Set(
  'the and with for was were that this from have had has are but not you your our their them they his her she him its into onto over under very just really some any all got get went made make today day time then than when what who how out off about after before again also more most much too'.split(
    ' ',
  ),
)

/** Words that keep coming back in your small joys (3+ letters, common words left out, said at least twice). */
export function joyWords(days: readonly Day[], limit = 8): { word: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const day of days) {
    const seen = new Set<string>()
    for (const match of day.smallJoy.toLowerCase().matchAll(/\p{L}[\p{L}'’-]*/gu)) {
      const word = match[0].replace(/['’-]+$/, '')
      if (word.length < 3 || STOPWORDS.has(word) || seen.has(word)) continue
      seen.add(word) // count each word once per day
      counts.set(word, (counts.get(word) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }))
}

export interface BalanceSummary {
  latest: { periodEnd: string; balance: Balance } | null
  previous: { periodEnd: string; balance: Balance } | null
  /** The area with the lowest average over the last four completed reviews. */
  lowest: { area: BalanceArea; avg: number } | null
  history: { periodEnd: string; balance: Balance }[]
}

export function balanceSummary(reviews: readonly Review[]): BalanceSummary {
  const done = reviews
    .filter((r) => r.completedAt !== null && BALANCE_AREAS.some((a) => r.balance[a] !== null))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .map((r) => ({ periodEnd: r.periodEnd, balance: r.balance }))
  const recent = done.slice(-4)
  let lowest: BalanceSummary['lowest'] = null
  for (const area of BALANCE_AREAS) {
    const avg = mean(recent.flatMap((r) => (r.balance[area] === null ? [] : [r.balance[area] as number])))
    if (avg !== null && (lowest === null || avg < lowest.avg)) lowest = { area, avg }
  }
  return { latest: done.at(-1) ?? null, previous: done.at(-2) ?? null, lowest, history: done }
}

/** "+1.4", "−0.5", "0.0" (true minus sign, one decimal). */
export function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) return '0.0'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}
