import { describe, expect, it } from 'vitest'
import { exportNudge } from '../../src/domain/nudge'
import { DAY_MS } from '../../src/lib/dates'

const now = Date.UTC(2026, 9, 21, 12)
const base = { now, lastExportAt: null, firstEntryAt: now - DAY_MS, changedSinceExport: 5, snoozedUntil: null }

describe('export nudge', () => {
  it('waits 7 days after the first entry when there has never been a backup', () => {
    expect(exportNudge({ ...base, firstEntryAt: now - 6 * DAY_MS })).toEqual({ due: false, daysSinceBackup: null, changed: 5 })
    expect(exportNudge({ ...base, firstEntryAt: now - 7 * DAY_MS })).toEqual({ due: true, daysSinceBackup: null, changed: 5 })
  })

  it('is due 7 or more days after the last backup when something changed', () => {
    expect(exportNudge({ ...base, lastExportAt: now - 9 * DAY_MS, changedSinceExport: 31 })).toEqual({
      due: true,
      daysSinceBackup: 9,
      changed: 31,
    })
    expect(exportNudge({ ...base, lastExportAt: now - 6 * DAY_MS })).toMatchObject({ due: false, daysSinceBackup: 6 })
  })

  it('stays quiet when nothing changed since the last backup', () => {
    expect(exportNudge({ ...base, lastExportAt: now - 30 * DAY_MS, changedSinceExport: 0 })).toMatchObject({ due: false })
  })

  it('stays quiet when there are no entries yet', () => {
    expect(exportNudge({ ...base, firstEntryAt: null, changedSinceExport: 0 })).toMatchObject({ due: false })
  })

  it('respects "remind me tomorrow"', () => {
    const overdue = { ...base, lastExportAt: now - 10 * DAY_MS }
    expect(exportNudge({ ...overdue, snoozedUntil: now + 1000 })).toMatchObject({ due: false })
    expect(exportNudge({ ...overdue, snoozedUntil: now - 1000 })).toMatchObject({ due: true })
  })
})
