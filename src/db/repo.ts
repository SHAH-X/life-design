import type { OwnWord } from '../domain/feelings'
import type { Energy, Engagement } from '../domain/scales'
import { type DayPart, toDateKey } from '../lib/dates'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import type { AeiouNote, Answer, Entry, EntrySource, Purpose, Review } from './types'

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
  /** Feeling words; engagement, energy and flow above are worked out from them by the screen. */
  during: string[]
  after: string[]
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
    during: tidyList(draft.during),
    after: tidyList(draft.after),
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

export interface AskedPrompt {
  id: string
  purpose: Purpose | 'pattern'
  question: string
}

/**
 * Saves the evening answer for a day, with the question it answers. Saves only real changes;
 * nothing typed and nothing saved yet means nothing to save (returns null).
 * `existing` is that day's answer, if any: it keeps its id, and takes the question shown now.
 */
export async function saveAnswer(
  date: string,
  prompt: AskedPrompt,
  text: string,
  existing?: Answer,
  database: LifeDesignDB = defaultDb,
): Promise<Answer | null> {
  const value = text.trim()
  if (!existing && !value) return null
  if (existing && existing.text === value && existing.promptId === prompt.id) return existing
  const now = Date.now()
  const answer: Answer = {
    id: existing?.id ?? crypto.randomUUID(),
    date,
    promptId: prompt.id,
    purpose: prompt.purpose,
    question: prompt.question,
    text: value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await guardWrite(() => database.answers.put(answer))
  return answer
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

/** Entries, days, evening answers and reviews created or changed after `since` (everything when never backed up). */
export async function countChangesSince(since: number | null, database: LifeDesignDB = defaultDb): Promise<number> {
  const tables = [database.entries, database.days, database.answers, database.reviews] as const
  const counts = await Promise.all(tables.map((t) => (since === null ? t.count() : t.where('updatedAt').above(since).count())))
  return counts.reduce((sum, n) => sum + n, 0)
}

const emptyNote = (entryId: string | null = null): AeiouNote => ({
  entryId,
  activities: '',
  environments: '',
  interactions: '',
  objects: '',
  users: '',
  why: '',
})

export function newReview(periodStart: string, periodEnd: string, now: Date = new Date()): Review {
  const time = now.getTime()
  return {
    id: crypto.randomUUID(),
    periodStart,
    periodEnd,
    balance: { health: null, work: null, play: null, love: null },
    alive: null,
    neglected: null,
    balanceWhy: '',
    best: emptyNote(),
    worst: emptyNote(),
    reflection: '',
    takeaway: '',
    completedAt: null,
    createdAt: time,
    updatedAt: time,
  }
}

export async function saveReview(review: Review, database: LifeDesignDB = defaultDb): Promise<Review> {
  const saved = { ...review, updatedAt: Date.now() }
  await guardWrite(() => database.reviews.put(saved))
  return saved
}

export async function deleteReview(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.reviews.delete(id))
}

export async function firstEntryCreatedAt(database: LifeDesignDB = defaultDb): Promise<number | null> {
  const first = await database.entries.orderBy('createdAt').first()
  return first?.createdAt ?? null
}

/** Your own feeling words, checked (a backup could hold anything under this key). */
export function cleanOwnWords(value: unknown): OwnWord[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (w): w is OwnWord =>
      typeof w === 'object' &&
      w !== null &&
      typeof (w as OwnWord).word === 'string' &&
      ((w as OwnWord).kind === 'during' || (w as OwnWord).kind === 'after') &&
      typeof (w as OwnWord).weight === 'number',
  )
}

export async function getOwnWords(database: LifeDesignDB = defaultDb): Promise<OwnWord[]> {
  return cleanOwnWords(await getSetting<unknown>('ownWords', [], database))
}

export async function addOwnWord(word: OwnWord, database: LifeDesignDB = defaultDb): Promise<void> {
  const current = await getOwnWords(database)
  const rest = current.filter((w) => !(w.kind === word.kind && w.word.toLowerCase() === word.word.toLowerCase()))
  await setSetting('ownWords', [...rest, word], database)
}

export async function removeOwnWord(word: OwnWord, database: LifeDesignDB = defaultDb): Promise<void> {
  const current = await getOwnWords(database)
  await setSetting(
    'ownWords',
    current.filter((w) => !(w.kind === word.kind && w.word.toLowerCase() === word.word.toLowerCase())),
    database,
  )
}
