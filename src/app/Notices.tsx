import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { countChangesSince, firstEntryCreatedAt, getSetting, setSetting } from '../db/repo'
import { MONEY_NOTICES_SEEN, markNoticeSeen, seenNotices } from '../db/moneyNotices'
import { db } from '../db/db'
import { moneyNotice, type MoneyNotice } from '../domain/answers'
import { exportNudge, type Nudge } from '../domain/nudge'
import { useAnswerDataOnce } from '../features/ask/useAnswerData'
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

/** The one quiet line about your money (step 6): a payment far above any earlier one to the same payee, or a price that rose; undefined while
 *  loading, null when there is none. */
export function useMoneyNotice(): MoneyNotice | null | undefined {
  const data = useAnswerDataOnce()
  const seen = useLiveQuery(async () => new Set(seenNotices(await db.settings.get(MONEY_NOTICES_SEEN))), [])
  if (!data || !seen) return undefined
  return moneyNotice(data, seen)
}

/** At most one notice at the top of Today, most important first: backup, then installing, then a quiet line about your money. */
export function Notices({ nudge, money }: { nudge: Nudge; money: MoneyNotice | null }) {
  const { open } = useDialogs()
  const [installed] = useState(isStandalone)

  if (nudge.due) {
    return (
      <aside className="notice strip warn">
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
      <aside className="notice strip">
        <p>Install: Share → Add to Home Screen, so Safari keeps your data.</p>
      </aside>
    )
  }
  if (money) {
    return (
      <aside className="notice strip" aria-label="About your money">
        <p>{money.text}</p>
        <div className="row">
          <button
            type="button"
            className="primary"
            onClick={() => {
              void markNoticeSeen(money.key)
              window.location.hash = money.href
            }}
          >
            See it
          </button>
          <button type="button" onClick={() => void markNoticeSeen(money.key)}>
            Got it
          </button>
        </div>
      </aside>
    )
  }
  return null
}
