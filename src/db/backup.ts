// Backup and restore. Import only adds or updates (newest version of a record wins); it never deletes.
import { stepsFromIntentions } from '../domain/steps'
import { toDateKey } from '../lib/dates'
import { isLockedEnvelope, type LockedEnvelope } from './crypto'
import { db as defaultDb, type LifeDesignDB } from './db'
import { convertV1, isV1Backup } from './importV1'
import { guardWrite } from './saveErrors'
import { type BackupData, TABLE_NAMES, type TableName } from './types'
import { normalizeRecord, VALIDATORS } from './validate'

export const APP_ID = 'life-design'
/**
 * 1 = Phase 1; 2 adds reviews; 3 adds evening answers and each review moment's "why"; 4 adds earlier versions of
 * Odyssey Plans and Workview & Lifeview; 5 adds purpose journaling (entry purpose, reflections, next steps, free
 * writing, drafts) and weekly notes; 6 moves next steps into their own list (steps); 7 adds reviews by AI; 8 adds
 * photos, and each entry's question and photos (v0.16). Older files still restore (their next steps become steps);
 * newer ones are refused by older app versions. The AI key never goes into a backup.
 */
export const BACKUP_SCHEMA_VERSION = 8

/** Settings that never leave the phone, not even inside a backup: the AI key, and whether search by meaning and
 *  reading photos are on (their downloads are this phone's: a phone restored to offers them again). */
export const SECRET_SETTING_KEYS: ReadonlySet<string> = new Set(['aiKey', 'meaningSearch', 'photoText'])

export interface BackupFile {
  app: typeof APP_ID
  kind: 'backup'
  schemaVersion: number
  exportedAt: string
  data: BackupData
}

/** Records as read from a file, before validation. */
export type RawData = Record<TableName, unknown[]>

/** Why a chosen file can't be restored, so the message can say exactly what it is. */
export type FileProblem =
  | 'empty'
  | 'web-page'
  | 'spreadsheet'
  | 'calendar'
  | 'not-json'
  | 'damaged'
  | 'damaged-lock'
  | 'other-json'

export type DetectedFile =
  | { format: 'backup'; raw: RawData; exportedAt: string }
  | { format: 'locked'; envelope: LockedEnvelope }
  | { format: 'v1'; raw: RawData; skipped: number }
  | { format: 'too-new'; schemaVersion: number }
  | { format: 'unknown'; problem: FileProblem }

export interface TablePlan {
  incoming: number
  added: number
  updated: number
  unchanged: number
  skipped: number
}

export interface ImportPlan {
  tables: Record<TableName, TablePlan>
  toWrite: BackupData
  changes: number
}

export async function createBackup(database: LifeDesignDB = defaultDb, now: Date = new Date()): Promise<BackupFile> {
  const data = await database.transaction('r', database.tables, async () => ({
    entries: await database.entries.toArray(),
    days: await database.days.toArray(),
    answers: await database.answers.toArray(),
    ikigaiItems: await database.ikigaiItems.toArray(),
    odysseyPlans: await database.odysseyPlans.toArray(),
    planVersions: await database.planVersions.toArray(),
    views: await database.views.toArray(),
    weeks: await database.weeks.toArray(),
    steps: await database.steps.toArray(),
    aiReviews: await database.aiReviews.toArray(),
    reviews: await database.reviews.toArray(),
    settings: (await database.settings.toArray()).filter((s) => !SECRET_SETTING_KEYS.has(s.key)),
    photos: await database.photos.toArray(),
  }))
  return { app: APP_ID, kind: 'backup', schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now.toISOString(), data }
}

export function backupFileName(now: Date, locked: boolean): string {
  return `life-design-backup-${toDateKey(now)}${locked ? '-locked' : ''}.json`
}

function toRawData(data: unknown): RawData {
  const source = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
  const raw = {} as RawData
  for (const name of TABLE_NAMES) {
    const list = source[name]
    raw[name] = Array.isArray(list) ? list : []
  }
  return withStepsFromIntentions(raw)
}

/**
 * Files from before v0.11 (format 5 and older) kept next steps on entries: they become steps, as the database
 * upgrade does, and leave their entries. Their ids come from the entry, so restoring twice adds nothing.
 */
function withStepsFromIntentions(raw: RawData): RawData {
  const steps = stepsFromIntentions(raw.entries)
  if (steps.length === 0) return raw
  const moved = new Set(steps.flatMap((s) => s.entryIds))
  const entries = raw.entries.map((e) => {
    const record = e as Record<string, unknown>
    return typeof record === 'object' && record !== null && moved.has(record.id as string) ? { ...record, intention: null } : e
  })
  return { ...raw, entries, steps: [...raw.steps, ...steps] }
}

