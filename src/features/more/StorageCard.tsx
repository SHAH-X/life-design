import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { formatBytes, isPersisted, isStandalone, storageUsageBytes } from '../../lib/storage'

export function StorageCard() {
  const [status, setStatus] = useState<{ persisted: boolean | null; usage: number | null } | null>(null)
  const [installed] = useState(isStandalone)
  const counts = useLiveQuery(async () => ({ entries: await db.entries.count(), days: await db.days.count() }), [])

  useEffect(() => {
    void Promise.all([isPersisted(), storageUsageBytes()]).then(([persisted, usage]) => setStatus({ persisted, usage }))
  }, [])

  const protection =
    status === null ? '…' : status.persisted === true ? 'Yes' : status.persisted === false ? 'No' : 'Unknown on this browser'

  return (
    <section className="card">
      <div className="kv">
        <span>Installed as an app</span>
        <strong>{installed ? 'Yes' : 'No'}</strong>
      </div>
      <div className="kv">
        <span>Protected from clean-up</span>
        <strong>{protection}</strong>
      </div>
      <div className="kv">
        <span>Stored</span>
        <strong>
          {counts
            ? `${counts.entries} ${counts.entries === 1 ? 'entry' : 'entries'}, ${counts.days} ${counts.days === 1 ? 'small joy' : 'small joys'}`
            : '…'}
          {status?.usage != null ? ` · ${formatBytes(status.usage)}` : ''}
        </strong>
      </div>
      {status?.persisted === false ? <p className="muted small top-gap">iOS may clear unprotected data when space runs low. Back up often.</p> : null}
    </section>
  )
}
