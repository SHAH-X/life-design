import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { markOwnPayee, namePayee } from '../../db/statements'
import type { StatementRecord } from '../../db/types'
import {
  averageOfComplete,
  committedOf,
  joinMoves,
  type ForGroup,
  type ForGroups,
  type KindGroup,
  kindOf,
  mayBeOwn,
  type MoneyLine,
  moneyMonth,
  nameOf,
  moneyMonthTotals,
  MIN_SEARCH,
  NOT_SORTED,
  monthCoverage,
  type Moving,
  paymentYears,
  type PaymentYear,
  searchPayments,
  moneyYear,
  payeeOf,
  type PayeeGroup,
  type PaymentRow as PaymentRowData,
  type Ranked,
  type Regular,
  type RegularChange,
  regularChanges,
  regularPayments,
  regularPaymentsTotal,
  type Rise,
  titleCaseShouted,
  upcoming,
} from '../../domain/money'
import { money, paid, shiftMonth } from '../../domain/shopping'
import { dayMonth, monthName, monthYear, shortDayMonth } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Accounts, RenameSheet } from './Accounts'
import { useMoney } from './MoneyContext'
import { PaymentRow } from './PaymentRow'
import { Icon } from '../../ui/Icon'

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

/** What Money works out for a month of your accounts. */
export type MoneyMonthSums = ReturnType<typeof moneyMonth>

/** The months either side of `month` that Accounts steps to: the one before with something in it, and the one after (or this month). */
export function neighbourMonths(months: readonly string[], month: string, today: string): { earlier?: string; later?: string } {
  const thisMonth = today.slice(0, 7)
  return {
    earlier: months.filter((m) => m < month).at(-1),
    later: month < thisMonth ? (months.find((m) => m > month && m <= thisMonth) ?? thisMonth) : undefined,
  }
}

/** The way back to the latest month from an earlier one, beside the month's name (audit 2026-11-20: it was a link above the title, which moved the title row). */
export function ThisMonth({ href, label = 'This month' }: { href: string; label?: string }) {
  return (
    <a className="small-link acc-this-month" href={href}>
      {label}
    </a>
  )
}

/** The arrows that step between months, in the title row (restyle F, Money b). */
export function MonthStepper({ thisMonth, earlier, later }: { thisMonth: string; earlier?: string; later?: string }) {
  return (
    <nav className="acc-stepper" aria-label="Months">
      {earlier ? (
        <a className="acc-step" href={hashFor('money', earlier)} aria-label={`Earlier: ${monthYear(earlier)}`}>
          <Icon name="chevron-left" />
        </a>
      ) : (
        <span className="acc-step" data-off="" aria-hidden="true">
          <Icon name="chevron-left" />
        </span>
      )}
      {later ? (
        <a className="acc-step" href={hashFor('money', later === thisMonth ? null : later)} aria-label={`Later: ${monthYear(later)}`}>
          <Icon name="chevron-right" />
        </a>
      ) : (
        <span className="acc-step" data-off="" aria-hidden="true">
          <Icon name="chevron-right" />
        </span>
      )}
    </nav>
  )
}

