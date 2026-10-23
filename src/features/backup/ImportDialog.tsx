import { useState } from 'react'
import {
  applyImport,
  type DetectedFile,
  detectFile,
  type FileProblem,
  type ImportPlan,
  planImport,
  type RawData,
  type TablePlan,
} from '../../db/backup'
import { type LockedEnvelope, unlockText, WrongPassphraseError } from '../../db/crypto'
import { TABLE_LABELS, TABLE_NAMES } from '../../db/types'
import { formatBytes } from '../../lib/storage'
import { Dialog } from '../../ui/Dialog'

const PROBLEMS: Record<FileProblem, string> = {
  empty: 'This file is empty.',
  'web-page': 'This is a web page, not a backup. Make a new backup and save it with “Save to Files”.',
  spreadsheet: 'This is the spreadsheet (CSV) export. It is for reading in Numbers or Excel and can’t be restored. Choose a backup file instead.',
  calendar: 'This is the calendar reminder file, not a backup.',
  'not-json': 'This isn’t a Life Design backup file.',
  damaged: 'This looks like a Life Design backup, but it is incomplete or damaged, so it can’t be restored.',
  'damaged-lock': 'This is a password-protected backup, but part of it is missing or changed, so it can’t be opened.',
  'other-json': 'This is a data file from another app, not a Life Design backup.',
}

interface Chosen {
  name: string
  size: number
}

type State =
  | { kind: 'choose'; error?: string; chosen?: Chosen }
  | { kind: 'unlock'; envelope: LockedEnvelope; error?: string; busy?: boolean }
  | { kind: 'preview'; raw: RawData; plan: ImportPlan; fromV1: boolean; skipped: number }
  | { kind: 'importing' }
  | { kind: 'done'; plan: ImportPlan }

function describe(plan: TablePlan): string {
  return [
    plan.added ? `${plan.added} new` : '',
    plan.updated ? `${plan.updated} updated` : '',
    plan.unchanged ? `${plan.unchanged} already here` : '',
    plan.skipped ? `${plan.skipped} skipped` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function Summary({ plan }: { plan: ImportPlan }) {
  const rows = TABLE_NAMES.filter((name) => plan.tables[name].incoming > 0)
  return (
    <ul className="plain-list">
      {rows.map((name) => (
        <li key={name}>
          <strong>{TABLE_LABELS[name]}</strong>: {describe(plan.tables[name])}
        </li>
      ))}
    </ul>
  )
}

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: 'choose' })
  const [password, setPassword] = useState('')

  async function handle(detected: DetectedFile, chosen?: Chosen) {
    switch (detected.format) {
      case 'locked':
        setState({ kind: 'unlock', envelope: detected.envelope })
        return
      case 'backup':
        setState({ kind: 'preview', raw: detected.raw, plan: await planImport(detected.raw), fromV1: false, skipped: 0 })
        return
      case 'v1':
        setState({ kind: 'preview', raw: detected.raw, plan: await planImport(detected.raw), fromV1: true, skipped: detected.skipped })
        return
      case 'too-new':
        setState({ kind: 'choose', error: 'This backup comes from a newer version of Life Design. Update the app, then try again.', chosen })
        return
      case 'unknown':
        setState({ kind: 'choose', error: PROBLEMS[detected.problem], chosen })
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    const chosen = { name: file.name, size: file.size }
    let text: string
    try {
      text = await file.text()
    } catch {
      setState({ kind: 'choose', error: 'That file couldn’t be read.', chosen })
      return
    }
    await handle(detectFile(text), chosen)
  }

  async function unlock(envelope: LockedEnvelope) {
    setState({ kind: 'unlock', envelope, busy: true })
    let text: string
    try {
      text = await unlockText(envelope, password)
    } catch (error) {
      const message = error instanceof WrongPassphraseError ? error.message : 'This file couldn’t be unlocked.'
      setState({ kind: 'unlock', envelope, error: message })
      return
    }
    const detected = detectFile(text)
    if (detected.format !== 'backup') {
      setState({ kind: 'choose', error: 'The password was right, but the backup inside is damaged, so it can’t be restored.' })
      return
    }
    await handle(detected)
  }

  async function runImport(raw: RawData) {
    setState({ kind: 'importing' })
    try {
      setState({ kind: 'done', plan: await applyImport(raw) })
    } catch {
      setState({ kind: 'choose', error: 'The restore failed, so nothing was changed.' })
    }
  }

  return (
    <Dialog title="Restore" onClose={onClose}>
      {state.kind === 'choose' ? (
        <>
          <p>Choose a Life Design backup file. Backups from the earlier one-file version (v1) work too.</p>
          <p className="muted small">Restoring adds and updates. It never deletes anything already on this phone.</p>
          <label className="button primary wide">
            Choose backup file
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(event) => {
                void chooseFile(event.target.files?.[0])
                event.target.value = '' // so choosing the same file again still works
              }}
            />
          </label>
          {state.error ? (
            <div className="notice warn top-gap" role="alert">
              <p>{state.error}</p>
              {state.chosen ? (
                <p className="small muted">
                  File: {state.chosen.name} · {formatBytes(state.chosen.size)}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {state.kind === 'unlock' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void unlock(state.envelope)
          }}
        >
          <p>This backup is protected with a password.</p>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <p className="field-help">
            If your iPhone suggested a strong password when you made the backup, it's in the Passwords app under{' '}
            {window.location.hostname}.
          </p>
          {state.error ? <p className="error">{state.error}</p> : null}
          <button type="submit" className="primary wide" disabled={!password || state.busy}>
            {state.busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      ) : null}

      {state.kind === 'preview' ? (
        <>
          {state.fromV1 ? (
            <p className="notice">
              From the earlier v1 app: energy (−5…+5) and engagement (0–10) are converted to the new 5-point scales.
              {state.skipped ? ` ${state.skipped} unreadable items will be left out.` : ''}
            </p>
          ) : null}
          <Summary plan={state.plan} />
          {state.plan.changes > 0 ? (
            <button type="button" className="primary wide" onClick={() => void runImport(state.raw)}>
              Restore
            </button>
          ) : (
            <p className="muted">Nothing new in this file: everything in it is already on this phone.</p>
          )}
        </>
      ) : null}

      {state.kind === 'importing' ? <p className="muted">Restoring…</p> : null}

      {state.kind === 'done' ? (
        <>
          <p className="success">✓ Restored.</p>
          <Summary plan={state.plan} />
          <button type="button" className="primary wide" onClick={onClose}>
            Done
          </button>
        </>
      ) : null}
    </Dialog>
  )
}
