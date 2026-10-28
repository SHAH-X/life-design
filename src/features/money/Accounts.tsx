import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { CLOSED_ACCOUNTS, markClosed, nameAccount, ownPayeesOf, removeAccount } from '../../db/statements'
import type { StatementRecord } from '../../db/types'
import { notBroughtIn } from '../../domain/money'
import { formatPeriod, toDateKey } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { StatementImport } from './StatementImport'
import { useAccountNames } from './useAccountNames'

// Your accounts (v0.20, step 1 of Money): each account a statement was brought in for, its lines and the days they
// cover and the days still to bring in, a name of your own for it, whether it's closed, and "Bring in a statement".

interface Account {
  name: string
  lines: number
  from: string
  to: string
  notAdding: number
  statements: StatementRecord[]
  closed: boolean
}

async function accounts(): Promise<Account[]> {
  const [lines, statements, closedSetting] = await Promise.all([db.bankLines.toArray(), db.statements.toArray(), db.settings.get(CLOSED_ACCOUNTS)])
  const closed = new Set(ownPayeesOf(closedSetting))
  const byName = new Map<string, Account>()
  for (const s of statements) {
    const a = byName.get(s.account) ?? { name: s.account, lines: 0, from: s.from, to: s.to, notAdding: 0, statements: [], closed: closed.has(s.account) }
    a.statements.push(s)
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
  const [naming, setNaming] = useState<Account | null>(null)
  const today = toDateKey(new Date())
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        Your accounts
      </h2>
      {list?.length && names ? (
        <div className="card">
          <ul className="plain-list compact">
            {list.map((a) => {
              const missing = notBroughtIn(a.statements, today, a.closed)
              return (
                <li key={a.name} className="account-row account-card">
                  <div className="account-card-body">
                    <div className="account-card-header">
                      <span className="account-name">{names.get(a.name) ?? a.name}</span>
                      {a.closed ? (
                        <span className="account-badge closed" aria-hidden="true">Closed</span>
                      ) : missing.length ? (
                        <span className="account-badge missing" aria-hidden="true">Needs statement</span>
                      ) : (
                        <span className="account-badge synced" aria-hidden="true">Up to date</span>
                      )}
                    </div>
                    <span className="muted small account-period">
                      {formatPeriod(a.from, a.to)}
                      {a.closed ? ' · Closed' : ''}
                      {a.notAdding ? ` · ${a.notAdding} ${a.notAdding === 1 ? 'doesn’t match its' : 'don’t match their'} printed balance` : ''}
                    </span>
                    {missing.length ? <span className="muted small account-missing">Missing: {missing.map((g) => formatPeriod(g.from, g.to)).join('; ')}</span> : null}
                  </div>
                  <button type="button" className="small-link account-change-btn" aria-label={`Change ${names.get(a.name) ?? a.name}`} onClick={() => setNaming(a)}>
                    Change
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : list && names ? (
        <p className="muted small account-empty">Bring in your bank and card statements to see all your spending.</p>
      ) : null}
      <button type="button" className="wide top-gap" onClick={() => setImporting(true)}>
        Bring in a statement
      </button>
      {importing ? <StatementImport onClose={() => setImporting(false)} /> : null}
      {naming && names ? (
        <RenameSheet
          title="Change this account"
          shown={names.get(naming.name) ?? naming.name}
          hint={`Its statement says ${naming.name}. Left empty, it’s named by its bank. Remove takes out the account and all its lines; bringing its statements in again puts them back.`}
          closed={naming.closed}
          onSave={async (name, closed) => {
            await nameAccount(naming.name, name)
            await markClosed(naming.name, closed ?? false)
          }}
          onRemove={() => removeAccount(naming.name)}
          onClose={() => setNaming(null)}
        />
      ) : null}
    </section>
  )
}

/** A name of your own for an account ("Joint account") or a payee you move money to ("First Direct"): left empty, it's
 *  the bank's name again. */
export function RenameSheet(props: {
  title: string
  shown: string
  hint: string
  /** Whether the account is closed, for a sheet that asks (an account's, not a payee's). */
  closed?: boolean
  onSave: (name: string, closed?: boolean) => Promise<void>
  onRemove?: () => Promise<void>
  onClose: () => void
}) {
  const { title, shown, hint, onSave, onRemove, onClose } = props
  const [name, setName] = useState(shown)
  const [closed, setClosed] = useState(props.closed)
  const [sure, setSure] = useState(false)
  const id = useId()
  const save = async () => {
    await onSave(name, closed)
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
      {closed !== undefined ? (
        <label className="check top-gap">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          This account is closed: nothing to bring in after its last statement
        </label>
      ) : null}
      <p className="muted small">{hint}</p>
    </Dialog>
  )
}