/** A month of your accounts: out and in, where it rose, regular payments, by payee, money moved, to check. */
export function AccountsMonth(props: {
  lines: readonly MoneyLine[]
  /** The month's sums, worked out once by Money (its title row says whether a statement needs attention). */
  its: MoneyMonthSums
  month: string
  today: string
  statements: readonly StatementRecord[]
  closed: ReadonlySet<string>
  section: AccountsSection
  onSection: (section: AccountsSection) => void
  /** What's typed in Spending's search box: kept by Money, so it stays when you step to another month. */
  query: string
  onQuery: (query: string) => void
}) {
  const { lines, its, month, today, statements, closed, section, onSection, query, onQuery } = props
  const { kinds } = useMoney()
  const [jump, setJump] = useState<string | null>(null)
  const changes = regularChanges(lines, month, today, statements, closed)
  // A payment that has stopped is no longer something you're committed to: it is told under What changed instead.
  const stopped = new Set(changes.lapsed.map((l) => l.payee.key))
  const regular = regularPayments(lines, month, today).filter((r) => !stopped.has(r.payee.key))
  const split = committedOf(its.outLines, regular)
  const result = resultWords(its.in, its.out)
  const yearOut = moneyYear(lines, month.slice(0, 4), today, statements, closed, kinds).out
  const thisMonth = today.slice(0, 7)
  const current = month === thisMonth
  const stale = its.toCheck.accounts.length
  // A month with nothing in it that no statement reaches isn't a month of nothing spent: it says so (audit 2026-11-20).
  const unknown = !lines.some((l) => l.date.slice(0, 7) === month) && !statements.some((s) => s.from <= `${month}-31` && s.to >= `${month}-01`)

  // A figure at the top that opens the list it counts: switch to Spending, then bring that list into view.
  useEffect(() => {
    if (!jump || section !== 'spending') return
    document.getElementById(jump)?.scrollIntoView({ block: 'start' })
    setJump(null)
  }, [jump, section])
  const goTo = (id: string) => {
    onQuery('')
    onSection('spending')
    setJump(id)
  }

  return (
    <>
      <header className="acc-hero">
        <div className="acc-hero-top">
          <p className="acc-label">{current ? `${monthName(month)} so far` : monthYear(month)}</p>
          {current ? null : <ThisMonth href={hashFor('money')} />}
        </div>
        {unknown ? (
          <>
            <p className="acc-figure acc-figure-none">
              <strong>No statement yet</strong>
            </p>
            <p className="acc-caption">Bring in a statement that covers {monthName(month)}.</p>
          </>
        ) : (
          <>
            <p className="acc-figure">
              <strong>
                {pounds(its.out)} <span>out</span>
              </strong>
            </p>
            <p className="acc-caption">From your accounts</p>
            {split.committed > 0 ? (
              <>
                <div className="acc-split" aria-hidden="true">
                  <span data-part="committed" style={{ flexGrow: split.committed }} />
                  <span data-part="everyday" style={{ flexGrow: Math.max(split.everyday, 0) }} />
                </div>
                <p className="acc-caption">
                  Committed {pounds(split.committed)} · Everyday {pounds(split.everyday)}
                </p>
              </>
            ) : null}
            <div className="acc-stats" role="group" aria-label="Money in and payments out">
              <button type="button" className="acc-stat" onClick={() => goTo('acc-money-in')}>
                <span className="acc-stat-label">Money in</span> <span className="acc-stat-value" data-in={its.in > 0 || undefined}>{pounds(its.in)}</span>
              </button>
              <button type="button" className="acc-stat" onClick={() => goTo('acc-money-out')}>
                <span className="acc-stat-label">Payments out</span> <span className="acc-stat-value">{paymentsWord(its.outLines.filter((l) => !l.refund).length)}</span>
              </button>
            </div>
          </>
        )}
        {result ? <p className="acc-caption">{current ? `${result} so far` : result}</p> : null}
        {stale ? (
          <button type="button" className="acc-notice" onClick={() => onSection('statements')}>
            <span>{stale === 1 ? '1 account needs a newer statement' : `${stale} accounts need a newer statement`}</span>
            <span aria-hidden="true" className="notice-go">Review<Icon name="chevron-right" size={16} /></span>
          </button>
        ) : null}
      </header>
      {section === 'overview' ? <Overview its={its} lines={lines} regular={regular} changes={changes} yearOut={yearOut} statements={statements} closed={closed} month={month} today={today} /> : null}
      {section === 'spending' ? <Spending its={its} lines={lines} query={query} onQuery={onQuery} jump={jump} /> : null}
      {section === 'statements' ? <Statements its={its} /> : null}
    </>
  )
}

