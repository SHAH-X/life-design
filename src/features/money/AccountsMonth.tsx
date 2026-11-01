import { type ReactNode, useEffect, useId, useState } from 'react'
import { markOwnPayee, namePayee } from '../../db/statements'
import type { StatementRecord } from '../../db/types'
import {
  averageOfComplete,
  committedOf,
  joinMoves,
  type KindGroup,
  kindOf,
  mayBeOwn,
  type MoneyLine,
  moneyMonth,
  moneyMonthTotals,
  monthCoverage,
  type Moving,
  moneyYear,
  payeeOf,
  type PayeeGroup,
  type PaymentRow,
  type Ranked,
  type Regular,
  type RegularChange,
  regularChanges,
  regularPayments,
  regularPaymentsTotal,
  type Rise,
  upcoming,
} from '../../domain/money'
import { money, paid, shiftMonth } from '../../domain/shopping'
import { dayMonth, monthName, monthYear, shortDayMonth } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Accounts, RenameSheet } from './Accounts'
import { useMoney } from './MoneyContext'

// The Accounts view of Money (redesigned v0.20.22): a month of your accounts, its money out up top with the months
// either side of it a tap away, then three parts that each do one job: Overview (how it compares: the months, what
// rose, what recurs), Spending (where it went and came from, and what's left out), Statements (where the numbers come
// from: your accounts, their gaps, what to check). Every line is one kind of row, opening to its payments.

/** The chart shows this many months, the page's own the last. */
const CHART_MONTHS = 6

/** Regular payments due within this many days are listed under Coming up (this month only). */
const COMING_DAYS = 30

export const pounds = (pence: number) => money(pence, '£')
/** A change over a year, in words: +£48.00 a year, or £12.00 a year less. */
const yearly = (pence: number) => (pence >= 0 ? `+${pounds(pence)} a year` : `${pounds(-pence)} a year less`)
export const paymentsWord = (n: number) => `${n} payment${n === 1 ? '' : 's'}`
const movesWord = (n: number) => `${n} move${n === 1 ? '' : 's'}`

/** What came in against what went out, in words and never as a sign: "£460.00 more in than out". Null with nothing in or out. */
export function resultWords(came: number, went: number): string | null {
  if (came === 0 && went === 0) return null
  if (came === went) return 'As much in as out'
  return came > went ? `${pounds(came - went)} more in than out` : `${pounds(went - came)} more out than in`
}

/** Why money moved is left out, in words. */
const MOVED: Record<Moving, string> = {
  flex: 'Monzo Flex',
  pot: 'Pots',
  between: 'Between your accounts',
  own: 'Your own account',
}

export type AccountsSection = 'overview' | 'spending' | 'statements'

const SECTIONS: readonly { id: AccountsSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'spending', label: 'Spending' },
  { id: 'statements', label: 'Statements' },
]

