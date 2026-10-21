import { buildInfo, formatBuildInfo } from '../../lib/buildInfo'
import { BackupCard } from './BackupCard'
import { DeleteAllCard } from './DeleteAllCard'
import { ExportCard } from './ExportCard'
import { RemindersCard } from './RemindersCard'
import { StorageCard } from './StorageCard'
import { useReminderSettings } from './useReminderSettings'

export function MoreScreen() {
  const reminders = useReminderSettings()

  // Render only once the reminder settings have loaded, so the cards below never jump.
  if (reminders === undefined) return <div className="loading" aria-busy="true" />

  return (
    <>
      <h1>More</h1>
      <RemindersCard settings={reminders} />
      <BackupCard />
      <StorageCard />
      <ExportCard />
      <section className="card">
        <h2>Your data</h2>
        <p>
          Everything you log stays on this phone. Nothing is sent anywhere unless you choose to export a file or, later, run an AI
          review.
        </p>
      </section>
      <DeleteAllCard />
      <p className="muted small">{formatBuildInfo(buildInfo)}</p>
    </>
  )
}
