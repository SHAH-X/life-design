import type { OwnWord } from '../domain/feelings'
import type { Energy, Engagement } from '../domain/scales'
import { type DayPart, toDateKey } from '../lib/dates'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import { keepsVersion } from '../domain/lifeDesign'
import {
  type AeiouNote,
  type AiReview,
  type Answer,
  type Entry,
  type EntrySource,
  entryDefaults,
  type OdysseyPlan,
  type Purpose,
  type Review,
  type Step,
  type StepKind,
  type StepStatus,
  type Views,
} from './types'

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
  /** Purpose journaling (v0.8); left out, an entry is a finished activity with nothing skipped. */
  kind?: Entry['kind']
  purpose?: Entry['purpose']
  energyEffect?: Entry['energyEffect']
  duration?: Entry['duration']
  reflections?: Entry['reflections']
  intention?: Entry['intention']
  take?: string
  insightHidden?: boolean
  status?: Entry['status']
  skipped?: Entry['skipped']
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
  // A field left out keeps what the entry had (an edit never loses a next step or your take); null clears it.
  const keep = <K extends keyof ReturnType<typeof entryDefaults>>(key: K): Entry[K] =>
    (draft[key] !== undefined ? draft[key] : (existing?.[key] ?? entryDefaults()[key])) as Entry[K]
  const intention = keep('intention')
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
    kind: keep('kind'),
    purpose: keep('purpose'),
    energyEffect: keep('energyEffect'),
    duration: keep('duration'),
    // Only answered questions are kept, each with its question.
    reflections: keep('reflections').map((r) => ({ question: r.question, text: r.text.trim() })).filter((r) => r.text),
    intention: intention ? { ...intention, text: intention.text.trim() } : null,
    take: keep('take').trim(),
    insightHidden: keep('insightHidden'),
    status: keep('status'),
    skipped: keep('skipped'),
    createdAt: existing?.createdAt ?? time,
    updatedAt: time,
  }
}

export async function saveEntry(draft: EntryDraft, existing?: Entry, database: LifeDesignDB = defaultDb): Promise<Entry> {
  const entry = buildEntry(draft, existing, new Date())
  if (entry.kind === 'activity' && !entry.activity) throw new Error('An entry needs an activity')
  if (entry.kind === 'free' && !entry.note && entry.reflections.length === 0) throw new Error('Free writing needs some words')
  await guardWrite(() => database.entries.put(entry))
  return entry
}

/** Finished entries only: drafts stay out of Insights, the weekly review and patterns. */
export const isDone = (entry: Pick<Entry, 'status'>) => entry.status !== 'draft'
/** Whether an entry says anything about energy (the question wasn't skipped). */
export const hasEnergy = (entry: Pick<Entry, 'skipped'>) => !entry.skipped.includes('energy')
/** Whether an entry says anything about engagement (the question wasn't skipped). */
export const hasEngagement = (entry: Pick<Entry, 'skipped'>) => !entry.skipped.includes('engagement')

/** Changes only what's said after an entry (its next step, your take, a dismissed insight), keeping everything else. */
export async function patchEntry(
  id: string,
  changes: Partial<Pick<Entry, 'intention' | 'take' | 'insightHidden'>>,
  database: LifeDesignDB = defaultDb,
): Promise<void> {
  const tidied = { ...changes, ...(changes.take !== undefined ? { take: changes.take.trim() } : {}) }
  if (tidied.intention) tidied.intention = { ...tidied.intention, text: tidied.intention.text.trim() }
  await guardWrite(() => database.entries.update(id, { ...tidied, updatedAt: Date.now() }))
}

export async function deleteEntry(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.entries.delete(id))
}

/** A new next step: from an entry (its activity comes with it, so it comes back when you write about that again), or by hand. */
export async function addStep(
  input: { text: string; when?: string; kind: StepKind; entry?: Pick<Entry, 'id' | 'activity'> },
  database: LifeDesignDB = defaultDb,
): Promise<Step> {
  const now = Date.now()
  const step: Step = {
    id: crypto.randomUUID(),
    text: input.text.trim(),
    when: (input.when ?? '').trim(),
    kind: input.kind,
    status: 'active',
    entryIds: input.entry ? [input.entry.id] : [],
    activity: input.entry ? input.entry.activity.trim().toLowerCase() : '',
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
  }
  await guardWrite(() => database.steps.put(step))
  return step
}

/** The same step, kept again from another entry ("Same as …"). */
export async function linkStep(stepId: string, entryId: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.steps.update(stepId, (step) => {
      if (!step.entryIds.includes(entryId)) step.entryIds.push(entryId)
      step.updatedAt = Date.now()
    }),
  )
}

export async function updateStep(id: string, patch: Partial<Pick<Step, 'text' | 'when' | 'kind'>>, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.steps.update(id, { ...patch, updatedAt: Date.now() }))
}

/** Done (once), stopped (ongoing), or taken up again; touching it keeps it out of "Not touched lately". */
export async function setStepStatus(id: string, status: StepStatus, database: LifeDesignDB = defaultDb): Promise<void> {
  const now = Date.now()
  await guardWrite(() => database.steps.update(id, { status, finishedAt: status === 'active' ? null : now, updatedAt: now }))
}

export async function deleteStep(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.steps.delete(id))
}

export async function restoreStep(step: Step, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.steps.put(step))
}

