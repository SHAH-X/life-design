// Converts a backup from the earlier single-file app (v1) into today's records.
// v1 shape: { gtj: [{ a, e (−5…5), g (0…10), f, ts, d }], iki: [{ n, f: [love, goodAt, worldNeeds, paidFor] }], ody: [{ h, d, q, r, l, c, co }] }
import { energyFromV1, engagementFromV1 } from '../domain/scales'
import { fromDateKey, partOfDay, toDateKey } from '../lib/dates'
import { type BackupData, type Entry, type IkigaiItem, type OdysseyPlan, entryDefaults } from './types'

/** Ikigai items and plans from v1 carry this fixed timestamp, so they never overwrite anything edited since. */
export const V1_TIMESTAMP = 1

export interface V1Backup {
  gtj: unknown[]
  iki: unknown[]
  ody: unknown[]
}

export interface V1Conversion {
  data: BackupData
  skipped: number
}

type Rec = Record<string, unknown>

const asRec = (x: unknown): Rec => (typeof x === 'object' && x !== null ? (x as Rec) : {})
const finite = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const text = (x: unknown): string => (typeof x === 'string' ? x.trim().replace(/\s+/g, ' ') : '')
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'item'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export function isV1Backup(x: unknown): x is V1Backup {
  const r = asRec(x)
  return Array.isArray(r.gtj) && Array.isArray(r.iki) && Array.isArray(r.ody)
}

/** v1 stored day labels like "21 Oct" or "Oct 21" without a year: use the most recent such date on or before `now`. */
export function parseV1DayLabel(label: string, now: Date): string | null {
  const day = Number(label.match(/\b(\d{1,2})\b/)?.[1])
  const month = MONTHS.indexOf(label.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/)?.[1] ?? '')
  if (!day || month < 0) return null
  const today = toDateKey(now)
  for (const year of [now.getFullYear(), now.getFullYear() - 1]) {
    const d = new Date(year, month, day, 12)
    if (d.getMonth() !== month) return null // e.g. 31 Feb
    const key = toDateKey(d)
    if (key <= today) return key
  }
  return null
}

export function convertV1(input: V1Backup, now: Date = new Date()): V1Conversion {
  let skipped = 0
  const usedIds = new Set<string>()
  const uniqueId = (base: string) => {
    let id = base
    for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`
    usedIds.add(id)
    return id
  }

  const entries: Entry[] = []
  for (const raw of input.gtj) {
    const r = asRec(raw)
    const activity = text(r.a)
    const e = finite(r.e)
    const g = finite(r.g)
    const ts = finite(r.ts)
    const at = ts !== null && ts > 0 ? new Date(ts) : null
    const date = at ? toDateKey(at) : typeof r.d === 'string' ? parseV1DayLabel(r.d, now) : null
    if (!activity || e === null || g === null || date === null) {
      skipped += 1
      continue
    }
    const created = at ? at.getTime() : fromDateKey(date).getTime()
    entries.push({
      id: uniqueId(`v1-${at ? at.getTime() : date}-${slug(activity)}`),
      date,
      part: at ? partOfDay(at) : 'evening',
      activity,
      engagement: engagementFromV1(g),
      energy: energyFromV1(e),
      flow: r.f === true || r.f === 1,
      where: [],
      people: [],
      objects: [],
      during: [],
      after: [],
      note: '',
      source: 'import',
      ...entryDefaults(),
      createdAt: created,
      updatedAt: created,
    })
  }

  const ikigaiItems: IkigaiItem[] = []
  for (const raw of input.iki) {
    const r = asRec(raw)
    const name = text(r.n)
    const flags = Array.isArray(r.f) ? r.f : []
    if (!name) {
      skipped += 1
      continue
    }
    ikigaiItems.push({
      id: uniqueId(`v1-iki-${slug(name)}`),
      text: name,
      love: Boolean(flags[0]),
      goodAt: Boolean(flags[1]),
      worldNeeds: Boolean(flags[2]),
      paidFor: Boolean(flags[3]),
      linkedActivities: [],
      notes: '',
      createdAt: V1_TIMESTAMP,
      updatedAt: V1_TIMESTAMP,
    })
  }

  const odysseyPlans: OdysseyPlan[] = []
  input.ody.slice(0, 3).forEach((raw, index) => {
    const r = asRec(raw)
    const gauge = (x: unknown) => {
      const n = finite(x)
      return n === null ? 5 : Math.min(10, Math.max(0, Math.round(n)))
    }
    const title = text(r.h)
    const description = typeof r.d === 'string' ? r.d.trim() : ''
    const question = text(r.q)
    const gauges = { resources: gauge(r.r), likability: gauge(r.l), confidence: gauge(r.c), coherence: gauge(r.co) }
    const untouched = !title && !description && !question && Object.values(gauges).every((v) => v === 5)
    if (untouched) return // v1 always held three blank plans; don't import empty ones
    const slot = (index + 1) as 1 | 2 | 3
    odysseyPlans.push({
      id: `plan-${slot}`,
      slot,
      title,
      description,
      years: [[], [], [], [], []],
      questions: question ? [question] : [],
      gauges, // kept, never shown: nothing in this app is rated
      feelings: [],
      needs: [],
      needsNote: '',
      fit: '',
      writtenAt: V1_TIMESTAMP,
      notes: '',
      createdAt: V1_TIMESTAMP,
      updatedAt: V1_TIMESTAMP,
    })
  })

  return { data: { entries, days: [], answers: [], ikigaiItems, odysseyPlans, planVersions: [], views: [], weeks: [], steps: [], aiReviews: [], reviews: [], settings: [], photos: [] }, skipped }
}
