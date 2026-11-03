import { useState } from 'react'
import type { StatementRecord } from '../../db/types'
import { type BalanceMonth, committedOf, type KindGroup, type MoneyLine, monthEndBalances, moneyYear, type PayeeGroup } from '../../domain/money'
import { formatPeriod, monthName, monthYear } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { BalanceChart } from '../../ui/charts/BalanceChart'
import { Block, ForBlock, Groups, Item, KindRow, LineList, PayeeRow, paymentsWord, pounds, resultWords } from './AccountsMonth'
import { useMoney } from './MoneyContext'
import { Icon } from '../../ui/Icon'

// The year of your accounts (v0.20.27, #/money/2026): the same figures as a month, over the months you've brought in,
// by what it was for, who it went to, what was paid regularly, and the days with no statement. One page, no parts.
// Counts and amounts only: nothing averaged, rated or set as a limit.

/** An account's balance isn't known at a month's end: say which, and why. */
const unknownWords = (list: BalanceMonth['unknown'], name: (account: string) => string) =>
  `not known: ${list.map((u) => (u.why === 'statement' ? `no statement for ${name(u.account)}` : `${name(u.account)}’s last day can’t be told`)).join('; ')}`

/** Your balances at each month's end: what you hold as columns, what you owe said apart. */
function Balances({ ends, today, name }: { ends: ReturnType<typeof monthEndBalances>; today: string; name: (account: string) => string }) {
  const [active, setActive] = useState<number | null>(null)
  const thisMonth = today.slice(0, 7)
  const showOwed = ends.accounts.some((a) => a.owed)
  const months = ends.months.map((m) => {
    const lacking = m.unknown.filter((u) => !u.owed)
    const owing = m.unknown.filter((u) => u.owed)
    const held = m.held === null ? (lacking.length ? unknownWords(lacking, name) : 'nothing held') : m.held > 0 ? `${pounds(m.held)} held` : m.held < 0 ? `${pounds(-m.held)} overdrawn` : 'nothing held'
    const owed = m.owed === null ? (owing.length ? `owed ${unknownWords(owing, name)}` : '') : `${pounds(m.owed)} owed`
    return {
      key: m.month,
      axisLabel: monthName(m.month, 'short'),
      title: m.month === thisMonth ? `${monthName(m.month)} so far` : monthYear(m.month),
      value: m.held !== null && m.held > 0 ? m.held : 0,
      held,
      owed,
    }
  })
  const lastKnown = ends.months.map((m) => m.held !== null).lastIndexOf(true)
  return (
    <BalanceChart title="Held at each month’s end" months={months} summary="Tap a month" active={active} onActive={setActive} labelled={lastKnown < 0 ? months.length - 1 : lastKnown} showOwed={showOwed} />
  )
}

/** The biggest payees listed; every payee is still in its month. */
const BIGGEST = 10

