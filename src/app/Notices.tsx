import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { countChangesSince, firstEntryCreatedAt, getSetting, setSetting } from '../db/repo'
import { exportNudge, type Nudge } from '../domain/nudge'
import { DAY_MS } from '../lib/dates'
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

/** At most one notice at the top of Today, most important first: backup, then installing. */
export function Notices({ nudge }: { nudge: Nudge }) {
  const { open } = useDialogs()
  const [installed] = useState(isStandalone)

  if (nudge.due) {
    return (
      <aside className="notice warn">
        <p>{nudge.daysSinceBackup === null ? 'Nothing is backed up yet.' : `Last backup ${nudge.daysSinceBackup} days ago.`}</p>
        <div className="row">
          <button type="button" className="primary" onClick={() => open('export')}>
            Back up
          </button>
          <button type="button" onClick={() => void setSetting('nudgeSnoozedUntil', Date.now() + DAY_MS)}>
            Tomorrow
          </button>
        </div>
      </aside>
    )
  }
  if (!installed) {
    return (
      <aside className="notice">
        <p>Install: Share → Add to Home Screen, so Safari keeps your data.</p>
      </aside>
    )
  }
  return null
}
