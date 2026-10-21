import { useLiveQuery } from 'dexie-react-hooks'
import { useDialogs } from '../../app/dialogs'
import { countChangesSince, getSetting } from '../../db/repo'
import { shortDate } from '../../lib/dates'

export function BackupCard() {
  const { open } = useDialogs()
  const info = useLiveQuery(async () => {
    const last = await getSetting<number | null>('lastExportAt', null)
    return { last, changed: await countChangesSince(last) }
  }, [])

  const status = info
    ? `${info.last ? `Last backup: ${shortDate(info.last)}` : 'No backup yet'}${
        info.changed > 0 ? ` · ${info.changed} ${info.changed === 1 ? 'change' : 'changes'} since` : ''
      }`
    : ' ' // keeps the line's space while loading, so the buttons below never shift

  return (
    <section className="card">
      <p className="status-line">{status}</p>
      <div className="action-list">
        <button type="button" className="action primary" onClick={() => open('export')}>
          <span className="action-title">Back up now</span>
          <span className="action-desc">Save it to Files, or send it by AirDrop, WhatsApp or email.</span>
        </button>
        <button type="button" className="action" onClick={() => open('import')}>
          <span className="action-title">Restore from a backup file</span>
          <span className="action-desc">Adds what's missing. Deletes nothing.</span>
        </button>
      </div>
    </section>
  )
}
