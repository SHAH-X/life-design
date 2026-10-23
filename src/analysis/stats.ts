// Patterns in the journal, computed on the phone (no AI). Small numbers mislead, so groups need at
// least MIN_COUNT entries before they are ranked, and every average comes with its count.
import type { BalanceArea, Day, Entry, Measure, Review } from '../db/types'
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

/** Whether an entry answered a question; a skipped one stays out of that measure instead of counting as a guess. */
const answered = (entry: Entry, measure: Measure) => !(entry.skipped ?? []).includes(measure)

export interface GroupStat {
  label: string
  count: number
  avgEnergy: number
  avgEngagement: number
  flow: number
  /** Times it gave energy, and times it took energy (for "usually", "often"…). */
  gave: number
  took: number
  /** The entries behind it, so every pattern can show them. */
  entryIds: string[]
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
    gave: items.filter((e) => e.energy > 0).length,
    took: items.filter((e) => e.energy < 0).length,
    entryIds: items.map((e) => e.id),
  }))
}

export function activityStats(entries: readonly Entry[]): GroupStat[] {
  return group(entries, (e) => [e.activity])
}

/**
 * Alone or with others: shown only when both have 3+ entries, with others first. It describes your entries; it
 * doesn't say company causes anything.
 */
export function aloneOrWithOthers(entries: readonly Entry[]): GroupStat[] | null {
  const groups = group(entries, (e) => [e.people.length ? 'With others' : 'Alone'])
  const together = groups.find((g) => g.label === 'With others')
  const alone = groups.find((g) => g.label === 'Alone')
  return together && alone && together.count >= MIN_COUNT && alone.count >= MIN_COUNT ? [together, alone] : null
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

/** A context's label as a line reads it: "With Alex", "In the morning", "On Mondays"; places as written. */
const CONTEXT_LINE: Record<ContextKey, (label: string) => string> = {
  where: (label) => label,
  people: (label) => `With ${label}`,
  objects: (label) => `Using ${label}`,
  part: (label) => `In the ${label.toLowerCase()}`,
  weekday: (label) => `On ${label}s`,
}

/** How one-sided a group was: the larger of its shares that gave and took energy. */
const lean = (g: GroupStat) => Math.max(g.gave, g.took) / g.count

/**
 * Places, people and times (v0.13), picked for you instead of five switches: contexts with 3+ entries that usually
 * went one way ("usually" or stronger), most one-sided first, then the most entries. A line whose entries are all
 * behind a line already shown says nothing new, so it's left out: `shown` are the entries behind the activity lines
 * above it, and each line picked joins them. It describes your entries; it never says a place causes anything.
 */
export function contextHighlights(entries: readonly Entry[], shown: readonly (readonly string[])[] = [], locale?: string, limit = 4): GroupStat[] {
  const keys: readonly ContextKey[] = ['where', 'people', 'objects', 'part', 'weekday']
  const candidates = [
    ...keys.flatMap((key) => contextStats(entries, key, locale).map((g) => ({ ...g, label: CONTEXT_LINE[key](g.label) }))),
    ...(aloneOrWithOthers(entries) ?? []),
  ]
    .filter((g) => g.count >= MIN_COUNT && lean(g) >= 0.6)
    .sort((a, b) => lean(b) - lean(a) || b.count - a.count)
  const behind: (readonly string[])[] = [...shown]
  const picked: GroupStat[] = []
  for (const g of candidates) {
    if (picked.length >= limit) break
    if (behind.some((ids) => g.entryIds.every((id) => ids.includes(id)))) continue
    picked.push(g)
    behind.push(g.entryIds)
  }
  return picked
}

export interface DayCount {
  date: string
  /** Activities that gave energy, used it up, or made little difference (or a mix); a skipped answer counts in none. */
  gave: number
  used: number
  little: number
  /** Every entry of the day, for the list under the chart. */
  entryIds: string[]
}

/** The week's chart (v0.13): what happened each day, counted, never averaged (two good and two draining things aren't "flat"). */
export function energyByDay(entries: readonly Entry[], period: Period): DayCount[] {
  const within = inPeriod(entries, period)
  return daysInPeriod(period).map((date) => {
    const day = within.filter((e) => e.date === date)
    const measured = day.filter((e) => answered(e, 'energy'))
    return {
      date,
      gave: measured.filter((e) => e.energy > 0).length,
      used: measured.filter((e) => e.energy < 0).length,
      little: measured.filter((e) => e.energy === 0).length,
      entryIds: day.map((e) => e.id),
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

export interface BalanceTally {
  /** Finished reviews counted (the last four). */
  reviews: number
  mostAlive: { area: BalanceArea; count: number } | null
  mostNeglected: { area: BalanceArea; count: number } | null
  /** The latest finished review's picks. */
  latest: { alive: BalanceArea | null; neglected: BalanceArea | null } | null
}

/** Most alive and most neglected: a review's own picks, or for an older 0–10 review its single highest and lowest. */
export function balancePicks(review: Review): { alive: BalanceArea | null; neglected: BalanceArea | null } {
  if (review.alive !== null || review.neglected !== null) return { alive: review.alive, neglected: review.neglected }
  const rated = BALANCE_AREAS.filter((a) => review.balance[a] !== null)
  const only = (pick: (values: number[]) => number) => {
    if (rated.length < 2) return null
    const target = pick(rated.map((a) => review.balance[a] as number))
    const areas = rated.filter((a) => review.balance[a] === target)
    return areas.length === 1 ? (areas[0] as BalanceArea) : null
  }
  return { alive: only((v) => Math.max(...v)), neglected: only((v) => Math.min(...v)) }
}

/** How often each area felt most alive or most neglected over the last four finished reviews. */
export function balanceTally(reviews: readonly Review[], last = 4): BalanceTally {
  const done = reviews
    .filter((r) => r.completedAt !== null)
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd))
    .slice(-last)
    .map(balancePicks)
  const top = (key: 'alive' | 'neglected') => {
    let best: { area: BalanceArea; count: number; lastSeen: number } | null = null
    for (const area of BALANCE_AREAS) {
      const indexes = done.map((p, i) => (p[key] === area ? i : -1)).filter((i) => i >= 0)
      if (indexes.length === 0) continue
      const candidate = { area, count: indexes.length, lastSeen: Math.max(...indexes) }
      if (!best || candidate.count > best.count || (candidate.count === best.count && candidate.lastSeen > best.lastSeen)) best = candidate
    }
    return best ? { area: best.area, count: best.count } : null
  }
  return { reviews: done.length, mostAlive: top('alive'), mostNeglected: top('neglected'), latest: done.at(-1) ?? null }
}

export function todayKey(): string {
  return toDateKey(new Date())
}
