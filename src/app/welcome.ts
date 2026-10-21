import { dayNumber } from '../lib/dates'

/**
 * The short welcome shows once: when the app opens at its start page (a Home Screen launch or the bare
 * address, never a link to a page) and nothing has been written yet. Finishing, skipping or restoring sets
 * `welcomed`.
 */
export function shouldWelcome({ hash, welcomed, hasData }: { hash: string; welcomed: boolean; hasData: boolean }): boolean {
  const atStart = hash === '' || hash === '#' || hash === '#/'
  return atStart && !welcomed && !hasData
}

/** Days without an entry before Today says "Missed days don't matter". No streaks, no counts. */
export const AWAY_DAYS = 3

export function isBackAfterBreak(lastEntryDate: string | null, today: string): boolean {
  return lastEntryDate !== null && dayNumber(today) - dayNumber(lastEntryDate) >= AWAY_DAYS
}
