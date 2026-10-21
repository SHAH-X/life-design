import { wholeDaysBetween } from '../lib/dates'

export const NUDGE_AFTER_DAYS = 7

export interface NudgeInput {
  now: number
  lastExportAt: number | null
  firstEntryAt: number | null
  /** Entries and days created or edited since the last export (all of them if never exported). */
  changedSinceExport: number
  snoozedUntil: number | null
}

export interface Nudge {
  due: boolean
  /** Whole days since the last backup; null if there has never been one. */
  daysSinceBackup: number | null
  changed: number
}

/** A backup reminder is due once 7 days have passed since the last export (or since the first entry). */
export function exportNudge(input: NudgeInput): Nudge {
  const daysSinceBackup = input.lastExportAt === null ? null : wholeDaysBetween(input.lastExportAt, input.now)
  const base = { daysSinceBackup, changed: input.changedSinceExport }
  if (input.changedSinceExport === 0 || input.firstEntryAt === null) return { due: false, ...base }
  if (input.snoozedUntil !== null && input.now < input.snoozedUntil) return { due: false, ...base }
  const since = input.lastExportAt ?? input.firstEntryAt
  return { due: wholeDaysBetween(since, input.now) >= NUDGE_AFTER_DAYS, ...base }
}
