import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db/db'
import type { StatementRecord } from '../../db/types'
import { accountMonth, accountMonths } from '../../domain/accountStatement'
import { doesntMatchWords } from '../../domain/trading212'
import { nameOf, notBroughtIn } from '../../domain/money'
import { formatPeriod, monthYear, shortWeekday, dayMonth } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { Loading } from '../../ui/Loading'
import { pounds } from './AccountsMonth'
import { useMoney } from './MoneyContext'
import { PaymentRow } from './PaymentRow'

const upFirst = (words: string) => words[0]!.toUpperCase() + words.slice(1)

// One account's statement (v0.30.0): tap its name under Your accounts. The PDFs aren't kept, only their lines, so it's
// rebuilt from them: a month at a time, newest day first, with what came in and went out and the balance at its end.

export function StatementView(props: {
  account: string
  shown: string
  statements: readonly StatementRecord[]
  closed: boolean
  today: string
  onClose: () => void
}) {
  const { account, shown, statements, closed, today, onClose } = props
  const { moneyLine, names } = useMoney()
  const lines = useLiveQuery(() => db.bankLines.where('account').equals(account).toArray(), [account])
  const [chosen, setChosen] = useState<string | null>(null)
  const months = lines ? accountMonths(lines) : []
  const month = chosen && months.includes(chosen) ? chosen : months.at(-1)
  const at = month ? months.indexOf(month) : -1
  const view = lines && month ? accountMonth(lines, month) : null
  const gaps = month ? notBroughtIn(statements, today, closed).filter((g) => g.from.slice(0, 7) <= month && g.to.slice(0, 7) >= month) : []
  const step = (to: string | undefined, label: string, icon: 'chevron-left' | 'chevron-right') =>
    to ? (
      <button type="button" className="acc-step" aria-label={`${label}: ${monthYear(to)}`} onClick={() => setChosen(to)}>
        <Icon name={icon} />
      </button>
    ) : (
      <span className="acc-step" data-off="" aria-hidden="true">
        <Icon name={icon} />
      </span>
    )
  return (
    <Dialog title={shown} full onClose={onClose}>
      {!lines ? (
        <Loading />
      ) : !view || !month ? (
        <p className="muted">No lines are kept for this account.</p>
      ) : (
        <>
          <div className="money-title">
            <h3>{monthYear(month)}</h3>
            <nav className="acc-stepper" aria-label="Months">
              {step(months[at - 1], 'Earlier', 'chevron-left')}
              {step(months[at + 1], 'Later', 'chevron-right')}
            </nav>
          </div>
          {view.count ? (
            <div className="acc-stats" data-cells={view.closing !== null ? 3 : 2} role="group" aria-label="The month in figures">
              <div className="acc-stat">
                <span className="acc-stat-label">In</span> <span className="acc-stat-value" data-in={view.in > 0 || undefined}>{view.in > 0 ? '+' : ''}{pounds(view.in)}</span>
              </div>
              <div className="acc-stat">
                <span className="acc-stat-label">Out</span> <span className="acc-stat-value">{pounds(view.out)}</span>
              </div>
              {view.closing !== null ? (
                <div className="acc-stat">
                  <span className="acc-stat-label">{view.owed ? 'End owed' : 'End balance'}</span> <span className="acc-stat-value">{pounds(view.closing)}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">Nothing in this month.</p>
          )}
          {gaps.length ? <p className="acc-account-line acc-account-missing">Missing: {gaps.map((g) => formatPeriod(g.from, g.to)).join('; ')}</p> : null}
          {view.days.map((day) => {
            const out = day.lines.filter((l) => l.amount < 0).reduce((sum, l) => sum - l.amount, 0)
            // Moved money counts both ways here, as the month's In and Out above it do: this is the statement, not the spending.
            const came = day.lines.filter((l) => l.amount > 0).reduce((sum, l) => sum + l.amount, 0)
            return (
              <section key={day.date} aria-label={dayMonth(day.date)}>
                <div className="acc-day">
                  <h4>
                    {shortWeekday(day.date)} {dayMonth(day.date)}
                  </h4>
                  <span className="acc-day-total">{[out ? `${pounds(out)} out` : '', came ? `+${pounds(came)} in` : ''].filter(Boolean).join(' · ')}</span>
                </div>
                <ul className="acc-list">
                  {day.lines.map((l) => {
                    const line = moneyLine(l.id)
                    const account = names.get(l.account) ?? l.account
                    const way = l.amount < 0 ? `Out of ${account}` : line?.refund ? `Back into ${account}` : `Into ${account}`
                    // Every line says which way it went in words: a move between your accounts has no sign or green of its own.
                    const sub = [l.amount < 0 ? 'Out' : line?.refund ? 'Refund' : 'In', l.type, l.balance !== null ? `${view.owed ? 'Owed' : 'Balance'} ${pounds(l.balance)}` : '', l.adds ? '' : upFirst(doesntMatchWords(l.account))].filter(Boolean).join(' · ')
                    return line ? <PaymentRow key={l.id} line={line} title={nameOf(line)} sub={sub} way={way} /> : null
                  })}
                </ul>
              </section>
            )
          })}
        </>
      )}
    </Dialog>
  )
}
