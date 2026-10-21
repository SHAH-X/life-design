import { useEffect, useState } from 'react'
import { backupFileName, createBackup } from '../../db/backup'
import { lockText } from '../../db/crypto'
import { db } from '../../db/db'
import { Dialog } from '../../ui/Dialog'
import { Switch } from '../../ui/Switch'
import { FileActions } from './FileActions'

interface Prepared {
  file: File
  entries: number
}

async function prepare(password?: string): Promise<Prepared> {
  const now = new Date()
  const backup = await createBackup(undefined, now)
  const json = JSON.stringify(backup)
  const body = password ? JSON.stringify(await lockText(json, password)) : json
  return {
    file: new File([body], backupFileName(now, Boolean(password)), { type: 'application/json' }),
    entries: backup.data.entries.length,
  }
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [protect, setProtect] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [plain, setPlain] = useState<Prepared | null>(null)
  const [locked, setLocked] = useState<Prepared | null>(null)
  const [locking, setLocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // The unprotected file is prepared as soon as the dialog opens, so saving is a single tap.
  // (iPhone only opens the share menu straight from a tap, so the file must be ready first.)
  useEffect(() => {
    let cancelled = false
    prepare()
      .then((result) => {
        if (!cancelled) setPlain(result)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorText(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const passwordProblem =
    password.length < 8 ? 'Use at least 8 characters.' : password !== repeat ? "The two passwords don't match." : null

  async function protectFile() {
    setLocking(true)
    setError(null)
    try {
      setLocked(await prepare(password))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLocking(false)
    }
  }

  async function markSaved() {
    try {
      // Written directly (not via guardWrite): a full phone shouldn't turn a successful backup into an error.
      await db.settings.put({ key: 'lastExportAt', value: Date.now(), updatedAt: Date.now() })
    } catch {
      // The backup file itself is what matters.
    }
    setSaved(true)
  }

  if (saved) {
    return (
      <Dialog title="Back up" onClose={onClose}>
        <p className="success">✓ Backup saved.</p>
        <p className="muted">To bring it back later, for example on a new phone: More → Restore from a backup file.</p>
        <button type="button" className="primary wide top-gap" onClick={onClose}>
          Done
        </button>
      </Dialog>
    )
  }

  const ready = protect ? locked : plain

  return (
    <Dialog title="Back up" onClose={onClose}>
      <p>Makes one file with everything: activities, small joys, Ikigai, plans and settings.</p>

      <Switch
        label="Protect with a password"
        hint="Then only someone with the password can open the file."
        checked={protect}
        onChange={(on) => {
          setProtect(on)
          setLocked(null)
        }}
      />

      {protect && !locked ? (
        <>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setLocked(null)
              }}
            />
          </label>
          <label className="field">
            <span>Repeat password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => {
                setRepeat(e.target.value)
                setLocked(null)
              }}
            />
          </label>
          {passwordProblem && (password || repeat) ? <p className="error small">{passwordProblem}</p> : null}
          <p className="field-help">
            If you forget it, nobody can open this backup. If your iPhone suggests a strong password, it keeps it in the Passwords
            app, so you can look it up later.
          </p>
          <button type="button" className="primary wide" disabled={Boolean(passwordProblem) || locking} onClick={() => void protectFile()}>
            {locking ? 'Protecting…' : 'Protect the file'}
          </button>
        </>
      ) : null}

      {ready ? (
        <div className="top-gap">
          <FileActions file={ready.file} onSaved={() => void markSaved()} />
          <p className="muted small top-gap">
            In the menu that opens, tap <strong>Save to Files</strong> (pick <em>On My iPhone</em> or iCloud Drive, then Save), or
            send it by AirDrop, WhatsApp or email.
          </p>
        </div>
      ) : null}

      {!ready && !protect && !error ? <p className="muted">Preparing your backup…</p> : null}
      {error ? <p className="error">The backup couldn't be made: {error}</p> : null}
    </Dialog>
  )
}