/** A month of your accounts: out and in, where it rose, regular payments, by payee, money moved, to check. */
export function AccountsMonth(props: {
  lines: readonly MoneyLine[]
  month: string
  today: string
  statements: readonly StatementRecord[]
  closed: ReadonlySet<string>
  /** Every month with something in it, oldest first: the months either side of this one. */
  months: readonly string[]
  section: AccountsSection
  onSection: (section: AccountsSection) => void
}) {
  const { lines, month, today, statements, closed, months, section, onSection } = props
  const { kinds } = useMoney()
  const [jump, setJump] = useState<string | null>(null)
  const its = moneyMonth(lines, month, today, statements, closed, kinds)
  const changes = regularChanges(lines, month, today, statements, closed)
  // A payment that has stopped is no longer something you're committed to: it is told under What changed instead.
  const stopped = new Set(changes.lapsed.map((l) => l.payee.key))
  const regular = regularPayments(lines, month, today).filter((r) => !stopped.has(r.payee.key))
  const split = committedOf(its.outLines, regular)
  const result = resultWords(its.in, its.out)
  const yearOut = moneyYear(lines, month.slice(0, 4), today, statements, closed, kinds).out
  const thisMonth = today.slice(0, 7)
  const current = month === thisMonth
  const earlier = months.filter((m) => m < month).at(-1)
  const later = month < thisMonth ? (months.find((m) => m > month && m <= thisMonth) ?? thisMonth) : undefined
  const stale = its.toCheck.accounts.length

  // A figure at the top that opens the list it counts: switch to Spending, then bring that list into view.
  useEffect(() => {
    if (!jump || section !== 'spending') return
    document.getElementById(jump)?.scrollIntoView({ block: 'start' })
    setJump(null)
  }, [jump, section])
  const goTo = (id: string) => {
    onSection('spending')
    setJump(id)
  }

  return (
    <>
      <header className="acc-hero">
        <div className="acc-hero-top">
          <p className="acc-label">{current ? `${monthName(month)} so far` : monthYear(month)}</p>
          <nav className="acc-stepper" aria-label="Months">
            {earlier ? (
              <a className="acc-step" href={hashFor('money', earlier)} aria-label={`Earlier: ${monthYear(earlier)}`}>
                ‹
              </a>
            ) : (
              <span className="acc-step" data-off="" aria-hidden="true">
                ‹
              </span>
            )}
            {later ? (
              <a className="acc-step" href={hashFor('money', later === thisMonth ? null : later)} aria-label={`Later: ${monthYear(later)}`}>
                ›
              </a>
            ) : (
              <span className="acc-step" data-off="" aria-hidden="true">
                ›
              </span>
            )}
          </nav>
        </div>
        <p className="acc-figure">
          <strong>
            {pounds(its.out)} <span>out</span>
          </strong>
        </p>
        <p className="acc-caption">From your accounts</p>
        {split.committed > 0 ? (
          <p className="acc-caption">
            Committed {pounds(split.committed)} · Everyday {pounds(split.everyday)}
          </p>
        ) : null}
        <div className="acc-stats" role="group" aria-label="Money in and payments out">
          <button type="button" className="acc-stat" onClick={() => goTo('acc-money-in')}>
            <span className="acc-stat-label">Money in</span> <span className="acc-stat-value">{pounds(its.in)}</span>
          </button>
          <button type="button" className="acc-stat" onClick={() => goTo('acc-money-out')}>
            <span className="acc-stat-label">Payments out</span> <span className="acc-stat-value">{paymentsWord(its.outLines.length)}</span>
          </button>
        </div>
        {result ? <p className="acc-caption">{current ? `${result} so far` : result}</p> : null}
        {stale ? (
          <button type="button" className="acc-notice" onClick={() => onSection('statements')}>
            <span>{stale === 1 ? '1 account needs a newer statement' : `${stale} accounts need a newer statement`}</span>
            <span aria-hidden="true">Review ›</span>
          </button>
        ) : null}
      </header>
      <nav className="acc-tabs" aria-label="Account details">
        {SECTIONS.map(({ id, label }) => (
          <button key={id} type="button" className="acc-tab" aria-pressed={section === id} data-attention={id === 'statements' && (stale || its.toCheck.lines.length) ? '' : undefined} onClick={() => onSection(id)}>
            {label}
          </button>
        ))}
      </nav>
      {section === 'overview' ? <Overview its={its} lines={lines} regular={regular} changes={changes} yearOut={yearOut} statements={statements} closed={closed} month={month} today={today} /> : null}
      {section === 'spending' ? <Spending its={its} /> : null}
      {section === 'statements' ? <Statements its={its} /> : null}
    </>
  )
}

type Its = ReturnType<typeof moneyMonth>

