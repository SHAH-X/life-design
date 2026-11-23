import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { type BillDraft, removeBill, saveBill, setBudget } from '../../db/bills'
import { db } from '../../db/db'
import type { Bill, BillEvery, StatementRecord } from '../../db/types'
import { billEvents, billsTotal, budgetRows, draftFromRegular, dueSoon, EVERY_WORDS, nextPayment, paidAgainst, renewalIn } from '../../domain/bills'
import { type MoneyLine, monthCoverage, PAYMENT_KINDS, regularPayments, titleCaseShouted } from '../../domain/money'
import { monthYear, shortDayMonth } from '../../lib/dates'
import { amountField, money, parseMoney } from '../../lib/money'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { buildIcs } from '../../reminders/ics'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'

// Bills and subscriptions you list yourself, and a monthly budget for each kind of spending (step 4, 2026-11-23, owner-approved
// plan). Nothing here pays, changes or cancels anything: it says what you listed, when it falls due, and what the statements last
// showed. A bill is not a promise from a bank, and a budget is an amount, never a score.

const pounds = (pence: number) => money(pence, '£')
const DUE_DAYS = 14
const EVERY: readonly BillEvery[] = ['week', 'month', 'quarter', 'year']

/** The tile in Overview: what your bills come to in a year, and what is due soon. */
export function BillsTile(props: { lines: readonly MoneyLine[]; kindSpend: Readonly<Record<string, number>>; statements: readonly StatementRecord[]; closed: ReadonlySet<string>; month: string; today: string }) {
  const bills = useLiveQuery(() => db.bills.toArray(), [])
  const budgets = useLiveQuery(() => db.budgets.toArray(), [])
  const [open, setOpen] = useState(false)
  // Reserves its space until the data is in, so nothing moves under the finger.
  if (!bills || !budgets) return <span className="acc-tile" aria-hidden="true">&nbsp;</span>
  const total = billsTotal(bills)
  const soon = dueSoon(bills, props.today, DUE_DAYS)
  const empty = total.count === 0 && budgets.length === 0
  const sub = [total.count ? `${total.count} ${total.count === 1 ? 'bill' : 'bills'}` : '', soon.length ? `${soon.length} due soon` : '', budgets.length ? `${budgets.length} ${budgets.length === 1 ? 'budget' : 'budgets'}` : ''].filter(Boolean).join(' · ') || 'Bills, subscriptions, budgets'
  return (
    <>
      <button type="button" className="acc-tile" onClick={() => setOpen(true)}>
        <span className="acc-tile-label">Bills and budgets</span>
        <span className="acc-tile-value">{total.count ? `${pounds(total.year)} a year` : empty ? 'Set up' : 'Budgets'}</span>
        <span className="acc-tile-sub">{sub}</span>
      </button>
      {open ? <BillsSheet {...props} bills={bills} budgets={budgets} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

type Editing = { id: string | null; draft: BillDraft } | null

const blank = (today: string): BillDraft => ({ name: '', kind: '', amount: 0, every: 'month', next: today, renewal: null, method: '', notes: '', payee: null })

function BillsSheet(props: {
  bills: readonly Bill[]
  budgets: readonly { id: string; kind: string; amount: number }[]
  lines: readonly MoneyLine[]
  kindSpend: Readonly<Record<string, number>>
  statements: readonly StatementRecord[]
  closed: ReadonlySet<string>
  month: string
  today: string
  onClose: () => void
}) {
  const { bills, budgets, lines, kindSpend, statements, closed, month, today, onClose } = props
  const [editing, setEditing] = useState<Editing>(null)
  const [budgeting, setBudgeting] = useState<string | 'new' | null>(null)
  const total = billsTotal(bills)
  const sorted = [...bills].sort((a, b) => nextPayment(a, today).localeCompare(nextPayment(b, today)) || a.name.localeCompare(b.name))
  const kept = new Set(bills.flatMap((b) => (b.payee ? [b.payee] : [])))
  // The regular payments as of today, whatever month is open (the same list Ask's answer uses).
  const offered = regularPayments(lines, today.slice(0, 7), today).filter((r) => !kept.has(r.payee.key))
  const budget = budgetRows(budgets.map((b) => ({ ...b, createdAt: 0, updatedAt: 0 })), kindSpend)
  // What the month's statements leave unsaid (audit 2026-11-23): a month no statement reaches is not £0 spent, and one still going or with a
  // statement missing is only what the statements show.
  const cover = monthCoverage(statements, closed, [month], today)[0]!
  const known: 'none' | 'part' | 'all' = cover.uncovered ? 'none' : cover.complete ? 'all' : 'part'

  // Built inside the tap, because iPhone only opens the share menu straight from a tap.
  function calendarFile() {
    const file = new File([buildIcs(billEvents(bills, today), new Date())], 'life-design-bills.ics', { type: 'text/calendar' })
    if (canShareFile(file)) void shareFile(file).catch(() => undefined)
    else downloadFile(file)
  }

  return (
    <>
      <Dialog title="Bills and budgets" onClose={onClose} full>
        <h3 className="question-text">Bills and subscriptions</h3>
        {total.count ? (
          <p>
            <strong>{pounds(total.year)} a year</strong> · {total.count} {total.count === 1 ? 'bill' : 'bills'}
            <span className="muted small"> · a year of each, counted from its cycle</span>
          </p>
        ) : (
          <p className="muted">Nothing listed yet. Add a bill, or keep one found in your statements.</p>
        )}
        <ul className="plain-list compact">
          {sorted.map((bill) => {
            const paid = paidAgainst(bill, lines)
            const renews = renewalIn(bill, today)
            return (
              <li key={bill.id}>
                <button type="button" className="line-button product-row" onClick={() => setEditing({ id: bill.id, draft: bill })}>
                  <span className="product-name">{bill.name}</span>
                  <span className="product-change">
                    {pounds(bill.amount)}
                    <span className="product-chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </span>
                  <span className="product-sub">
                    {[
                      EVERY_WORDS[bill.every],
                      `next around ${shortDayMonth(nextPayment(bill, today))}`,
                      renews !== null ? (renews === 0 ? 'renews today' : `renews in ${renews} ${renews === 1 ? 'day' : 'days'}`) : '',
                      paid ? (paid.differs ? `last paid ${pounds(paid.amount)} on ${shortDayMonth(paid.date)}, you listed ${pounds(bill.amount)}` : `last paid ${shortDayMonth(paid.date)}`) : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <button type="button" className="small-link" onClick={() => setEditing({ id: null, draft: blank(today) })}>
          + Add a bill
        </button>
        {total.count ? (
          <>
            <button type="button" className="small-link top-gap" onClick={calendarFile}>
              Add your listed bills to your calendar
            </button>
            <p className="muted small">The bills you listed above, with an alert two days before each payment.</p>
          </>
        ) : null}
        {offered.length ? (
          <>
            <p className="question-text top-gap">Found in your statements</p>
            <ul className="plain-list compact">
              {offered.map((r) => (
                <li key={r.payee.key} className="product-shop">
                  <span>
                    {r.payee.name} · {pounds(r.amount)} {r.every === 'month' ? 'a month' : 'a week'}
                  </span>
                  <button type="button" className="small-link" onClick={() => setEditing({ id: null, draft: { ...blank(today), ...draftFromRegular(r) } })}>
                    Keep as a bill
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h3 className="question-text top-gap">Budgets · {monthYear(month)}</h3>
        <p className="muted small">An amount for each kind of spending, a month. Only what you spent and what is left.</p>
        {known === 'none' && budget.rows.length ? <p className="muted small">No statement reaches {monthYear(month)} yet, so what was spent is not known.</p> : null}
        {budget.total && known !== 'none' ? (
          <p>
            <strong>All of these:</strong> {pounds(budget.total.spent)} of {pounds(budget.total.budget)} · {budget.total.left >= 0 ? `${pounds(budget.total.left)} left` : `${pounds(-budget.total.left)} over`}
          </p>
        ) : null}
        {budget.rows.length ? (
          <ul className="plain-list compact">
            {budget.rows.map((r) => (
              <li key={r.kind}>
                <button type="button" className="line-button product-row" onClick={() => setBudgeting(r.kind)}>
                  <span className="product-name">{r.kind}</span>
                  <span className="product-change">
                    {known === 'none' ? '' : r.left >= 0 ? `${pounds(r.left)} left` : `${pounds(-r.left)} over`}
                    <span className="product-chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </span>
                  <span className="product-sub">
                    {known === 'none' ? `${pounds(r.budget)} a month` : `${pounds(r.spent)} of ${pounds(r.budget)}${known === 'part' ? ' · only what the statements show so far' : ''}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="small-link" onClick={() => setBudgeting('new')}>
          + Set a budget
        </button>
      </Dialog>
      {editing ? <BillEditor key={editing.id ?? 'new'} id={editing.id} draft={editing.draft} payees={regularPayments(lines, today.slice(0, 7), today).map((r) => ({ key: r.payee.key, name: titleCaseShouted(r.payee.name) }))} onClose={() => setEditing(null)} /> : null}
      {budgeting ? <BudgetEditor kind={budgeting === 'new' ? null : budgeting} taken={budgets.map((b) => b.kind)} current={budgets.find((b) => b.kind === budgeting)?.amount ?? null} onClose={() => setBudgeting(null)} /> : null}
    </>
  )
}

function BillEditor({ id, draft, payees, onClose }: { id: string | null; draft: BillDraft; payees: readonly { key: string; name: string }[]; onClose: () => void }) {
  const [name, setName] = useState(draft.name)
  const [kind, setKind] = useState(draft.kind)
  const [amount, setAmount] = useState(draft.amount ? amountField(draft.amount) : '')
  const [every, setEvery] = useState<BillEvery>(draft.every)
  const [next, setNext] = useState(draft.next)
  const [renewal, setRenewal] = useState(draft.renewal ?? '')
  const [method, setMethod] = useState(draft.method)
  const [notes, setNotes] = useState(draft.notes)
  const [payee, setPayee] = useState(draft.payee ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [sure, setSure] = useState(false)
  const everyId = useId()

  async function save() {
    const pence = parseMoney(amount)
    if (!name.trim()) return setProblem('Give it a name.')
    if (pence === null || pence <= 0) return setProblem('The amount isn’t one. Type what it costs each time, like 10.99.')
    if (!next) return setProblem('Choose a day it is paid: the next is counted from it.')
    await saveBill({ name, kind, amount: pence, every, next, renewal: renewal || null, method, notes, payee: payee || null }, id)
    onClose()
  }

  return (
    <Dialog
      title={id ? 'Change this bill' : 'Add a bill'}
      onClose={onClose}
      full
      footer={
        <button type="button" className="primary wide" onClick={() => void save()}>
          Save
        </button>
      }
    >
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" data-autofocus />
      </label>
      <label className="field">
        <span>What it costs each time</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="field">
        <span>How often</span>
        <select id={everyId} value={every} onChange={(e) => setEvery(e.target.value as BillEvery)}>
          {EVERY.map((e) => (
            <option key={e} value={e}>
              {EVERY_WORDS[e].charAt(0).toUpperCase() + EVERY_WORDS[e].slice(1)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>A day it is paid</span>
        <input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label className="field">
        <span>What it’s for</span>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Not said</option>
          {PAYMENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Renews on, if it has a term</span>
        <input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)} />
      </label>
      {payees.length ? (
        <label className="field">
          <span>Paid to, in your statements</span>
          <select value={payee} onChange={(e) => setPayee(e.target.value)}>
            <option value="">Not linked</option>
            {payees.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>How it is paid</span>
        <input value={method} placeholder="e.g. Direct debit from Lloyds" onChange={(e) => setMethod(e.target.value)} />
      </label>
      <label className="field">
        <span>Notes, such as how to cancel</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
      <p className="muted small">This only lists it. Nothing is paid, changed or cancelled from here.</p>
      {id ? (
        sure ? (
          <button type="button" className="small-link" onClick={() => void removeBill(id).then(onClose)}>
            Yes, take it off my list
          </button>
        ) : (
          <button type="button" className="small-link" onClick={() => setSure(true)}>
            Take it off my list
          </button>
        )
      ) : null}
    </Dialog>
  )
}

function BudgetEditor({ kind, taken, current, onClose }: { kind: string | null; taken: readonly string[]; current: number | null; onClose: () => void }) {
  const free = PAYMENT_KINDS.filter((k) => !taken.includes(k))
  const [chosen, setChosen] = useState(kind ?? '')
  const [sure, setSure] = useState(false)
  const [amount, setAmount] = useState(current ? amountField(current) : '')
  const [problem, setProblem] = useState<string | null>(null)

  async function save() {
    const pence = parseMoney(amount)
    if (!chosen) return setProblem(free.length ? 'Choose what the budget is for.' : 'Every kind already has a budget.')
    if (pence === null || pence <= 0) return setProblem('The amount isn’t one. Type what you set aside each month, like 250.')
    await setBudget(chosen, pence)
    onClose()
  }

  return (
    <Dialog
      title={kind ? `Budget for ${kind}` : 'Set a budget'}
      onClose={onClose}
      footer={
        <button type="button" className="primary wide" onClick={() => void save()}>
          Save
        </button>
      }
    >
      {kind === null ? (
        <label className="field">
          <span>What it’s for</span>
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">Choose a kind</option>
            {free.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>Set aside each month</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
      </label>
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
      {kind ? (
        sure ? (
          <button type="button" className="small-link" onClick={() => void setBudget(kind, null).then(onClose)}>
            Yes, take this budget away
          </button>
        ) : (
          <button type="button" className="small-link" onClick={() => setSure(true)}>
            Take this budget away
          </button>
        )
      ) : null}
    </Dialog>
  )
}

