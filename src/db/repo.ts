import type { Energy, Engagement } from '../domain/scales'
import { type DayPart, toDateKey } from '../lib/dates'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import type { Entry, EntrySource } from './types'

export interface EntryDraft {
  date: string
  part: DayPart
  activity: string
  engagement: Engagement
  energy: Energy
  flow: boolean
  where: string[]
  people: string[]
  objects: string[]
  note: string
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Trims values and drops empty or repeated ones (ignoring case), keeping the first spelling. */
export function tidyList(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const value = tidy(raw)
    const key = value.toLowerCase()
    if (value && !seen.has(key)) {
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

/** Logged for today before 5pm = in the moment ("quick"); later, or for a past day = reconstructed ("evening"). */
export function entrySource(date: string, now: Date): EntrySource {
  return date === toDateKey(now) && now.getHours() < 17 ? 'quick' : 'evening'
}

export function buildEntry(draft: EntryDraft, existing: Entry | undefined, now: Date): Entry {
  const time = now.getTime()
  return {
    id: existing?.id ?? crypto.randomUUID(),
    date: draft.date,
    part: draft.part,
    activity: tidy(draft.activity),
    engagement: draft.engagement,
    energy: draft.energy,
    flow: draft.flow,
    where: tidyList(draft.where),
    people: tidyList(draft.people),
    objects: tidyList(draft.objects),
    note: draft.note.trim(),
    source: existing?.source ?? entrySource(draft.date, now),
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  }
}

export async function saveEntry(draft: EntryDraft, existing?: Entry, database: LifeDesignDB = defaultDb): Promise<Entry> {
  const entry = buildEntry(draft, existing, new Date())
  if (!entry.activity) throw new Error('An entry needs an activity')
  await guardWrite(() => database.entries.put(entry))
  return entry
}

export async function deleteEntry(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.entries.delete(id))
}

export async function setSmallJoy(date: string, text: string, database: LifeDesignDB = defaultDb): Promise<void> {
  const now = Date.now()
  const smallJoy = text.trim()
  await guardWrite(async () => {
    const existing = await database.days.get(date)
    if (existing?.smallJoy === smallJoy) return
    if (!existing && !smallJoy) return
    await database.days.put({ date, smallJoy, createdAt: existing?.createdAt ?? now, updatedAt: now })
  })
}

export async function getSetting<T>(key: string, fallback: T, database: LifeDesignDB = defaultDb): Promise<T> {
  const row = await database.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.settings.put({ key, value, updatedAt: Date.now() }))
}

export interface Suggestions {
  activities: string[]
  where: string[]
  people: string[]
  objects: string[]
}

const SUGGESTION_LIMIT = 8

function byFrequency(lists: string[][]): string[] {
  const counts = new Map<string, { value: string; count: number }>()
  for (const list of lists) {
    for (const value of list) {
      const key = value.toLowerCase()
      const hit = counts.get(key)
      if (hit) hit.count += 1
      else counts.set(key, { value, count: 1 })
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, SUGGESTION_LIMIT)
    .map((c) => c.value)
}

/** Quick-pick chips: most recent distinct activities, and the most used places, people and objects. */
export function computeSuggestions(entries: readonly Entry[]): Suggestions {
  const recent = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
  return {
    activities: tidyList(recent.map((e) => e.activity)).slice(0, SUGGESTION_LIMIT),
    where: byFrequency(recent.map((e) => e.where)),
    people: byFrequency(recent.map((e) => e.people)),
    objects: byFrequency(recent.map((e) => e.objects)),
  }
}

export async function loadSuggestions(database: LifeDesignDB = defaultDb): Promise<Suggestions> {
  const recent = await database.entries.orderBy('updatedAt').reverse().limit(300).toArray()
  return computeSuggestions(recent)
}

/** Entries and days created or changed after `since` (everything when never backed up). */
export async function countChangesSince(since: number | null, database: LifeDesignDB = defaultDb): Promise<number> {
  if (since === null) return (await database.entries.count()) + (await database.days.count())
  const [entries, days] = await Promise.all([
    database.entries.where('updatedAt').above(since).count(),
    database.days.where('updatedAt').above(since).count(),
  ])
  return entries + days
}

export async function firstEntryCreatedAt(database: LifeDesignDB = defaultDb): Promise<number | null> {
  const first = await database.entries.orderBy('createdAt').first()
  return first?.createdAt ?? null
}