function Overview({
  its,
  lines,
  regular,
  changes,
  yearOut,
  statements,
  closed,
  month,
  today,
}: {
  its: Its
  lines: readonly MoneyLine[]
  regular: readonly Regular[]
  changes: { started: RegularChange[]; lapsed: RegularChange[] }
  /** Money out over the year of this month, for the way in to the year. */
  yearOut: number
  statements: readonly StatementRecord[]
  closed: ReadonlySet<string>
  month: string
  today: string
}) {
  const totals = regularPaymentsTotal(regular)
  const went = regular.filter((r): r is Regular & { changed: NonNullable<Regular['changed']> } => r.changed !== null)
  const cadence = [totals.monthly > 0 ? `${pounds(totals.monthly)} a month` : '', totals.weekly > 0 ? `${pounds(totals.weekly)} a week` : ''].filter(Boolean)
  const regularStatus = `${cadence.join(' + ')} · ${paymentsWord(regular.length)}`
  const current = month === today.slice(0, 7)
  const coming = current ? upcoming(regular, today, COMING_DAYS) : []
  const lastMonth = monthName(shiftMonth(month, -1))
  const anyRose = its.rose.ranked.length + its.rose.others.length > 0
  return (
    <>
      <div className="acc-chart">
        <Chart lines={lines} statements={statements} closed={closed} month={month} today={today} />
      </div>
      {anyRose ? (
        <Block title="Where it rose" status={current ? `Next to ${lastMonth} by the same day` : `Next to ${lastMonth}`}>
          <Groups of={its.rose} line={(r: Rise) => <RiseRow key={r.payee.key} rise={r} />} fewer="Fewer than 3 payments, by name" />
        </Block>
      ) : null}
      {went.length + changes.started.length + changes.lapsed.length ? (
        <Block title="What changed">
          <ul className="acc-list">
            {went.map((r) => (
              <Item key={`went-${r.payee.key}`} title={r.payee.name} sub={`went ${r.changed.to > r.changed.from ? 'up' : 'down'} from ${pounds(r.changed.from)} to ${pounds(r.changed.to)} · ${yearly(r.changed.year)}`} value={pounds(r.amount)}>
                <LineList lines={r.lines} />
              </Item>
            ))}
            {changes.started.map((c) => (
              <Item key={`started-${c.payee.key}`} title={c.payee.name} sub={`new · first paid ${dayMonth(c.first)} · every ${c.every}`} value={pounds(c.amount)}>
                <LineList lines={c.lines} />
              </Item>
            ))}
            {changes.lapsed.map((c) => (
              <Item key={`lapsed-${c.payee.key}`} title={c.payee.name} sub={`no payment since ${dayMonth(c.last)} · was every ${c.every}`} value={pounds(c.amount)}>
                <LineList lines={c.lines} />
              </Item>
            ))}
          </ul>
        </Block>
      ) : null}
      {regular.length ? (
        <Block title="Regular payments" status={regularStatus}>
          <ul className="acc-list">
            {coming.length ? (
              <Item title="Coming up" sub={`${paymentsWord(coming.length)} in the next ${COMING_DAYS} days`} value={pounds(coming.reduce((sum, u) => sum + u.amount, 0))}>
                <ul className="acc-list">
                  {coming.map((u) => (
                    <li key={`${u.payee.key}-${u.date}`} className="acc-li">
                      <div className="acc-row">
                        <span className="acc-row-text">
                          <span className="acc-row-title">{u.payee.name}</span> <span className="acc-row-sub">around {dayMonth(u.date)}</span>
                        </span>{' '}
                        <span className="acc-row-value">{pounds(u.amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Item>
            ) : null}
            <li className="acc-li acc-total">
              <div className="acc-row">
                <span className="acc-row-text">
                  <span className="acc-row-title">Total regular payments</span>
                  <span className="acc-row-sub">
                    {totals.weekly > 0 && totals.monthly > 0 ? cadence.join(' + ') : `${paymentsWord(regular.length)}, all ${totals.weekly > 0 ? 'weekly' : 'monthly'}`}
                  </span>
                </span>
                <span className="acc-row-value">{pounds(totals.year)} a year</span>
              </div>
            </li>
            {regular.map((r) => (
              <RegularRow key={r.payee.key} item={r} soon={current} />
            ))}
          </ul>
        </Block>
      ) : null}
      <nav aria-label="Year">
        <ul className="acc-list">
          <li className="acc-li">
            <a className="acc-row" href={hashFor('money', month.slice(0, 4))}>
              <span className="acc-row-text">
                <span className="acc-row-title">{month.slice(0, 4) === today.slice(0, 4) ? `${month.slice(0, 4)} so far` : month.slice(0, 4)}</span>
              </span>{' '}
              <span className="acc-row-value">{pounds(yearOut)} out</span>
            </a>
          </li>
        </ul>
      </nav>
    </>
  )
}

function Spending({ its }: { its: Its }) {
  return (
    <>
      {its.outLines.length ? (
        <Block title="By what it was for">
          <Groups of={its.kinds} line={(g: KindGroup) => <KindRow key={g.kind} group={g} totalOut={its.out} />} fewer="Fewer than 3 payments, by name" />
        </Block>
      ) : null}
      {its.outLines.length ? (
        <Block id="acc-money-out" title="Money out">
          <Groups of={its.payees.out} line={(g: PayeeGroup) => <PayeeRow key={g.payee.key} group={g} out />} fewer="Fewer than 3 payments, by name" />
        </Block>
      ) : null}
      {its.inLines.length ? (
        <Block id="acc-money-in" title="Money in">
          <Groups of={its.payees.in} line={(g: PayeeGroup) => <PayeeRow key={g.payee.key} group={g} />} fewer="Fewer than 3 payments, by name" />
        </Block>
      ) : null}
      {its.moved.length ? (
        <Block title="Moved between your accounts" status="Left out of money in and out">
          <ul className="acc-list">
            {its.moved.map((m) =>
              m.why === 'own' ? <OwnRows key={m.why} lines={m.lines} /> : (
                <Item key={m.why} title={MOVED[m.why]} sub={movesWord(joinMoves(m.lines).length)}>
                  <LineList lines={m.lines} moves />
                </Item>
              ),
            )}
          </ul>
        </Block>
      ) : null}
    </>
  )
}

function Statements({ its }: { its: Its }) {
  const { names } = useMoney()
  const { lines, accounts } = its.toCheck
  return (
    <>
      {lines.length || accounts.length ? (
        <Block title="To check">
          {accounts.length ? (
            <ul className="acc-list">
              {accounts.map((a) => (
                <li key={a.account} className="acc-li">
                  <div className="acc-row">
                    <span className="acc-row-text">
                      <span className="acc-row-title">{names.get(a.account) ?? a.account}</span>
                      <span className="acc-row-sub">statements up to {dayMonth(a.until)}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {lines.length ? <LineList lines={lines} why="doesn’t match its printed balance" /> : null}
        </Block>
      ) : null}
      <Accounts />
    </>
  )
}

/** A titled part of a tab: its heading names the region, one short status line under it. */
export function Block({ id, title, status, children }: { id?: string; title: string; status?: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section id={id} className="acc-block" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      {status ? <p className="acc-status">{status}</p> : null}
      {children}
    </section>
  )
}

/** Groups ranked only with 3+ payments, most first; the rest by name. */
export function Groups<T>({ of, line, fewer }: { of: Ranked<T>; line: (item: T) => ReactNode; fewer: string }) {
  return (
    <>
      {of.ranked.length ? <ul className="acc-list">{of.ranked.map(line)}</ul> : null}
      {of.ranked.length && of.others.length ? <p className="acc-status acc-fewer">{fewer}</p> : null}
      {of.others.length ? <ul className="acc-list">{of.others.map(line)}</ul> : null}
    </>
  )
}

/** The one kind of row: what it is, what it says underneath, and its figure; it opens to what's behind it. */
export function Item({ title, sub, value, meter, children }: { title: string; sub?: ReactNode; value?: ReactNode; meter?: number; children: ReactNode }) {
  return (
    <li className="acc-li">
      <details className="acc-item">
        <summary className="acc-row">
          <span className="acc-row-text">
            <span className="acc-row-title">{title}</span>
            {sub ? (
              <>
                {' '}
                <span className="acc-row-sub">{sub}</span>
              </>
            ) : null}
          </span>
          {value ? (
            <>
              {' '}
              <span className="acc-row-value">{value}</span>
            </>
          ) : null}
          {meter !== undefined ? (
            <span className="acc-meter" aria-hidden="true">
              <span style={{ width: `${meter}%` }} />
            </span>
          ) : null}
        </summary>
        <div className="acc-open">{children}</div>
      </details>
    </li>
  )
}

/** Money out each month, from your accounts. */
function Chart({ lines, statements, closed, month, today }: { lines: readonly MoneyLine[]; statements: readonly StatementRecord[]; closed: ReadonlySet<string>; month: string; today: string }) {
  const { names } = useMoney()
  const [active, setActive] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const thisMonth = today.slice(0, 7)
  const last = shiftMonth(month, -page * CHART_MONTHS)
  const months = moneyMonthTotals(lines, last, CHART_MONTHS)
  // The average counts only months that are over and have every statement in (v0.20.32): a month not begun, or with an
  // account's statements missing, is not a month of no spending.
  const coverage = monthCoverage(statements, closed, months.map((m) => m.month), today)
  const average = averageOfComplete(months, coverage)
  const hasEarlier = lines.some((line) => !line.moving && (line.amount < 0 || line.refund) && line.date.slice(0, 7) < months[0]!.month)
  const tapped = active === null ? undefined : months[active]
  const firstMonth = months[0]!.month
  const lastMonth = months[months.length - 1]!.month
  const range =
    firstMonth.slice(0, 4) === lastMonth.slice(0, 4)
      ? `${monthName(firstMonth, 'short')}–${monthName(lastMonth, 'short')} ${lastMonth.slice(0, 4)}`
      : `${monthName(firstMonth, 'short')} ${firstMonth.slice(0, 4)}–${monthName(lastMonth, 'short')} ${lastMonth.slice(0, 4)}`
  return (
    <>
      <MonthChart
        title="Spent each month"
        months={months.map((m, i) => ({
          key: m.month,
          axisLabel: monthName(m.month, 'short'),
          title: m.month === thisMonth ? `${monthName(m.month)} so far` : monthYear(m.month),
          value: m.out,
          amount: pounds(m.out),
          receipts: m.lines,
          // Said of a finished month only: the month you're in is still being brought in.
          note: m.month < thisMonth && coverage[i]!.missing.length ? `not every statement is in: ${coverage[i]!.missing.map((account) => names.get(account) ?? account).join(', ')}` : undefined,
        }))}
        currency="£"
        summary="Tap a month"
        active={active}
        onActive={setActive}
        labelled={months.length - 1}
        counted={{ heading: 'Payments', word: paymentsWord, none: 'no payments' }}
        average={average ? { value: average.value, label: `Average of the ${average.months} months with every statement in: ${pounds(average.value)} per month`, amount: pounds(average.value) } : undefined}
        detail={
          tapped && tapped.month !== month && tapped.lines ? (
            <a className="small-link" href={hashFor('money', tapped.month === thisMonth ? null : tapped.month)}>
              Open {monthYear(tapped.month)} ›
            </a>
          ) : null
        }
      />
      <nav className="chart-range" aria-label="Spending chart months">
        <button
          type="button"
          onClick={() => {
            setPage((value) => value + 1)
            setActive(null)
          }}
          disabled={!hasEarlier}
        >
          Earlier months
        </button>
        <span>{range}</span>
        <button
          type="button"
          onClick={() => {
            setPage((value) => Math.max(0, value - 1))
            setActive(null)
          }}
          disabled={page === 0}
        >
          Later months
        </button>
      </nav>
    </>
  )
}

export function KindRow({ group, totalOut }: { group: KindGroup; totalOut: number }) {
  const count = group.lines.filter((l) => !l.refund).length
  const share = totalOut > 0 ? Math.min(100, Math.max(2, Math.round((group.total / totalOut) * 100))) : 0
  return (
    <Item title={group.kind} sub={paymentsWord(count)} value={pounds(group.total)} meter={share}>
      <LineList lines={group.lines} />
    </Item>
  )
}

function RiseRow({ rise }: { rise: Rise }) {
  return (
    <Item
      title={rise.payee.name}
      sub={`was ${pounds(rise.before)} last month`}
      value={
        <>
          {pounds(rise.now)} <span className="acc-delta">+{pounds(rise.now - rise.before)}</span>
        </>
      }
    >
      <LineList lines={rise.lines} />
    </Item>
  )
}

function RegularRow({ item, soon }: { item: Regular; soon: boolean }) {
  const [naming, setNaming] = useState(false)
  // When it is next due only says something for the month you're in; what it comes to in a year always does.
  const sub = [
    `every ${item.every}`,
    soon ? `next around ${dayMonth(item.next)}` : '',
    `${pounds(item.year)} a year`,
    item.changed ? `was ${pounds(item.changed.from)} until ${dayMonth(item.changed.date)} (${yearly(item.changed.year)})` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Item title={item.payee.name} sub={sub} value={pounds(item.amount)}>
      <div className="acc-actions">
        <button type="button" className="acc-link" aria-label={`Rename ${item.payee.name}`} onClick={() => setNaming(true)}>
          Rename
        </button>
      </div>
      <LineList lines={item.lines} />
      {naming ? (
        <RenameSheet title="Rename regular payment" shown={item.payee.name} hint="Applies to existing and future matching payments." onSave={(name) => namePayee(item.payee.key, name)} onClose={() => setNaming(false)} />
      ) : null}
    </Item>
  )
}

/** A payee. Paid once, it's its payment: one tap opens it, with its note, kind, name and receipt. Paid more, it opens to
 *  its payments, and, where it could be, a way to say it's you moving money (the payee is remembered: its lines leave
 *  the totals, in later statements too). */
export function PayeeRow({ group, out = false }: { group: PayeeGroup; out?: boolean }) {
  const { kinds, links, names, notes, openKind, openPayment, openRename } = useMoney()
  const line = group.lines[0]!
  const original = group.payee.original && group.payee.original !== group.payee.name ? group.payee.original : null

  if (group.lines.length === 1) {
    const account = names.get(line.account) ?? line.account
    const way = line.amount < 0 ? `Out of ${account}` : line.refund ? `Back into ${account}` : `Into ${account}`
    const note = notes[line.id]
    return (
      <li className="acc-li">
        <button type="button" className="acc-row" onClick={() => openPayment(line, way, group)}>
          <span className="acc-row-text">
            <span className="acc-row-title">{group.payee.name}</span>
            {original ? (
              <>
                {' '}
                <span className="acc-row-sub">Original: {original}</span>
              </>
            ) : null}{' '}
            <span className="acc-row-sub">
              {shortDayMonth(line.date)} · {way}
              {links.get(line.id) ? ' · Receipt' : ''}
              {note ? ` · “${note}”` : ''}
            </span>
          </span>{' '}
          <span className="acc-row-value">{pounds(Math.abs(line.amount))}</span>
        </button>
      </li>
    )
  }
  const kind = out ? kindOf(line, kinds) : null
  return (
    <Item
      title={group.payee.name}
      sub={
        <>
          {original ? `Original: ${original} · ` : ''}
          {paymentsWord(group.lines.filter((l) => !l.refund).length)}
        </>
      }
      value={pounds(group.total)}
    >
      <div className="acc-actions">
        {out ? (
          <button type="button" className="acc-link" aria-label={`What ${group.payee.name} is for`} onClick={() => openKind(group)}>
            {kind ? `${kind} · Change` : '+ Category'}
          </button>
        ) : null}
        <button type="button" className="acc-link" aria-label={`Rename ${group.payee.name}`} onClick={() => openRename(group.payee)}>
          Rename
        </button>
        {mayBeOwn(group.lines) ? (
          <button type="button" className="acc-link" onClick={() => void markOwnPayee(group.payee.key, true)}>
            It’s me, moving money
          </button>
        ) : null}
      </div>
      <LineList lines={group.lines} />
    </Item>
  )
}

/** Payees you marked as your own, each with a way back, and a name of your own (owner, 2026-10-26: a statement prints
 *  your name, not which account it went to). Payees you gave one name are one. */
function OwnRows({ lines }: { lines: readonly MoneyLine[] }) {
  const [naming, setNaming] = useState<{ name: string; keys: string[]; printed: string } | null>(null)
  const byName = [...new Set(lines.map((l) => l.payee.name))]
  return (
    <>
      {byName.map((name) => {
        const theirs = lines.filter((l) => l.payee.name === name)
        const keys = [...new Set(theirs.map((l) => l.payee.key))]
        const printed = [...new Set(theirs.map((l) => payeeOf(l.description).name))].join(', ')
        return (
          <Item key={name} title={name} sub={`${MOVED.own} · ${movesWord(theirs.length)}`}>
            <div className="acc-actions">
              <button type="button" className="acc-link" aria-label={`Rename ${name}`} onClick={() => setNaming({ name, keys, printed })}>
                Rename
              </button>
              <button type="button" className="acc-link" onClick={() => void Promise.all(keys.map((key) => markOwnPayee(key, false)))}>
                It’s not me: count it again
              </button>
            </div>
            <LineList lines={theirs} />
          </Item>
        )
      })}
      {naming ? (
        <RenameSheet
          title="Rename where it went"
          shown={naming.name}
          hint={`Your statement says ${naming.printed}. Left empty, it’s that again.`}
          onSave={async (name) => {
            for (const key of naming.keys) await namePayee(key, name)
          }}
          onClose={() => setNaming(null)}
        />
      ) : null}
    </>
  )
}

/** Payments, newest first, one per row: the day, where the money went in words, the amount (owner, 2026-10-26: the
 *  same in every section, never a sign that comes and goes). `moves` joins the two sides of a move between your accounts
 *  ("Savings pot → Monzo"). The payee is named only where the rows' payees differ. A payment with its receipt opens it;
 *  with why, when it needs a look. */
export function LineList({ lines, why, moves = false }: { lines: readonly MoneyLine[]; why?: string; moves?: boolean }) {
  const { links, receiptReasons, names, notes, openPayment } = useMoney()
  const rows = moves ? joinMoves(lines) : [...lines].sort((a, b) => b.date.localeCompare(a.date)).map((line) => ({ line }))
  const name = (account: string) => names.get(account) ?? account
  const payees = new Set(lines.map((l) => l.payee.key)).size > 1
  const where = ({ line: l, to }: PaymentRow) => {
    if (to) return `${name(l.account)} → ${name(to.account)}`
    if (l.moving === 'flex') return l.amount > 0 ? 'Spread with Flex' : `Paid off, from ${name(l.account)}`
    if (l.moving === 'own') return l.amount < 0 ? `${name(l.account)} → ${l.payee.name}` : `${l.payee.name} → ${name(l.account)}`
    const way = l.amount < 0 ? `out of ${name(l.account)}` : l.refund ? `back into ${name(l.account)}` : `into ${name(l.account)}`
    return payees ? `${l.payee.name} · ${way}` : way[0]!.toUpperCase() + way.slice(1)
  }
  return (
    <ul className="acc-lines">
      {rows.map((row) => {
        const receipt = links.get(row.line.id)
        const note = notes[row.line.id]
        const receiptDetail = receipt ? (receiptReasons[receipt.id] ? `receipt ${money(paid(receipt), receipt.currency)} · ${receiptReasons[receipt.id]}` : 'receipt') : ''
        const told = [where(row), note ? `“${note}”` : '', receiptDetail, why ?? ''].filter(Boolean).join(' · ')
        return (
          <li key={row.line.id}>
            <button type="button" className="line-button" onClick={() => openPayment(row.line, where(row))}>
              <span className="payment-row">
                <span className="payment-day">{shortDayMonth(row.line.date)}</span>
                <span className="payment-told">{told}</span>
                <span className="payment-amount">{pounds(Math.abs(row.line.amount))}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