function classifyUnparseable(text: string): FileProblem {
  const head = text.slice(0, 200).toLowerCase()
  if (head.startsWith('<')) return 'web-page'
  if (head.startsWith('begin:vcalendar')) return 'calendar'
  if (head.startsWith('date,part_of_day')) return 'spreadsheet'
  if (head.startsWith('{') || head.startsWith('[')) return 'damaged'
  return 'not-json'
}

export function detectFile(text: string, now: Date = new Date()): DetectedFile {
  // Some apps add a byte-order mark or line breaks when they save a file; neither changes the backup.
  const content = text.replace(/^﻿/, '').trim()
  if (!content) return { format: 'unknown', problem: 'empty' }

  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    return { format: 'unknown', problem: classifyUnparseable(content) }
  }

  if (isLockedEnvelope(json)) return { format: 'locked', envelope: json }
  if (isV1Backup(json)) {
    const { data, skipped } = convertV1(json, now)
    return { format: 'v1', raw: toRawData(data), skipped }
  }
  if (typeof json === 'object' && json !== null) {
    const r = json as Record<string, unknown>
    if (r.app === APP_ID && r.kind === 'locked-backup') return { format: 'unknown', problem: 'damaged-lock' }
    if (r.app === APP_ID && r.kind === 'backup') {
      const schemaVersion = Number(r.schemaVersion)
      if (typeof r.data !== 'object' || r.data === null || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
        return { format: 'unknown', problem: 'damaged' }
      }
      if (schemaVersion > BACKUP_SCHEMA_VERSION) return { format: 'too-new', schemaVersion }
      return { format: 'backup', raw: toRawData(r.data), exportedAt: String(r.exportedAt ?? '') }
    }
  }
  return { format: 'unknown', problem: 'other-json' }
}

type Versioned = { updatedAt: number }

function primaryKey(table: TableName, record: unknown): string {
  const r = record as Record<string, string>
  if (table === 'settings') return r.key ?? ''
  if (table === 'days') return r.date ?? ''
  return r.id ?? ''
}

async function comparePlan(raw: RawData, database: LifeDesignDB): Promise<ImportPlan> {
  const tables = {} as Record<TableName, TablePlan>
  const toWrite = Object.fromEntries(TABLE_NAMES.map((name) => [name, [] as unknown[]])) as Record<TableName, unknown[]>
  let changes = 0

  for (const name of TABLE_NAMES) {
    const incoming = raw[name]
    const isValid = VALIDATORS[name] as (x: unknown) => boolean
    // Keep only valid records; for repeated keys inside the file keep the newest.
    const newest = new Map<string, Versioned>()
    for (const record of incoming) {
      if (!isValid(record)) continue
      if (name === 'settings' && SECRET_SETTING_KEYS.has(primaryKey(name, record))) continue
      const key = primaryKey(name, record)
      const current = newest.get(key)
      if (!current || (record as Versioned).updatedAt > current.updatedAt) newest.set(key, normalizeRecord(name, record) as Versioned)
    }

    const keys = [...newest.keys()]
    const existing = (await database.table(name).bulkGet(keys)) as (Versioned | undefined)[]
    const plan: TablePlan = { incoming: incoming.length, added: 0, updated: 0, unchanged: 0, skipped: incoming.length - keys.length }
    keys.forEach((key, i) => {
      const record = newest.get(key) as Versioned
      const current = existing[i]
      if (!current) {
        plan.added += 1
        toWrite[name].push(record)
      } else if (record.updatedAt > current.updatedAt) {
        plan.updated += 1
        toWrite[name].push(record)
      } else {
        plan.unchanged += 1
      }
    })
    changes += plan.added + plan.updated
    tables[name] = plan
  }

  return { tables, toWrite: toWrite as unknown as BackupData, changes }
}

/** Preview: what an import would add, update or leave alone. Changes nothing. */
export async function planImport(raw: RawData, database: LifeDesignDB = defaultDb): Promise<ImportPlan> {
  return database.transaction('r', database.tables, () => comparePlan(raw, database))
}

/** Re-checks and writes in one transaction, so nothing edited in the meantime is overwritten by older data. */
export async function applyImport(raw: RawData, database: LifeDesignDB = defaultDb): Promise<ImportPlan> {
  return guardWrite(() =>
    database.transaction('rw', database.tables, async () => {
      const plan = await comparePlan(raw, database)
      for (const name of TABLE_NAMES) {
        const records = plan.toWrite[name]
        if (records.length > 0) await database.table(name).bulkPut(records)
      }
      return plan
    }),
  )
}
