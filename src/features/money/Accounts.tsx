import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { accountNamesOf, CARD_ACCOUNTS, CLOSED_ACCOUNTS, markClosed, nameAccount, ownPayeesOf, removeAccount } from '../../db/statements'
import type { StatementRecord } from '../../db/types'
import { notBroughtIn } from '../../domain/money'
import { formatPeriod, toDateKey } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { useMoney } from './MoneyContext'
import { useAccountNames } from './useAccountNames'

// Your accounts (v0.20, step 1 of Money): each account a statement was brought in for, its lines and the days they
// cover and the days still to bring in, a name of your own for it, whether it's closed, the cards you said are it
// (v0.24.0, said on a receipt, where the number shows), and "Bring in a statement".

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
  const cards = useLiveQuery(async () => accountNamesOf(await db.settings.get(CARD_ACCOUNTS)), [])
  const { importStatement } = useMoney()
  const [naming, setNaming] = useState<Account | null>(null)
  const today = toDateKey(new Date())
  const headingId = useId()
  const some = Boolean(list?.length && names)
  return (
    <section className="acc-block" aria-labelledby={headingId}>
      <div className="acc-block-head">
        <h2 id={headingId}>Your accounts</h2>
        {some ? (
          <button type="button" className="acc-link" onClick={importStatement}>
            Bring in a statement
          </button>
        ) : null}
      </div>
      {list?.length && names ? (
        <ul className="acc-list">
          {list.map((a) => {
            const missing = notBroughtIn(a.statements, today, a.closed)
            const state = a.closed ? 'closed' : missing.length ? 'missing' : 'ok'
            const itsCards = Object.entries(cards ?? {}).flatMap(([last4, account]) => (account === a.name ? [last4] : [])).sort()
            return (
              <li key={a.name} className="acc-li acc-account">
                <div className="acc-account-main">
                  <div className="acc-account-top">
                    <span className="acc-account-name">{names.get(a.name) ?? a.name}</span>
                    <span className="acc-state" data-state={state}>
                      {a.closed ? 'Closed' : missing.length ? 'Needs statement' : 'Up to date'}
                    </span>
                  </div>
                  <span className="acc-account-line">
                    {formatPeriod(a.from, a.to)}
                    {a.notAdding ? ` · ${a.notAdding} ${a.notAdding === 1 ? 'doesn’t match its' : 'don’t match their'} printed balance` : ''}
                  </span>
                  {missing.length ? <span className="acc-account-line acc-account-missing">Missing: {missing.map((g) => formatPeriod(g.from, g.to)).join('; ')}</span> : null}
                  {itsCards.length ? <span className="acc-account-line">{itsCards.length === 1 ? 'Card' : 'Cards'} ending {itsCards.join(' · ')}</span> : null}
                </div>
                <button type="button" className="acc-link" aria-label={`Change ${names.get(a.name) ?? a.name}`} onClick={() => setNaming(a)}>
                  Change
                </button>
              </li>
            )
          })}
        </ul>
      ) : list && names ? (
        <div className="acc-empty">
          <p>Bring in your bank and card statements to see all your spending.</p>
          <button type="button" className="primary wide" onClick={importStatement}>
            Bring in a statement
          </button>
        </div>
      ) : null}
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
  /** From a payment's sheet: the name can be for this payment alone (v0.20.35), not for all its payee's. `shown` is its
   *  name now, `named` whether that's its own, `shop` the payee's. */
  only?: { shown: string; named: boolean; shop: string; onSave: (name: string) => Promise<void> }
  onSave: (name: string, closed?: boolean) => Promise<void>
  onRemove?: () => Promise<void>
  onClose: () => void
}) {
  const { title, shown, hint, only, onSave, onRemove, onClose } = props
  const [alone, setAlone] = useState(Boolean(only?.named))
  const [name, setName] = useState(only?.named ? only.shown : shown)
  const [closed, setClosed] = useState(props.closed)
  const [sure, setSure] = useState(false)
  const id = useId()
  const scope = useId()
  const save = async () => {
    if (only && alone) await only.onSave(name)
    else await onSave(name, closed)
    onClose()
  }
  const choose = (single: boolean) => {
    setAlone(single)
    setName(single ? only!.shown : shown)
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
      {only ? (
        <div role="radiogroup" aria-label="Rename" className="purpose-list">
          <label className="purpose-option">
            <input type="radio" name={scope} value="all" checked={!alone} onChange={() => choose(false)} />
            <span className="purpose-text">
              <span className="purpose-label">All payments to {only.shop}</span>
              <span className="muted small">Earlier and later ones too</span>
            </span>
          </label>
          <label className="purpose-option">
            <input type="radio" name={scope} value="one" checked={alone} onChange={() => choose(true)} />
            <span className="purpose-text">
              <span className="purpose-label">Only this payment</span>
              <span className="muted small">The others keep their name</span>
            </span>
          </label>
        </div>
      ) : null}
      <label className="question-text top-gap" htmlFor={id}>
        What do you call it?
      </label>
      <input id={id} data-autofocus value={name} maxLength={40} autoCapitalize="sentences" onChange={(e) => setName(e.target.value)} />
      {closed !== undefined ? (
        <label className="check top-gap">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          This account is closed: nothing to bring in after its last statement
        </label>
      ) : null}
      <p className="muted small">{only && alone ? `Left empty, it’s ${only.shop} again.` : hint}</p>
    </Dialog>
  )
}
