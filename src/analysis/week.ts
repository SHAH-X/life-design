// The weekly review, put together automatically from finished entries (nothing to fill in). Every line keeps the
// entries behind it, so nothing is claimed that can't be shown. Weeks run Monday to Sunday.
import type { Entry, Step } from '../db/types'
import { addDays, fromDateKey } from '../lib/dates'
import { activityStats } from './stats'

/** How often something must happen in a week before the review mentions it. */
export const WEEK_MIN = 2
const STANDOUT_MAX = 3
const FEELINGS_MAX = 3

/** The Monday of the week a date falls in. */
export function weekStart(date: string): string {
  const fromMonday = (fromDateKey(date).getDay() + 6) % 7
  return addDays(date, -fromMonday)
}

const isDone = (e: Entry) => e.status !== 'draft'

/** Weeks with finished entries, newest first (each as its Monday). */
export function weeksWithEntries(entries: readonly Entry[]): string[] {
  return [...new Set(entries.filter(isDone).map((e) => weekStart(e.date)))].sort().reverse()
}

/** An activity that went one way this week: `count` of its `of` entries. */
export interface WeekLine {
  label: string
  count: number
  of: number
  entryIds: string[]
}

export interface WeekSummary {
  start: string
  end: string
  entries: number
  days: number
  gave: WeekLine[]
  used: WeekLine[]
  feelings: { word: string; count: number; entryIds: string[] }[]
  /** Entries that stood out (ids): kept to remember, with a next step, time flew, then the most written. */
  standout: string[]
  remember: string[]
}

const written = (e: Entry) => e.note.trim().length + e.reflections.reduce((sum, r) => sum + r.text.trim().length, 0)

/** `steps`: the next steps list (v0.11), so an entry with one stands out. */
export function weekSummary(all: readonly Entry[], start: string, steps: readonly Step[] = []): WeekSummary {
  const end = addDays(start, 6)
  const week = all.filter((e) => isDone(e) && e.date >= start && e.date <= end)
  const groups = activityStats(week.filter((e) => !e.skipped.includes('energy')))
  const line = (count: (g: (typeof groups)[number]) => number) =>
    groups
      .filter((g) => count(g) >= WEEK_MIN)
      .map((g) => ({ label: g.label, count: count(g), of: g.count, entryIds: g.entryIds }))
      .sort((a, b) => b.count - a.count)

  const feelings = new Map<string, { word: string; entryIds: string[] }>()
  for (const e of week) {
    for (const word of e.after) {
      const key = word.toLowerCase()
      const found = feelings.get(key) ?? { word, entryIds: [] }
      if (!found.entryIds.includes(e.id)) found.entryIds.push(e.id)
      feelings.set(key, found)
    }
  }

  // Different things worth a look: one entry per activity.
  const standout: string[] = []
  const named = new Set<string>()
  const pick = (entries: readonly Entry[]) => {
    for (const e of entries) {
      const key = e.kind === 'free' ? e.id : e.activity.trim().toLowerCase()
      if (standout.length < STANDOUT_MAX && !standout.includes(e.id) && !named.has(key)) {
        standout.push(e.id)
        named.add(key)
      }
    }
  }
  pick(week.filter((e) => e.intention?.kind === 'remember'))
  const withStep = new Set(steps.flatMap((s) => s.entryIds))
  pick(week.filter((e) => withStep.has(e.id)))
  pick(week.filter((e) => e.flow))
  pick([...week].filter((e) => written(e) > 0).sort((a, b) => written(b) - written(a)))

  return {
    start,
    end,
    entries: week.length,
    days: new Set(week.map((e) => e.date)).size,
    gave: line((g) => g.gave),
    used: line((g) => g.took),
    feelings: [...feelings.values()]
      .map((f) => ({ word: f.word, count: f.entryIds.length, entryIds: f.entryIds }))
      .filter((f) => f.count >= WEEK_MIN)
      .sort((a, b) => b.count - a.count)
      .slice(0, FEELINGS_MAX),
    standout,
    remember: week.filter((e) => e.intention?.kind === 'remember').map((e) => e.id),
  }
}
