import { useState } from 'react'
import { type InvestBrought, bringInInvesting, nameInvestmentAccounts } from '../../db/invest'
import { type BroughtIn, bringInStatement } from '../../db/statements'
import { readStatement, type StatementProblem } from '../../domain/statements'
import { notMatchingWords } from '../../domain/trading212'
import { formatRecentPeriod } from '../../lib/dates'
import { PdfError, readPdf } from '../../lib/pdfText'
import { Dialog } from '../../ui/Dialog'
import { useAccountNames } from './useAccountNames'

// Bringing in a statement (v0.20): its PDF read on the phone (src/lib/pdfText.ts, src/domain/statements.ts) and its
// lines kept here, each once (src/db/statements.ts). Nothing is sent anywhere. iPhone's share menu can't hand a file
// to a Home Screen web app, so it's Save to Files in the bank's app, then chosen here.

const PROBLEMS: Record<StatementProblem, string> = {
  'no-text': 'This PDF has no words to read: it may be a scan or a photo. Save the statement from your bank’s app as a PDF and try again.',
  'no-table': 'No transactions were found in this PDF. Choose the statement itself, not a letter or a summary.',
}

/** What became of one file: the accounts it brought in, or why it wasn't. */
type Outcome = { file: string; brought: BroughtIn[]; invested: InvestBrought[] } | { file: string; error: string }

type State = { kind: 'choose'; error?: string } | { kind: 'reading'; at: number; of: number } | { kind: 'done'; outcomes: Outcome[] }

// The bank lines, Trading 212's lines and the account names are kept in separate steps: if a later one fails the first may be in
// already (audit 2026-11-20), so this does not claim nothing changed. A line already here is never added twice, so trying again is safe.
const COULDNT = 'This statement couldn’t be brought in completely. Some of it may be here already; try again, and nothing is added twice.'

/** One statement's PDF read and kept: its accounts, or the words for why not. Nothing is changed when it fails. */
async function bringIn(file: File): Promise<Outcome> {
  try {
    const read = readStatement(await readPdf(file))
    if ('problem' in read) return { file: file.name, error: PROBLEMS[read.problem] }
    const brought = await bringInStatement(read.accounts)
    const invested = read.investing?.length ? await bringInInvesting(read.investing) : []
    await nameInvestmentAccounts(read.labels)
    return { file: file.name, brought, invested }
  } catch (error) {
    return { file: file.name, error: error instanceof PdfError ? error.message : COULDNT }
  }
}

/** Trading 212's trades, dividends and interest (v0.36.0): "256 trades · 11 dividends · 39 interest · 300 new". */
function toldInvesting(b: InvestBrought): string {
  const n = (count: number, one: string, many: string) => (count ? `${count} ${count === 1 ? one : many}` : '')
  return [
    n(b.trades, 'trade', 'trades'),
    n(b.dividends, 'dividend', 'dividends'),
    n(b.interest, 'interest line', 'interest lines'),
    b.added || !b.already ? `${b.added} new` : '',
    b.already ? `${b.already} already here` : '',
    b.mismatches.length ? `doesn’t match the statement’s totals: ${b.mismatches.join('; ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** "4 new · 1–30 Sep", "12 already here", "1 doesn’t match its printed balance". */
function told(b: BroughtIn): string {
  return [
    b.added || !b.already ? `${b.added} new` : '',
    b.already ? `${b.already} already here` : '',
    formatRecentPeriod(b.from, b.to),
    b.notAdding ? notMatchingWords(b.account, b.notAdding) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

export function StatementImport({ onClose }: { onClose: () => void }) {
  const names = useAccountNames()
  const [state, setState] = useState<State>({ kind: 'choose' })
  const choose = async (files: readonly File[]) => {
    if (!files.length) return
    const outcomes: Outcome[] = []
    for (const [i, file] of files.entries()) {
      setState({ kind: 'reading', at: i + 1, of: files.length })
      outcomes.push(await bringIn(file))
    }
    // One file that couldn't be read leaves the choice open with its reason; several are told file by file.
    const only = outcomes.length === 1 ? outcomes[0]! : null
    setState(only && 'error' in only ? { kind: 'choose', error: only.error } : { kind: 'done', outcomes })
  }
  return (
    <Dialog title="Bring in a statement" onClose={onClose}>
      {state.kind === 'choose' ? (
        <>
          <p>PDF statements from your banks or cards, one or several. They’re read on this phone and sent nowhere.</p>
          <label className="button primary wide">
            Choose statements
            <input
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="visually-hidden"
              onChange={async (event) => {
                const files = [...(event.target.files ?? [])]
                try {
                  await choose(files)
                } finally {
                  event.target.value = ''
                }
              }}
            />
          </label>
          {state.error ? (
            <div className="notice warn top-gap" role="alert">
              <p>{state.error}</p>
            </div>
          ) : null}
        </>
      ) : null}
      {state.kind === 'reading' ? <p className="muted">{state.of > 1 ? `Reading statement ${state.at} of ${state.of}…` : 'Reading the statement…'}</p> : null}
      {state.kind === 'done' ? (
        <>
          <ul className="plain-list" aria-label="Brought in">
            {state.outcomes.flatMap((o) =>
              'error' in o
                ? [
                    <li key={o.file}>
                      <strong>{o.file}</strong>: {o.error}
                    </li>,
                  ]
                : [
                    ...o.brought.map((b) => (
                      <li key={`${o.file}:${b.account}`}>
                        <strong>{names?.get(b.account) ?? b.account}</strong>: {told(b)}
                      </li>
                    )),
                    ...o.invested.map((b) => (
                      <li key={`${o.file}:${b.account}:investing`}>
                        <strong>{names?.get(b.account) ?? b.account} investing</strong>: {toldInvesting(b)}
                      </li>
                    )),
                  ],
            )}
          </ul>
          <button type="button" className="primary wide top-gap" onClick={onClose}>
            Done
          </button>
        </>
      ) : null}
    </Dialog>
  )
}
