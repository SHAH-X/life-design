import { useState } from 'react'
import { backupFileName, createBackup } from '../../db/backup'
import { lockText } from '../../db/crypto'
import { db } from '../../db/db'
import { Dialog } from '../../ui/Dialog'
import { Switch } from '../../ui/Switch'
import { FileActions } from './FileActions'

type State =
  | { kind: 'form' }
  | { kind: 'working' }
  | { kind: 'ready'; file: File; entries: number }
  | { kind: 'saved' }
  | { kind: 'error'; message: string }

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [lock, setLock] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [repeat, setRepeat] = useState('')
  const [state, setState] = useState<State>({ kind: 'form' })

  const problem = !lock
    ? null
    : passphrase.length < 8
      ? 'Use at least 8 characters.'
      : passphrase !== repeat
        ? "The two passphrases don't match."
        : null

  async function create() {
    setState({ kind: 'working' })
    try {
      const now = new Date()
      const backup = await createBackup(undefined, now)
      const json = JSON.stringify(backup)
      const body = lock ? JSON.stringify(await lockText(json, passphrase)) : json
      const file = new File([body], backupFileName(now, lock), { type: 'application/json' })
      setState({ kind: 'ready', file, entries: backup.data.entries.length })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  async function saved() {
    try {
      // Written directly (not via guardWrite): a full phone shouldn't turn a successful backup into an error.
      await db.settings.put({ key: 'lastExportAt', value: Date.now(), updatedAt: Date.now() })
    } catch {
      // The backup file itself is what matters.
    }
    setState({ kind: 'saved' })
  }

  return (
    <Dialog title="Back up" onClose={onClose}>
      {state.kind === 'form' ? (
        <>
          <p>
            Makes one file with everything in Life Design: entries, small joys, Ikigai, plans and settings. Your AI key is never
            included.
          </p>
          <Switch label="Lock with a passphrase" hint="Without a lock, anyone who gets the file can read it." checked={lock} onChange={setLock} />
          {lock ? (
            <>
              <label className="field">
                <span>Passphrase</span>
                <input type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
              </label>
              <label className="field">
                <span>Repeat passphrase</span>
                <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
              </label>
              <p className="warning small">If you forget this passphrase, the backup can't be opened. Nobody can recover it.</p>
              {problem && (passphrase || repeat) ? <p className="error small">{problem}</p> : null}
            </>
          ) : null}
          <button type="button" className="primary wide" disabled={Boolean(problem)} onClick={() => void create()}>
            Create backup file
          </button>
        </>
      ) : null}

      {state.kind === 'working' ? <p className="muted">{lock ? 'Locking your backup…' : 'Preparing your backup…'}</p> : null}

      {state.kind === 'ready' ? (
        <>
          <p>
            Backup ready: {state.entries} {state.entries === 1 ? 'entry' : 'entries'}
            {lock ? ', locked' : ''}.
          </p>
          <FileActions file={state.file} onSaved={() => void saved()} />
          <p className="muted small">
            On iPhone, choose <strong>Save to Files</strong>. <em>On My iPhone</em> keeps it on the phone; <em>iCloud Drive</em> also
            keeps a copy in iCloud.
          </p>
        </>
      ) : null}

      {state.kind === 'saved' ? (
        <>
          <p className="success">✓ Backup saved.</p>
          <button type="button" className="primary wide" onClick={onClose}>
            Done
          </button>
        </>
      ) : null}

      {state.kind === 'error' ? (
        <>
          <p className="error">The backup couldn't be made: {state.message}</p>
          <button type="button" className="wide" onClick={() => setState({ kind: 'form' })}>
            Try again
          </button>
        </>
      ) : null}
    </Dialog>
  )
}
