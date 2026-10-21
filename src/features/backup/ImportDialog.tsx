import { useState } from 'react'
import { applyImport, type DetectedFile, detectFile, type ImportPlan, planImport, type RawData, type TablePlan } from '../../db/backup'
import { type LockedEnvelope, unlockText, WrongPassphraseError } from '../../db/crypto'
import { TABLE_LABELS, TABLE_NAMES } from '../../db/types'
import { Dialog } from '../../ui/Dialog'

type State =
  | { kind: 'choose'; error?: string }
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
  const [passphrase, setPassphrase] = useState('')

  async function handle(detected: DetectedFile) {
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
        setState({ kind: 'choose', error: 'This backup comes from a newer version of Life Design. Update the app, then try again.' })
        return
      case 'unknown':
        setState({ kind: 'choose', error: "This file isn't a Life Design backup." })
    }
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    try {
      await handle(detectFile(await file.text()))
    } catch {
      setState({ kind: 'choose', error: "That file couldn't be read." })
    }
  }

  async function unlock(envelope: LockedEnvelope) {
    setState({ kind: 'unlock', envelope, busy: true })
    try {
      const detected = detectFile(await unlockText(envelope, passphrase))
      if (detected.format !== 'backup') {
        setState({ kind: 'choose', error: "The unlocked file isn't a Life Design backup." })
        return
      }
      await handle(detected)
    } catch (error) {
      const message = error instanceof WrongPassphraseError ? error.message : "This file couldn't be unlocked."
      setState({ kind: 'unlock', envelope, error: message })
    }
  }

  async function runImport(raw: RawData) {
    setState({ kind: 'importing' })
    try {
      setState({ kind: 'done', plan: await applyImport(raw) })
    } catch {
      setState({ kind: 'choose', error: 'The import failed, so nothing was changed.' })
    }
  }

  return (
    <Dialog title="Restore" onClose={onClose}>
      {state.kind === 'choose' ? (
        <>
          <p>Choose a Life Design backup file. Backups from the earlier one-file version (v1) work too.</p>
          <p className="muted small">Restoring adds and updates entries. It never deletes anything already on this phone.</p>
          <label className="button primary wide">
            Choose backup file
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(event) => void chooseFile(event.target.files?.[0])}
            />
          </label>
          {state.error ? <p className="error">{state.error}</p> : null}
        </>
      ) : null}

      {state.kind === 'unlock' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void unlock(state.envelope)
          }}
        >
          <p>This backup is locked.</p>
          <label className="field">
            <span>Passphrase</span>
            <input type="password" autoComplete="current-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
          {state.error ? <p className="error">{state.error}</p> : null}
          <button type="submit" className="primary wide" disabled={!passphrase || state.busy}>
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
              Import
            </button>
          ) : (
            <p className="muted">Nothing new in this file: everything is already on this phone.</p>
          )}
        </>
      ) : null}

      {state.kind === 'importing' ? <p className="muted">Importing…</p> : null}

      {state.kind === 'done' ? (
        <>
          <p className="success">✓ Imported.</p>
          <Summary plan={state.plan} />
          <button type="button" className="primary wide" onClick={onClose}>
            Done
          </button>
        </>
      ) : null}
    </Dialog>
  )
}
