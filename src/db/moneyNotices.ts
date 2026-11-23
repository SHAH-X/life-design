import { db as defaultDb, type LifeDesignDB } from './db'
import { changeSetting } from './repo'

// The quiet line on Today (step 6, 2026-11-23): shown once, then gone. What was shown is kept by its key, newest last.

export const MONEY_NOTICES_SEEN = 'moneyNoticesSeen'

/** How many seen keys are kept: older ones can't come back, since a line is only for the last three weeks. */
const KEPT = 200

export const seenNotices = (row: { value: unknown } | undefined): string[] => (Array.isArray(row?.value) ? row.value.filter((k): k is string => typeof k === 'string') : [])

/** Says a line was seen: it isn't shown again. */
export async function markNoticeSeen(key: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await changeSetting(MONEY_NOTICES_SEEN, (row) => [...seenNotices(row).filter((k) => k !== key), key].slice(-KEPT), database)
}
