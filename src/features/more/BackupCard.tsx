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

  return (
    <section className="card">
      <h2>Backup</h2>
      <p className="muted">Your journal lives only on this phone. A backup file is your safety copy if the phone is lost or replaced.</p>
      {/* Always one line, filled in once loaded, so the buttons below never shift. */}
      <p>
        {info
          ? `${info.last ? `Last backup: ${shortDate(info.last)}` : 'No backup yet'}${
              info.changed > 0 ? ` · ${info.changed} ${info.changed === 1 ? 'change' : 'changes'} since` : ''
            }`
          : ' '}
      </p>
      <div className="stack">
        <button type="button" className="primary wide" onClick={() => open('export')}>
          Back up now
        </button>
        <button type="button" className="wide" onClick={() => open('import')}>
          Restore from a backup
        </button>
        <button type="button" className="wide" onClick={() => open('csv')}>
          Export entries as CSV
        </button>
      </div>
    </section>
  )
}
