import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { Period } from '../analysis/stats'
import { countChangesSince, firstEntryCreatedAt, getSetting, setSetting } from '../db/repo'
import { exportNudge, type Nudge } from '../domain/nudge'
import { DAY_MS, formatPeriod } from '../lib/dates'
import { navigate } from '../lib/route'
import { isStandalone } from '../lib/storage'
import { useDialogs } from './dialogs'

/** The 7-day backup reminder; undefined while loading. */
export function useExportNudge(): Nudge | undefined {
  return useLiveQuery(async () => {
    const lastExportAt = await getSetting<number | null>('lastExportAt', null)
    const snoozedUntil = await getSetting<number | null>('nudgeSnoozedUntil', null)
    const [changedSinceExport, firstEntryAt] = await Promise.all([countChangesSince(lastExportAt), firstEntryCreatedAt()])
    return exportNudge({ now: Date.now(), lastExportAt, firstEntryAt, changedSinceExport, snoozedUntil })
  }, [])
}

/** Top-of-Today notices: install the app, a due review, and the backup reminder. */
export function Notices({ nudge, reviewDue }: { nudge: Nudge; reviewDue: Period | null }) {
  const { open } = useDialogs()
  const [installed] = useState(isStandalone)

  return (
    <>
      {reviewDue ? (
        <aside className="notice">
          <p>
            <strong>Your review is due.</strong> About 10 minutes, looking back over {formatPeriod(reviewDue.start, reviewDue.end)}.
          </p>
          <button type="button" className="primary" onClick={() => navigate('review')}>
            Start review
          </button>
        </aside>
      ) : null}
      {!installed ? (
        <aside className="notice">
          <p>
            <strong>Install the app:</strong> in Safari, tap Share → Add to Home Screen. In a Safari tab, Safari can delete this
            site's data after 7 days without a visit.
          </p>
        </aside>
      ) : null}
      {nudge.due ? (
        <aside className="notice warn">
          <p>
            <strong>Time for a backup.</strong>{' '}
            {nudge.daysSinceBackup === null
              ? `Nothing is backed up yet: ${nudge.changed} entries and notes are only on this phone.`
              : `Last backup ${nudge.daysSinceBackup} days ago · ${nudge.changed} changes since.`}
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={() => open('export')}>
              Back up now
            </button>
            <button type="button" onClick={() => void setSetting('nudgeSnoozedUntil', Date.now() + DAY_MS)}>
              Tomorrow
            </button>
          </div>
        </aside>
      ) : null}
    </>
  )
}
