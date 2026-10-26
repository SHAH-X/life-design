import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { nameAccount, removeAccount } from '../../db/statements'
import { formatRecentPeriod } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { StatementImport } from './StatementImport'
import { useAccountNames } from './useAccountNames'

// Your accounts (v0.20, step 1 of Money): each account a statement was brought in for, its lines and the days they
// cover, a name of your own for it, and "Bring in a statement".

interface Account {
  name: string
  lines: number
  from: string
  to: string
  notAdding: number
}

async function accounts(): Promise<Account[]> {
  const [lines, statements] = await Promise.all([db.bankLines.toArray(), db.statements.toArray()])
  const byName = new Map<string, Account>()
  for (const s of statements) {
    const a = byName.get(s.account) ?? { name: s.account, lines: 0, from: s.from, to: s.to, notAdding: 0 }
    a.from = s.from < a.from ? s.from : a.from
    a.to = s.to > a.to ? s.to : a.to
    byName.set(s.account, a)
  }
  for (const line of lines) {
    const a = byName.get(line.account)
    if (!a) continue
    a.lines += 1
    if (!line.adds) a.notAdding += 1
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function Accounts() {
  const list = useLiveQuery(accounts, [])
  const names = useAccountNames()
  const [importing, setImporting] = useState(false)
  const [naming, setNaming] = useState<string | null>(null)
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        Your accounts
      </h2>
      {list?.length && names ? (
        <div className="card">
          <ul className="plain-list compact">
            {list.map((a) => (
              <li key={a.name} className="account-row">
                <span>
                  {names.get(a.name) ?? a.name}
                  <span className="muted small">
                    {' '}
                    · {a.lines === 1 ? '1 line' : `${a.lines} lines`} · {formatRecentPeriod(a.from, a.to)}
                    {a.notAdding ? ` · ${a.notAdding} ${a.notAdding === 1 ? 'doesn’t match its' : 'don’t match their'} printed balance` : ''}
                  </span>
                </span>
                <button type="button" className="small-link" aria-label={`Rename ${names.get(a.name) ?? a.name}`} onClick={() => setNaming(a.name)}>
                  Rename
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : list && names ? (
        <p className="muted small">Bring in your bank and card statements to see all your spending.</p>
      ) : null}
      <button type="button" className="wide top-gap" onClick={() => setImporting(true)}>
        Bring in a statement
      </button>
      {importing ? <StatementImport onClose={() => setImporting(false)} /> : null}
      {naming && names ? (
        <RenameSheet
          title="Rename this account"
          shown={names.get(naming) ?? naming}
          hint={`Its statement says ${naming}. Left empty, it’s named by its bank. Remove takes out the account and all its lines; bringing its statements in again puts them back.`}
          onSave={(name) => nameAccount(naming, name)}
          onRemove={() => removeAccount(naming)}
          onClose={() => setNaming(null)}
        />
      ) : null}
    </section>
  )
}

/** A name of your own for an account ("Joint account") or a payee you move money to ("First Direct"): left empty, it's
 *  the bank's name again. */
export function RenameSheet(props: { title: string; shown: string; hint: string; onSave: (name: string) => Promise<void>; onRemove?: () => Promise<void>; onClose: () => void }) {
  const { title, shown, hint, onSave, onRemove, onClose } = props
  const [name, setName] = useState(shown)
  const [sure, setSure] = useState(false)
  const id = useId()
  const save = async () => {
    await onSave(name)
    onClose()
  }
  const remove = async () => {
    if (!sure) return setSure(true)
    await onRemove?.()
    onClose()
  }
  const footer = onRemove ? (
    <div className="footer-row">
      <button type="button" className="link" onClick={() => void remove()}>
        {sure ? 'Tap again to remove it' : 'Remove'}
      </button>
      <button type="button" className="primary" onClick={() => void save()}>
        Save
      </button>
    </div>
  ) : (
    <button type="button" className="primary wide" onClick={() => void save()}>
      Save
    </button>
  )
  return (
    <Dialog title={title} onClose={onClose} footer={footer} full>
      <label className="question-text" htmlFor={id}>
        What do you call it?
      </label>
      <input id={id} data-autofocus value={name} maxLength={40} autoCapitalize="sentences" onChange={(e) => setName(e.target.value)} />
      <p className="muted small">{hint}</p>
    </Dialog>
  )
}
