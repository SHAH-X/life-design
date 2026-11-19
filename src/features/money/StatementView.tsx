import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db/db'
import type { StatementRecord } from '../../db/types'
import { accountMonth, accountMonths } from '../../domain/accountStatement'
import { notBroughtIn } from '../../domain/money'
import { formatPeriod, monthYear, shortWeekday, dayMonth } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { Loading } from '../../ui/Loading'
import { pounds } from './AccountsMonth'

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
            <p className="acc-account-line">
              In {pounds(view.in)} · Out {pounds(view.out)}
              {view.closing !== null ? ` · ${view.owed ? 'Owed' : 'Balance'} at the end ${pounds(view.closing)}` : ''}
            </p>
          ) : (
            <p className="muted">Nothing in this month.</p>
          )}
          {gaps.length ? <p className="acc-account-line acc-account-missing">Missing: {gaps.map((g) => formatPeriod(g.from, g.to)).join('; ')}</p> : null}
          {view.days.map((day) => (
            <section key={day.date} aria-label={dayMonth(day.date)}>
              <h4>
                {shortWeekday(day.date)} {dayMonth(day.date)}
              </h4>
              <ul className="acc-list">
                {day.lines.map((l) => (
                  <li key={l.id} className="acc-li">
                    <div className="acc-row">
                      <span className="acc-row-text">
                        <span className="acc-row-title">{l.description}</span>{' '}
                        <span className="acc-row-sub">
                          {[l.type, l.balance !== null ? `${view.owed ? 'Owed' : 'Balance'} ${pounds(l.balance)}` : '', l.adds ? '' : 'Doesn’t match its printed balance'].filter(Boolean).join(' · ')}
                        </span>
                      </span>{' '}
                      <span className="acc-row-value">
                        {pounds(Math.abs(l.amount))} {l.amount < 0 ? 'out' : 'in'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Dialog>
  )
}