/** A year of your accounts: its money out, in, where it went and what's missing. */
export function AccountsYear(props: {
  lines: readonly MoneyLine[]
  year: string
  today: string
  statements: readonly StatementRecord[]
  closed: ReadonlySet<string>
  /** Every year with something in it, oldest first: the years either side of this one. */
  years: readonly string[]
}) {
  const { lines, year, today, statements, closed, years } = props
  const { kinds, names } = useMoney()
  const its = moneyYear(lines, year, today, statements, closed, kinds)
  const thisYear = today.slice(0, 4)
  const current = year === thisYear
  const earlier = years.filter((y) => y < year).at(-1)
  const later = year < thisYear ? (years.find((y) => y > year && y <= thisYear) ?? thisYear) : undefined
  const split = committedOf(its.outLines, its.regular)
  const result = resultWords(its.in, its.out)
  // A year is only as long as the statements brought in: say which months it covers.
  const span = its.months ? (its.months.first === its.months.last ? monthYear(its.months.first) : `${monthName(its.months.first, 'short')} – ${monthName(its.months.last, 'short')}`) : null
  const biggest = its.payees.out.ranked.slice(0, BIGGEST)
  const ends = monthEndBalances(lines, statements, closed, year, today)

  return (
    <>
      <header className="acc-hero">
        <div className="acc-hero-top">
          <p className="acc-label">{current ? `${year} so far` : year}</p>
          <nav className="acc-stepper" aria-label="Years">
            {earlier ? (
              <a className="acc-step" href={hashFor('money', earlier)} aria-label={`Earlier: ${earlier}`}><Icon name="chevron-left" /></a>
            ) : (
              <span className="acc-step" data-off="" aria-hidden="true"><Icon name="chevron-left" /></span>
            )}
            {later ? (
              <a className="acc-step" href={hashFor('money', later)} aria-label={`Later: ${later}`}><Icon name="chevron-right" /></a>
            ) : (
              <span className="acc-step" data-off="" aria-hidden="true"><Icon name="chevron-right" /></span>
            )}
          </nav>
        </div>
        <p className="acc-figure">
          <strong>
            {pounds(its.out)} <span>out</span>
          </strong>
        </p>
        <p className="acc-caption">From your accounts{span ? ` · ${span}` : ''}</p>
        {its.months ? (
          <p className="acc-caption">
            Money in {pounds(its.in)} · {paymentsWord(its.outLines.length)} out
          </p>
        ) : (
          <p className="acc-caption">Nothing brought in for {year}.</p>
        )}
        {result ? <p className="acc-caption">{current ? `${result} so far` : result}</p> : null}
        {split.committed > 0 ? (
          <p className="acc-caption">
            Committed {pounds(split.committed)} · Everyday {pounds(split.everyday)}
          </p>
        ) : null}
      </header>
      {its.outLines.length ? (
        <Block title="By what it was for">
          <Groups of={its.kinds} line={(g: KindGroup) => <KindRow key={g.kind} group={g} totalOut={its.out} />} fewer="Fewer than 3 payments, by name" />
        </Block>
      ) : null}
      {its.forWho ? <ForBlock who={its.forWho} /> : null}
      {biggest.length ? (
        <Block title="Biggest payees" status={its.payees.out.ranked.length > BIGGEST ? `The ${BIGGEST} biggest, paid 3 times or more` : 'Paid 3 times or more, biggest first'}>
          <ul className="acc-list">
            {biggest.map((g: PayeeGroup) => (
              <PayeeRow key={g.payee.key} group={g} out />
            ))}
          </ul>
        </Block>
      ) : null}
      {its.regular.length ? (
        <Block title="Regular payments" status={`${pounds(its.regular.reduce((sum, r) => sum + r.total, 0))} paid in ${year}`}>
          <ul className="acc-list">
            {its.regular.map((r) => (
              <Item key={r.payee.key} title={r.payee.name} sub={`every ${r.every} · ${paymentsWord(r.lines.length)}`} value={pounds(r.total)}>
                <LineList lines={r.lines} />
              </Item>
            ))}
          </ul>
        </Block>
      ) : null}
      {ends.months.length ? (
        <Block title="At each month’s end" status={ends.accounts.some((a) => a.owed) ? 'Held in your accounts; what you owe is kept apart' : 'Held in your accounts'}>
          <Balances ends={ends} today={today} name={(account) => names.get(account) ?? account} />
        </Block>
      ) : null}
      {its.gaps.length ? (
        <Block title="Not brought in" status="Days with no statement, left out of these figures">
          <ul className="acc-list">
            {its.gaps.map((g) => (
              <li key={`${g.account}-${g.from}`} className="acc-li">
                <div className="acc-row">
                  <span className="acc-row-text">
                    <span className="acc-row-title">{names.get(g.account) ?? g.account}</span>
                    <span className="acc-row-sub">{formatPeriod(g.from, g.to)}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
    </>
  )
}