/** Two steps that say the same: one stays, with both sets of entries; the other goes. */
export async function mergeSteps(keepId: string, goneId: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.steps, async () => {
      const [keep, gone] = await database.steps.bulkGet([keepId, goneId])
      if (!keep || !gone || keepId === goneId) return
      await database.steps.put({ ...keep, entryIds: [...new Set([...keep.entryIds, ...gone.entryIds])], activity: keep.activity || gone.activity, updatedAt: Date.now() })
      await database.steps.delete(goneId)
    }),
  )
}

/** Keeps a review of a period by AI, to read again later. */
export async function saveAiReview(input: Omit<AiReview, 'id' | 'createdAt' | 'updatedAt'>, database: LifeDesignDB = defaultDb): Promise<AiReview> {
  const now = Date.now()
  const review: AiReview = { ...input, focus: input.focus.trim(), id: crypto.randomUUID(), createdAt: now, updatedAt: now }
  await guardWrite(() => database.aiReviews.put(review))
  return review
}

export async function deleteAiReview(id: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.aiReviews.delete(id))
}

export async function restoreAiReview(review: AiReview, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.aiReviews.put(review))
}

/** Puts a deleted entry back exactly as it was (Undo after a swipe to delete). */
export async function restoreEntry(entry: Entry, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.entries.put(entry))
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

/** Removes a setting outright (e.g. the AI key: "Remove key" leaves nothing behind). */
export async function deleteSetting(key: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() => database.settings.delete(key))
}

/** A purpose's follow-up answer ("What are you working towards?"…). The goal keeps its own key, as since Phase 2.5. */
export async function setPurposeFocus(purpose: Purpose, text: string, database: LifeDesignDB = defaultDb): Promise<void> {
  if (purpose === 'goal') return setSetting('goal', text.trim(), database)
  const current = await getSetting<Record<string, string>>('purposeFocus', {}, database)
  await setSetting('purposeFocus', { ...current, [purpose]: text.trim() }, database)
}

export interface Suggestions {
  activities: string[]
  where: string[]
  people: string[]
  objects: string[]
}

/** Until suggestions load: none. */
export const NO_SUGGESTIONS: Suggestions = { activities: [], where: [], people: [], objects: [] }

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

/** Entries, days, evening answers, reviews, plans and views created or changed after `since` (everything when never backed up). */
export async function countChangesSince(since: number | null, database: LifeDesignDB = defaultDb): Promise<number> {
  const tables = [
    database.entries,
    database.days,
    database.answers,
    database.reviews,
    database.odysseyPlans,
    database.views,
    database.weeks,
    database.steps,
    database.aiReviews,
  ] as const
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

/** Whether anything has been written yet: entries, small joys, answers, reviews, plans or views. Settings don't count. */
export async function hasJournalData(database: LifeDesignDB = defaultDb): Promise<boolean> {
  return (await countChangesSince(null, database)) > 0
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
      ((w as OwnWord).kind === 'during' || (w as OwnWord).kind === 'after' || (w as OwnWord).kind === 'plan') &&
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

const planContent = (plan: OdysseyPlan) => {
  const { updatedAt: _updated, createdAt: _created, ...content } = plan
  return JSON.stringify(content)
}

/**
 * Saves an Odyssey Plan. Once a plan is written, the first change made 7+ days after the last one keeps the
 * plan as it was, as a dated earlier version (no extra step for you; see keepsVersion).
 */
export async function savePlan(plan: OdysseyPlan, database: LifeDesignDB = defaultDb, now: number = Date.now()): Promise<OdysseyPlan> {
  return guardWrite(() =>
    database.transaction('rw', database.odysseyPlans, database.planVersions, async () => {
      const current = await database.odysseyPlans.get(plan.id)
      if (current && current.writtenAt !== null && keepsVersion(current.updatedAt, now) && planContent(current) !== planContent(plan)) {
        await database.planVersions.put({
          id: crypto.randomUUID(),
          planId: current.id,
          slot: current.slot,
          savedAt: current.updatedAt,
          plan: current,
          createdAt: now,
          updatedAt: now,
        })
      }
      const saved = { ...plan, updatedAt: now }
      await database.odysseyPlans.put(saved)
      return saved
    }),
  )
}

export type ViewsText = Pick<Views, 'workview' | 'lifeview' | 'coherence'>

/** The current Workview & Lifeview: the newest version. */
export async function latestViews(database: LifeDesignDB = defaultDb): Promise<Views | undefined> {
  return database.views.orderBy('updatedAt').last()
}

/** Saves Workview & Lifeview: edited in place within a week, as a new version after (the old one stays). */
export async function saveViews(text: ViewsText, database: LifeDesignDB = defaultDb, now: number = Date.now()): Promise<Views> {
  return guardWrite(() =>
    database.transaction('rw', database.views, async () => {
      const latest = await latestViews(database)
      const same = latest && latest.workview === text.workview && latest.lifeview === text.lifeview && latest.coherence === text.coherence
      if (latest && same) return latest
      const record: Views =
        latest && !keepsVersion(latest.updatedAt, now)
          ? { ...latest, ...text, updatedAt: now }
          : { id: crypto.randomUUID(), ...text, createdAt: now, updatedAt: now }
      await database.views.put(record)
      return record
    }),
  )
}
