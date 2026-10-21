// Shape checks for records arriving from a backup file. Anything that fails is skipped, never imported.
import { isEnergy, isEngagement } from '../domain/scales'
import { isDateKey } from '../lib/dates'
import {
  type Answer,
  BALANCE_AREAS,
  type BackupData,
  type Day,
  type Entry,
  type IkigaiItem,
  type OdysseyPlan,
  type Review,
  type Setting,
  type TableName,
} from './types'

type Rec = Record<string, unknown>

const isObj = (x: unknown): x is Rec => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNonEmptyStr = (x: unknown): x is string => isStr(x) && x.trim().length > 0
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isBool = (x: unknown): x is boolean => typeof x === 'boolean'
const isStrList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isStr)
const hasTimes = (r: Rec) => isNum(r.createdAt) && isNum(r.updatedAt)
const isGauge = (x: unknown) => isNum(x) && x >= 0 && x <= 10

export function isEntry(x: unknown): x is Entry {
  return (
    isObj(x) &&
    isNonEmptyStr(x.id) &&
    isDateKey(x.date) &&
    (x.part === 'morning' || x.part === 'afternoon' || x.part === 'evening') &&
    isNonEmptyStr(x.activity) &&
    isEngagement(x.engagement) &&
    isEnergy(x.energy) &&
    isBool(x.flow) &&
    isStrList(x.where) &&
    isStrList(x.people) &&
    isStrList(x.objects) &&
    (x.during === undefined || isStrList(x.during)) && // files from before v0.5 have no feeling words
    (x.after === undefined || isStrList(x.after)) &&
    isStr(x.note) &&
    (x.source === 'evening' || x.source === 'quick' || x.source === 'import') &&
    hasTimes(x)
  )
}

export function isDay(x: unknown): x is Day {
  return isObj(x) && isDateKey(x.date) && isStr(x.smallJoy) && hasTimes(x)
}

const ANSWER_PURPOSES: readonly unknown[] = ['know', 'calm', 'grow', 'goal', 'learn', 'joy', 'pattern']

export function isAnswer(x: unknown): x is Answer {
  return (
    isObj(x) &&
    isNonEmptyStr(x.id) &&
    isDateKey(x.date) &&
    isNonEmptyStr(x.promptId) &&
    ANSWER_PURPOSES.includes(x.purpose) &&
    isNonEmptyStr(x.question) &&
    isStr(x.text) &&
    hasTimes(x)
  )
}

export function isIkigaiItem(x: unknown): x is IkigaiItem {
  return (
    isObj(x) &&
    isNonEmptyStr(x.id) &&
    isNonEmptyStr(x.text) &&
    isBool(x.love) &&
    isBool(x.goodAt) &&
    isBool(x.worldNeeds) &&
    isBool(x.paidFor) &&
    isStrList(x.linkedActivities) &&
    isStr(x.notes) &&
    hasTimes(x)
  )
}

export function isOdysseyPlan(x: unknown): x is OdysseyPlan {
  if (!isObj(x) || !isObj(x.gauges)) return false
  const g = x.gauges
  return (
    isNonEmptyStr(x.id) &&
    (x.slot === 1 || x.slot === 2 || x.slot === 3) &&
    isStr(x.title) &&
    isStr(x.description) &&
    Array.isArray(x.years) &&
    x.years.length <= 5 &&
    x.years.every(isStrList) &&
    isStrList(x.questions) &&
    isGauge(g.resources) &&
    isGauge(g.likability) &&
    isGauge(g.confidence) &&
    isGauge(g.coherence) &&
    isStr(x.notes) &&
    hasTimes(x)
  )
}

function isAeiouNote(x: unknown): boolean {
  return (
    isObj(x) &&
    (x.entryId === null || isNonEmptyStr(x.entryId)) &&
    isStr(x.activities) &&
    isStr(x.environments) &&
    isStr(x.interactions) &&
    isStr(x.objects) &&
    isStr(x.users) &&
    (x.why === undefined || isStr(x.why)) // files from before v0.4 have no "why"
  )
}

export function isReview(x: unknown): x is Review {
  if (!isObj(x) || !isObj(x.balance)) return false
  const balance = x.balance
  return (
    isNonEmptyStr(x.id) &&
    isDateKey(x.periodStart) &&
    isDateKey(x.periodEnd) &&
    x.periodStart <= x.periodEnd &&
    BALANCE_AREAS.every((area) => balance[area] === null || isGauge(balance[area])) &&
    isAeiouNote(x.best) &&
    isAeiouNote(x.worst) &&
    (x.alive === undefined || x.alive === null || BALANCE_AREAS.includes(x.alive as never)) &&
    (x.neglected === undefined || x.neglected === null || BALANCE_AREAS.includes(x.neglected as never)) &&
    (x.balanceWhy === undefined || isStr(x.balanceWhy)) &&
    isStr(x.reflection) &&
    isStr(x.takeaway) &&
    (x.completedAt === null || isNum(x.completedAt)) &&
    hasTimes(x)
  )
}

export function isSetting(x: unknown): x is Setting {
  return isObj(x) && isNonEmptyStr(x.key) && 'value' in x && isNum(x.updatedAt)
}

export const VALIDATORS: { [K in TableName]: (x: unknown) => x is BackupData[K][number] } = {
  entries: isEntry,
  days: isDay,
  answers: isAnswer,
  ikigaiItems: isIkigaiItem,
  odysseyPlans: isOdysseyPlan,
  reviews: isReview,
  settings: isSetting,
}

/** Fills in fields that older files don't have yet, after validation. */
export function normalizeRecord(table: TableName, record: unknown): unknown {
  if (table === 'entries') {
    const entry = record as Entry
    return { ...entry, during: entry.during ?? [], after: entry.after ?? [] }
  }
  if (table !== 'reviews') return record
  const review = record as Review
  return {
    ...review,
    alive: review.alive ?? null,
    neglected: review.neglected ?? null,
    balanceWhy: review.balanceWhy ?? '',
    best: { ...review.best, why: review.best.why ?? '' },
    worst: { ...review.worst, why: review.worst.why ?? '' },
  }
}
