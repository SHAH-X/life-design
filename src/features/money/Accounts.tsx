import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { formatRecentPeriod } from '../../lib/dates'
import { StatementImport } from './StatementImport'

// Your accounts (v0.20, step 1 of Money): each account a statement was brought in for, its lines and the days they
// cover, and "Bring in a statement". Money's sums come in step 2.

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
  const [importing, setImporting] = useState(false)
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        Your accounts
      </h2>
      {list?.length ? (
        <div className="card">
          <ul className="plain-list compact">
            {list.map((a) => (
              <li key={a.name}>
                {a.name}
                <span className="muted small">
                  {' '}
                  · {a.lines === 1 ? '1 line' : `${a.lines} lines`} · {formatRecentPeriod(a.from, a.to)}
                  {a.notAdding ? ` · ${a.notAdding} ${a.notAdding === 1 ? 'doesn’t match its' : 'don’t match their'} printed balance` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : list ? (
        <p className="muted small">Bring in your bank and card statements to see all your spending.</p>
      ) : null}
      <button type="button" className="wide top-gap" onClick={() => setImporting(true)}>
        Bring in a statement
      </button>
      {importing ? <StatementImport onClose={() => setImporting(false)} /> : null}
    </section>
  )
}
