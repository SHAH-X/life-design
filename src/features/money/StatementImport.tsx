import { useId, useRef, useState } from 'react'
import { type BroughtIn, bringInStatement } from '../../db/statements'
import { readStatement, type StatementProblem } from '../../domain/statements'
import { formatRecentPeriod } from '../../lib/dates'
import { PdfError, readPdf } from '../../lib/pdfText'
import { useScrollLock } from '../../ui/useScrollLock'
import { useAccountNames } from './useAccountNames'

// Bringing in a statement (v0.20): its PDF read on the phone (src/lib/pdfText.ts, src/domain/statements.ts) and its
// lines kept here, each once (src/db/statements.ts). Nothing is sent anywhere. iPhone's share menu can't hand a file
// to a Home Screen web app, so it's Save to Files in the bank's app, then chosen here.

const PROBLEMS: Record<StatementProblem, string> = {
  'no-text': 'This PDF has no words to read: it may be a scan or a photo. Save the statement from your bank’s app as a PDF and try again.',
  'no-table': 'No transactions were found in this PDF. Choose the statement itself, not a letter or a summary.',
}

type State = { kind: 'choose'; error?: string } | { kind: 'reading' } | { kind: 'done'; brought: BroughtIn[] }

/** "4 new · 1–30 Sep", "12 already here", "1 doesn’t match its printed balance". */
function told(b: BroughtIn): string {
  return [
    b.added || !b.already ? `${b.added} new` : '',
    b.already ? `${b.already} already here` : '',
    formatRecentPeriod(b.from, b.to),
    b.notAdding ? `${b.notAdding} ${b.notAdding === 1 ? 'doesn’t match its' : 'don’t match their'} printed balance` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function StatementImport({ onClose }: { onClose: () => void }) {
  const names = useAccountNames()
  const inputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const [state, setState] = useState<State>({ kind: 'choose' })
  useScrollLock()
  const choose = async (file: File | undefined) => {
    if (!file) return
    setState({ kind: 'reading' })
    try {
      const read = readStatement(await readPdf(file))
      if ('problem' in read) setState({ kind: 'choose', error: PROBLEMS[read.problem] })
      else setState({ kind: 'done', brought: await bringInStatement(read.accounts) })
    } catch (error) {
      setState({ kind: 'choose', error: error instanceof PdfError ? error.message : 'This statement couldn’t be brought in, so nothing was changed. Try again.' })
    }
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="sheet">
      <div className="sheet-inner">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header">
          <h2 id={titleId}>Bring in a statement</h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              void choose(file)
              event.target.value = '' // so choosing the same file again still works
            }}
          />
          {state.kind === 'choose' ? (
            <>
              <p>A PDF statement from your bank or card. It’s read on this phone and sent nowhere.</p>
              <button type="button" className="button primary wide" onClick={() => inputRef.current?.click()}>
                Choose a statement
              </button>
              {state.error ? (
                <div className="notice warn top-gap" role="alert">
                  <p>{state.error}</p>
                </div>
              ) : null}
            </>
          ) : null}
          {state.kind === 'reading' ? <p className="muted">Reading the statement…</p> : null}
          {state.kind === 'done' ? (
            <>
              <ul className="plain-list" aria-label="Brought in">
                {state.brought.map((b) => (
                  <li key={b.account}>
                    <strong>{names?.get(b.account) ?? b.account}</strong>: {told(b)}
                  </li>
                ))}
              </ul>
              <button type="button" className="primary wide top-gap" onClick={onClose}>
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