type Its = MoneyMonthSums

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
  const current = month === today.slice(0, 7)
  const coming = current ? upcoming(regular, today, COMING_DAYS) : []
  const lastMonth = monthName(shiftMonth(month, -1))
  const roseCount = its.rose.ranked.length + its.rose.others.length
  const anyRose = roseCount > 0
  const movedCount = roseCount + went.length + changes.started.length + changes.lapsed.length
  const [open, setOpen] = useState<'regular' | 'moved' | null>(null)
  const panelId = useId()
  const toggle = (which: 'regular' | 'moved') => setOpen(open === which ? null : which)
  const comingTotal = coming.reduce((sum, u) => sum + u.amount, 0)
  const yearLabel = month.slice(0, 4) === today.slice(0, 4) ? `${month.slice(0, 4)} so far` : month.slice(0, 4)
  return (
    <>
      <div className="acc-chart">
        <Chart lines={lines} statements={statements} closed={closed} month={month} today={today} />
      </div>
      <div className="acc-tiles" role="group" aria-label="More about this month">
        {regular.length ? (
          <button type="button" className="acc-tile" aria-expanded={open === 'regular'} aria-controls={panelId} onClick={() => toggle('regular')}>
            <span className="acc-tile-label">Regular payments</span>
            <span className="acc-tile-value">{cadence.join(' + ')}</span>
            <span className="acc-tile-sub">{paymentsWord(regular.length)}{coming.length ? ` · ${pounds(comingTotal)} due soon` : ''}</span>
          </button>
        ) : null}
        {movedCount ? (
          <button type="button" className="acc-tile" aria-expanded={open === 'moved'} aria-controls={panelId} onClick={() => toggle('moved')}>
            <span className="acc-tile-label">What moved</span>
            <span className="acc-tile-value">{movedCount === 1 ? '1 change' : `${movedCount} changes`}</span>
            <span className="acc-tile-sub">{[roseCount ? `${roseCount} rose` : '', went.length ? `${went.length} changed` : '', changes.started.length ? `${changes.started.length} new` : '', changes.lapsed.length ? `${changes.lapsed.length} stopped` : ''].filter(Boolean).join(' · ')}</span>
          </button>
        ) : null}
        <a className="acc-tile" href={hashFor('money', month.slice(0, 4))}>
          <span className="acc-tile-label">{yearLabel}</span>
          <span className="acc-tile-value">{pounds(yearOut)} out</span>
          <span className="acc-tile-sub">The year, month by month</span>
        </a>
      </div>
      <div id={panelId}>
        {open === 'regular' && regular.length ? (
          <Block title="Regular payments">
            {/* Three kinds of information, kept apart (v0.45.0): what they come to, what is due soon, and each payment. */}
            <div className="acc-total">
              <p className="acc-total-label">Total regular payments</p>
              <p className="acc-total-year">
                {pounds(totals.year)} <span>a year</span>
              </p>
              <p className="acc-total-sub">
                {totals.weekly > 0 && totals.monthly > 0 ? `${cadence.join(' + ')} · ${paymentsWord(regular.length)}` : `${paymentsWord(regular.length)}, all ${totals.weekly > 0 ? 'weekly' : 'monthly'}`}
              </p>
            </div>
            {coming.length ? (
              <section className="acc-coming" aria-labelledby={`${panelId}-coming`}>
                <p id={`${panelId}-coming`} className="acc-sublabel">
                  Coming up · {paymentsWord(coming.length)} in the next {COMING_DAYS} days · {pounds(comingTotal)}
                </p>
                <ul>
                  {coming.map((u) => (
                    <li key={`${u.payee.key}-${u.date}`}>
                      <span className="acc-coming-date">{dayMonth(u.date)}</span>
                      <span className="acc-coming-name">{u.payee.name}</span>
                      <span className="acc-coming-amount">{pounds(u.amount)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <p className="acc-sublabel acc-sublabel-list">Each regular payment</p>
            <ul className="acc-list">
              {regular.map((r) => (
                <RegularRow key={r.payee.key} item={r} soon={current} />
              ))}
            </ul>
          </Block>
        ) : null}
        {open === 'moved' ? (
          <>
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
          </>
        ) : null}
      </div>
    </>
  )
}

/** Search results show at most this many payments, newest first: a search for one letter-pair can match thousands. */
const SEARCH_LIMIT = 200

/** What a year of a search says: payments out and what they come to, money back, money in. Money moved is under it. */
function yearWords(y: PaymentYear): string {
  const out = y.out >= 0 ? pounds(y.out) : `${pounds(-y.out)} back`
  return [y.payments ? `${paymentsWord(y.payments)} · ${out}` : y.out < 0 ? out : '', y.in ? `${pounds(y.in)} in` : ''].filter(Boolean).join(' · ')
}

/** Every payment a search found, by year with what each year comes to, newest first. Each row names its payee, since the
 *  search is why it is here; money moved is apart, closed, as it is in a month (v0.20.34). */
function SearchResults({ found }: { found: readonly MoneyLine[] }) {
  if (!found.length) return <p className="acc-status">Nothing found.</p>
  const shown = new Set(found.slice(0, SEARCH_LIMIT))
  return (
    <>
      {paymentYears(found).map((y) => {
        const moves = y.moves.filter((l) => shown.has(l))
        const lines = y.lines.filter((l) => shown.has(l))
        return (
          <Block key={y.year} title={y.year} status={yearWords(y)}>
            {lines.length ? <LineList lines={lines} named /> : null}
            {moves.length ? (
              <ul className="acc-list">
                <Item title="Moved between your accounts" sub={`${movesWord(y.moves.length)}, left out`}>
                  <LineList lines={moves} named />
                </Item>
              </ul>
            ) : null}
          </Block>
        )
      })}
      {found.length > SEARCH_LIMIT ? <p className="acc-status">Showing the newest {SEARCH_LIMIT} of {found.length}. Type more to narrow it down.</p> : null}
    </>
  )
}

function Spending({ its, lines, query, onQuery, jump }: { its: Its; lines: readonly MoneyLine[]; query: string; onQuery: (query: string) => void; jump: string | null }) {
  const searchId = useId()
  const box = useRef<HTMLInputElement>(null)
  const searching = query.trim().length >= MIN_SEARCH
  return (
    <>
      {/* The same look as Logs' search box, with a ✕ to clear it (owner, 2026-11-01: say what it searches). */}
      <div className="logs-search">
        <span aria-hidden="true">
          <Icon name="search" />
        </span>
        <label className="visually-hidden" htmlFor={searchId}>
          Search every payment, by name or amount
        </label>
        <input ref={box} id={searchId} type="search" placeholder="Search by name or amount" value={query} onChange={(e) => onQuery(e.target.value)} />
        {query ? (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear the search"
            onClick={() => {
              onQuery('')
              box.current?.focus()
            }}
          ><Icon name="close" size={16} /></button>
        ) : null}
      </div>
      {searching ? <SearchResults found={searchPayments(lines, query)} /> : <SpendingMonth its={its} jump={jump} />}
    </>
  )
}

/** How many kinds are named in the bar and the rows under it; the rest are one piece, "Everything else". */
const TOP_KINDS = 5
/** The bar's pieces, biggest first, each a lighter tint of the one green: a row's swatch is the same tint (the figures are in the rows). */
const tintOf = (rank: number) => 1 - rank * 0.17

/** One line that opens a list of payments (v0.42.0): its name and what is in it, closed until asked for. */
function Fold({ id, title, sub, open, onToggle, children }: { id?: string; title: string; sub: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const titleId = useId()
  return (
    <section id={id} className="acc-block acc-fold" aria-labelledby={titleId}>
      <h2 className="acc-fold-heading">
        <button type="button" className="acc-fold-top" aria-expanded={open} onClick={onToggle}>
          <span className="acc-row-text">
            <span id={titleId} className="acc-row-title">{title}</span> <span className="acc-row-sub">{sub}</span>
          </span>
          <span className="acc-fold-chevron" aria-hidden="true">
            <Icon name="chevron-right" size={16} />
          </span>
        </button>
      </h2>
      {open ? children : null}
    </section>
  )
}

function SpendingMonth({ its, jump }: { its: Its; jump: string | null }) {
  // The lists a figure at the top opens ("Payments out") come open; the rest are closed.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set(jump ? [jump] : []))
  useEffect(() => {
    if (jump) setOpened((now) => new Set(now).add(jump))
  }, [jump])
  const flip = (id: string) => setOpened((now) => { const next = new Set(now); if (!next.delete(id)) next.add(id); return next })
  const top = its.kinds.ranked.slice(0, TOP_KINDS)
  const rest = [...its.kinds.ranked.slice(TOP_KINDS), ...its.kinds.others]
  const restTotal = rest.reduce((sum, g) => sum + g.total, 0)
  const restPayments = rest.reduce((sum, g) => sum + g.lines.filter((l) => !l.refund).length, 0)
  const bar = [...top.map((g, i) => ({ total: g.total, part: String(i) })), ...(rest.length ? [{ total: restTotal, part: 'rest' }] : [])].filter((p) => p.total > 0)
  const moneyOut = its.payees.out.ranked.length + its.payees.out.others.length
  const moneyIn = its.payees.in.ranked.length + its.payees.in.others.length
  return (
    <>
      {its.outLines.length ? (
        <Block title="By what it was for">
          {top.length ? (
            <>
              <div className="acc-kinds-bar" aria-hidden="true">
                {bar.map((p) => (
                  <span key={p.part} data-part={p.part} style={{ flexGrow: p.total, ...(p.part === 'rest' ? {} : { opacity: tintOf(Number(p.part)) }) }} />
                ))}
              </div>
              <ul className="acc-list">
                {top.map((g, i) => (
                  <KindRow key={g.kind} group={g} totalOut={its.out} tint={tintOf(i)} />
                ))}
                {rest.length ? (
                  <Item title="Everything else" sub={`${rest.length} ${rest.length === 1 ? 'kind' : 'kinds'} · ${paymentsWord(restPayments)}`} value={pounds(restTotal)}>
                    <Groups of={{ ranked: its.kinds.ranked.slice(TOP_KINDS), others: its.kinds.others }} line={(g: KindGroup) => <KindRow key={g.kind} group={g} totalOut={its.out} />} fewer="Fewer than 3 payments, by name" />
                  </Item>
                ) : null}
              </ul>
            </>
          ) : (
            // No kind has 3 payments yet: a bar of one grey piece says nothing, so these are listed by name as before.
            <Groups of={its.kinds} line={(g: KindGroup) => <KindRow key={g.kind} group={g} totalOut={its.out} />} fewer="Fewer than 3 payments, by name" />
          )}
        </Block>
      ) : null}
      {its.outLines.length ? (
        <Fold id="acc-money-out" title="Money out" sub={`${paymentsWord(its.outLines.filter((l) => !l.refund).length)} · ${moneyOut} ${moneyOut === 1 ? 'name' : 'names'}`} open={opened.has('acc-money-out')} onToggle={() => flip('acc-money-out')}>
          <Groups of={its.payees.out} line={(g: PayeeGroup) => <PayeeRow key={g.payee.key} group={g} out />} fewer="Fewer than 3 payments, by name" />
        </Fold>
      ) : null}
      {its.inLines.length ? (
        <Fold id="acc-money-in" title="Money in" sub={`${paymentsWord(its.inLines.length)} · ${moneyIn} ${moneyIn === 1 ? 'name' : 'names'}`} open={opened.has('acc-money-in')} onToggle={() => flip('acc-money-in')}>
          <Groups of={its.payees.in} line={(g: PayeeGroup) => <PayeeRow key={g.payee.key} group={g} />} fewer="Fewer than 3 payments, by name" />
        </Fold>
      ) : null}
      {its.forWho ? (
        <Fold title="Who it was for" sub={`${its.forWho.ranked.length + its.forWho.others.length + (its.forWho.nobody ? 1 : 0)} ${its.forWho.ranked.length + its.forWho.others.length + (its.forWho.nobody ? 1 : 0) === 1 ? 'group' : 'groups'}`} open={opened.has('who')} onToggle={() => flip('who')}>
          <Groups of={its.forWho} line={(g: ForGroup) => <ForRow key={g.who} group={g} />} fewer="Fewer than 3 payments, by name" />
          {its.forWho.nobody ? (
            <ul className="acc-list">
              <ForRow group={its.forWho.nobody} />
            </ul>
          ) : null}
        </Fold>
      ) : null}
      {its.moved.length ? (
        <Fold title="Moved between your accounts" sub="Left out of money in and out" open={opened.has('moved')} onToggle={() => flip('moved')}>
          <ul className="acc-list">
            {its.moved.map((m) =>
              m.why === 'own' ? <OwnRows key={m.why} lines={m.lines} /> : (
                <Item key={m.why} title={MOVED[m.why]} sub={movesWord(joinMoves(m.lines).length)}>
                  <LineList lines={m.lines} moves />
                </Item>
              ),
            )}
          </ul>
        </Fold>
      ) : null}
    </>
  )
}

function Statements({ its }: { its: Its }) {
  // Which account needs a newer statement is said by Your accounts itself, with the days it covers and is missing (v0.46.0, owner
  // 2026-11-20: "I don't know what is the purpose of To check"); what is left here is payments, and only when there are some.
  const { lines } = its.toCheck
  return (
    <>
      <Accounts />
      {lines.length ? (
        <Block title="Payments to check" status="Their statement’s printed balance doesn’t match">
          <LineList lines={lines} why="doesn’t match its printed balance" />
        </Block>
      ) : null}
    </>
  )
}

/** A titled part of a tab: its heading names the region, one short status line under it. */
export function Block({ id, title, status, children }: { id?: string; title: string; status?: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section id={id} className="acc-block" aria-labelledby={headingId}>
      <header className="acc-block-top">
        <h2 id={headingId}>{title}</h2>
        {status ? <p className="acc-status">{status}</p> : null}
      </header>
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
/** `unsorted`: the meter is neutral ink, not the green of a kind (green reads as success, and this is the one to sort). */
export function Item({ title, sub, value, tone, meter, swatch, unsorted = false, children }: { title: string; sub?: ReactNode; value?: ReactNode; tone?: 'in' | 'loss'; meter?: number; /** A kind's tint in the bar above (its opacity). */ swatch?: number; unsorted?: boolean; children: ReactNode }) {
  return (
    <li className="acc-li">
      <details className="acc-item">
        <summary className="acc-row">
          <span className="acc-row-text">
            {swatch !== undefined ? <span className="acc-swatch" style={{ opacity: swatch }} aria-hidden="true" /> : null}
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
              <span className="acc-row-value" data-in={tone === 'in' || undefined} data-loss={tone === 'loss' || undefined}>
                {value}
              </span>
            </>
          ) : null}
          {meter !== undefined ? (
            <span className="acc-meter" data-unsorted={unsorted || undefined} aria-hidden="true">
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
          note: coverage[i]!.uncovered && !m.lines ? 'no statement for this month' : m.month < thisMonth && coverage[i]!.missing.length ? `not every statement is in: ${coverage[i]!.missing.map((account) => names.get(account) ?? account).join(', ')}` : undefined,
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
              Open {monthYear(tapped.month)}<Icon name="chevron-right" size={16} />
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

/** Who it was for (v0.20.38): money out by the name you filed it under, each opening to its payments; what no name was
 *  given to last. */
export function ForBlock({ who }: { who: ForGroups }) {
  return (
    <Block title="Who it was for">
      <Groups of={who} line={(g: ForGroup) => <ForRow key={g.who} group={g} />} fewer="Fewer than 3 payments, by name" />
      {who.nobody ? (
        <ul className="acc-list">
          <ForRow group={who.nobody} />
        </ul>
      ) : null}
    </Block>
  )
}

function ForRow({ group }: { group: ForGroup }) {
  return (
    <Item title={group.who} sub={paymentsWord(group.lines.filter((l) => !l.refund).length)} value={pounds(group.total)}>
      <LineList lines={group.lines} />
    </Item>
  )
}

export function KindRow({ group, totalOut, tint }: { group: KindGroup; totalOut: number; tint?: number }) {
  const count = group.lines.filter((l) => !l.refund).length
  const share = totalOut > 0 ? Math.min(100, Math.max(2, Math.round((group.total / totalOut) * 100))) : 0
  return (
    <Item title={group.kind} sub={paymentsWord(count)} value={pounds(group.total)} meter={tint === undefined ? share : undefined} swatch={tint} unsorted={group.kind === NOT_SORTED}>
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

/** A payee. Paid once, it's its payment: one tap opens it, with its kind, name and receipt. Paid more, it opens to
 *  its payments, and, where it could be, a way to say it's you moving money (the payee is remembered: its lines leave
 *  the totals, in later statements too). */
export function PayeeRow({ group, out = false }: { group: PayeeGroup; out?: boolean }) {
  const { kinds, links, names, openKind, openRename } = useMoney()
  const line = group.lines[0]!
  const original = group.payee.original && group.payee.original !== group.payee.name ? group.payee.original : null

  if (group.lines.length === 1) {
    const account = names.get(line.account) ?? line.account
    const way = line.amount < 0 ? `Out of ${account}` : line.refund ? `Back into ${account}` : `Into ${account}`
    const sub = [line.label ? group.payee.name : '', original ? `Original: ${original}` : '', `${shortDayMonth(line.date)} · ${way}${links.get(line.id) ? ' · Receipt' : ''}`].filter(Boolean).join(' · ')
    return <PaymentRow line={line} title={nameOf(line)} sub={sub} way={way} group={group} />
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

/** What a Flex line was bought: Flex's own statement words it "… moved to Flex", and the purchase is what's before that. It
 *  has lower case in it, so the bank's capitals are shown in title case (a name you gave it is as you wrote it). */
const flexPurchase = (l: MoneyLine) => l.label ?? titleCaseShouted(l.payee.name.replace(/\s+moved to Flex$/i, ''))

/** Payments, newest first, one per row: the day, where the money went in words, the amount (owner, 2026-10-26: the
 *  same in every section, never a sign that comes and goes). `moves` joins the two sides of a move between your accounts
 *  ("Savings pot → Monzo"). The payee is named only where the rows' payees differ, or always with `named` (a search's
 *  results). A payment with its receipt opens it;
 *  with why, when it needs a look. */
export function LineList({ lines, why, moves = false, named = false }: { lines: readonly MoneyLine[]; why?: string; moves?: boolean; named?: boolean }) {
  const { links, receiptReasons, names } = useMoney()
  const rows = moves ? joinMoves(lines) : [...lines].sort((a, b) => b.date.localeCompare(a.date)).map((line) => ({ line }))
  const name = (account: string) => names.get(account) ?? account
  const payees = named || new Set(lines.map((l) => l.payee.key)).size > 1
  const where = ({ line: l, to }: PaymentRowData, bare = false) => {
    if (to) return `${name(l.account)} → ${name(to.account)}`
    if (l.moving === 'flex') {
      const flex = l.amount > 0 ? 'Spread with Flex' : `Paid off, from ${name(l.account)}`
      // Flex's own statement words it "… moved to Flex": the purchase's name is what's before that.
      // That description has lower case in it, so the bank's capitals are shown in title case here (a name you gave it is as you wrote it).
      const purchase = flexPurchase(l)
      return named && !bare && l.amount < 0 ? `${purchase} · ${flex[0]!.toLowerCase()}${flex.slice(1)}` : flex
    }
    if (l.moving === 'own') return l.amount < 0 ? `${name(l.account)} → ${l.payee.name}` : `${l.payee.name} → ${name(l.account)}`
    const way = l.amount < 0 ? `out of ${name(l.account)}` : l.refund ? `back into ${name(l.account)}` : `into ${name(l.account)}`
    return !bare && (payees || l.label) ? `${nameOf(l)} · ${way}` : way[0]!.toUpperCase() + way.slice(1)
  }
  return (
    <ul className="acc-lines">
      {rows.map((row) => {
        const receipt = links.get(row.line.id)
        const receiptDetail = receipt ? (receiptReasons[receipt.id] ? `receipt ${money(paid(receipt), receipt.currency)} · ${receiptReasons[receipt.id]}` : 'receipt') : ''
        // With a name to show (payees differ, a search, a name you gave it) the name leads and the day goes underneath.
        const named_ = payees || Boolean(row.line.label)
        const day = shortDayMonth(row.line.date)
        const sub = [named_ ? day : '', where(row, true), receiptDetail, why ?? ''].filter(Boolean).join(' · ')
        const title = row.line.moving === 'flex' && !('to' in row && row.to) ? flexPurchase(row.line) : nameOf(row.line)
        return <PaymentRow key={row.line.id} line={row.line} title={named_ ? title : day} sub={sub} way={where(row)} />
      })}
    </ul>
  )
}
