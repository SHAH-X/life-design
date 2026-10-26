import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, type ReactNode, useContext, useId, useState } from 'react'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import { accountNamesOf, CLOSED_ACCOUNTS, markOwnPayee, namePayee, OWN_PAYEES, ownPayeesOf, PAYEE_NAMES } from '../../db/statements'
import type { StatementRecord } from '../../db/types'
import { classify, joinMoves, linkReceipts, mayBeOwn, payeeOf, type PaymentRow, type MoneyLine, moneyMonth, moneyMonthTotals, type Moving, type PayeeGroup, type Ranked, regularPayments, type Rise } from '../../domain/money'
import { inWords, type KnownReceipt, money, receiptsAndCopies, shiftMonth, shoppingMonth, shoppingMonths } from '../../domain/shopping'
import { dayMonth, dayMonthLong, monthName, monthYear, shortDayMonth, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Loading } from '../../ui/Loading'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { useOwnWords } from '../today/useOwnWords'
import { usePurposeSettings } from '../today/usePurpose'
import { Accounts, RenameSheet } from './Accounts'
import { ReceiptsMonth, ReceiptsShare, receiptsWord, Section } from './Receipts'
import { useAccountNames } from './useAccountNames'

/** The chart shows this many months, the page's own the last. */
const CHART_MONTHS = 6

const pounds = (pence: number) => money(pence, '£')
const paymentsWord = (n: number) => `${n} payment${n === 1 ? '' : 's'}`
const movesWord = (n: number) => `${n} move${n === 1 ? '' : 's'}`

/** Why money moved is left out, in words. */
const MOVED: Record<Moving, string> = {
  flex: 'Monzo Flex',
  pot: 'Pots',
  between: 'Between your accounts',
  own: 'Your own account',
}

/** Card payments linked to their receipts (v0.20.2), opening one, and the accounts' names: every list of payments reads it. */
const Receipts = createContext<{ links: ReadonlyMap<string, KnownReceipt>; open: (r: KnownReceipt) => void; names: ReadonlyMap<string, string> }>({
  links: new Map(),
  open: () => {},
  names: new Map(),
})

/**
 * Money (v0.20, the Shopping tab before): what came in and went out of your accounts, from the statements you bring in,
 * then what you bought, from your receipts. All worked out on the phone with no AI; money moved between your own
 * accounts is left out. This month at #/money (#/shopping still opens it), an earlier one at #/money/2026-09. Counts and
 * amounts only (no averages, ratings or a limit); every line opens to what it counts.
 */
export function MoneyScreen({ sub }: { sub: string | null }) {
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const bankLines = useLiveQuery(() => db.bankLines.toArray(), [])
  const statements = useLiveQuery(() => db.statements.toArray(), [])
  const own = useLiveQuery(async () => ownPayeesOf(await db.settings.get(OWN_PAYEES)), [])
  const names = useAccountNames()
  const closed = useLiveQuery(async () => new Set(ownPayeesOf(await db.settings.get(CLOSED_ACCOUNTS))), [])
  const payeeNames = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYEE_NAMES)), [])
  const ownWords = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  const earlierId = useId()
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || bankLines === undefined || statements === undefined || own === undefined || names === undefined || payeeNames === undefined || closed === undefined || ownWords === undefined || purpose === undefined) return <Loading />

  const byId = new Map(entries.map((e) => [e.id, e]))
  const open = (receipt: KnownReceipt) => {
    const entry = byId.get(receipt.entryId)
    if (entry) setSheet({ kind: 'open', entry })
  }
  const { receipts, copies } = receiptsAndCopies(entries)
  const lines = classify(bankLines, new Set(own), payeeNames)
  const links = linkReceipts(lines, receipts)
  const today = toDateKey(new Date())
  const thisMonth = today.slice(0, 7)
  const month = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : thisMonth
  const earlier = [...new Set([...shoppingMonths(receipts), ...lines.filter((l) => !l.moving).map((l) => l.date.slice(0, 7))])].filter((m) => m < thisMonth).sort().reverse()

  return (
    <Receipts.Provider value={{ links, open, names }}>
      {month === thisMonth ? (
        <h1>Money</h1>
      ) : (
        <>
          <a className="back-link" href={hashFor('money')}>
            ‹ Money
          </a>
          <h1>{monthYear(month)}</h1>
        </>
      )}
      {/* Keyed by month: a month opened from another starts afresh (a tapped chart column doesn't carry over). */}
      {lines.length ? <AccountsMonth key={`accounts-${month}`} lines={lines} month={month} today={today} statements={statements} closed={closed} /> : null}
      <ReceiptsMonth key={`receipts-${month}`} receipts={receipts} copies={copies} month={month} today={today} onOpen={open} />
      {month === thisMonth && earlier.length ? (
        <section aria-labelledby={earlierId}>
          <h2 id={earlierId} className="week-title">
            Earlier months
          </h2>
          <nav className="list" aria-labelledby={earlierId}>
            {earlier.map((m) => {
              const out = moneyMonth(lines, m, today, statements, closed).out
              const bought = shoppingMonth(receipts, m, today)
              const said = [out ? `${pounds(out)} out` : '', bought.receipts.length ? `${inWords(bought.spent)} on ${receiptsWord(bought.receipts.length)}` : ''].filter(Boolean).join(' · ')
              return (
                <a key={m} className="list-row" href={hashFor('money', m)}>
                  <span className="list-text">
                    <span className="list-title">{monthYear(m)}</span>
                    <span className="list-status">{said}</span>
                  </span>
                  <span className="list-chevron" aria-hidden="true">
                    ›
                  </span>
                </a>
              )
            })}
          </nav>
        </section>
      ) : null}
      {month === thisMonth && receipts.length ? <ReceiptsShare receipts={receipts} /> : null}
      <Accounts />
      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={ownWords} purpose={purpose} />
    </Receipts.Provider>
  )
}

/** A month of your accounts: out and in, where it rose, regular payments, by payee, money moved, to check. */
function AccountsMonth(props: { lines: readonly MoneyLine[]; month: string; today: string; statements: readonly StatementRecord[]; closed: ReadonlySet<string> }) {
  const { lines, month, today, statements, closed } = props
  const { names } = useContext(Receipts)
  const its = moneyMonth(lines, month, today, statements, closed)
  const regular = regularPayments(lines, month)
  const current = month === today.slice(0, 7)
  const lastMonth = monthName(shiftMonth(month, -1))
  const anyRose = its.rose.ranked.length + its.rose.others.length > 0
  return (
    <>
      <div className="card">
        <p className="muted small">{current ? `${monthName(month)} so far, from your accounts` : `${monthYear(month)}, from your accounts`}</p>
        <p>
          <strong>{pounds(its.out)} out</strong>
        </p>
        <ul className="plain-list compact">
          {its.before ? <LinesLine label={`By ${dayMonthLong(its.before.until)}`} detail={`${pounds(its.before.out)} out`} lines={its.before.lines} /> : null}
          <LinesLine label={`${pounds(its.in)} in`} lines={its.inLines} />
          <LinesLine label={`${paymentsWord(its.outLines.length)} out`} lines={its.outLines} />
        </ul>
      </div>
      <div className="card">
        <Chart lines={lines} month={month} today={today} />
      </div>
      {anyRose ? (
        <Section title="Where it rose" status={current ? `Next to ${lastMonth} by the same day` : `Next to ${lastMonth}`}>
          <Groups
            of={its.rose}
            line={(r: Rise) => <LinesLine key={r.payee.key} label={r.payee.name} detail={`${pounds(r.now)}, up from ${pounds(r.before)}`} lines={r.lines} />}
            fewer="Fewer than 3 payments, by name"
          />
        </Section>
      ) : null}
      {regular.length ? (
        <Section title="Regular payments">
          <ul className="plain-list compact">
            {regular.map((r) => (
              <LinesLine
                key={r.payee.key}
                label={r.payee.name}
                detail={[`every ${r.every}`, pounds(r.amount), r.changed ? `was ${pounds(r.changed.from)} until ${dayMonth(r.changed.date)}` : ''].filter(Boolean).join(' · ')}
                lines={r.lines}
              />
            ))}
          </ul>
        </Section>
      ) : null}
      {its.outLines.length ? (
        <Section title="Money out">
          <Groups of={its.payees.out} line={(g: PayeeGroup) => <PayeeLine key={g.payee.key} group={g} />} fewer="Fewer than 3 payments, by name" />
        </Section>
      ) : null}
      {its.inLines.length ? (
        <Section title="Money in">
          <Groups of={its.payees.in} line={(g: PayeeGroup) => <PayeeLine key={g.payee.key} group={g} />} fewer="Fewer than 3 payments, by name" />
        </Section>
      ) : null}
      {its.moved.length ? (
        <Section title="Moved between your accounts" status="Left out of money in and out">
          <ul className="plain-list compact">
            {its.moved.map((m) =>
              m.why === 'own' ? (
                <OwnLines key={m.why} lines={m.lines} />
              ) : (
                <LinesLine key={m.why} label={MOVED[m.why]} detail={movesWord(joinMoves(m.lines).length)} lines={m.lines} moves />
              ),
            )}
          </ul>
        </Section>
      ) : null}
      {its.toCheck.lines.length || its.toCheck.accounts.length ? (
        <Section title="To check">
          <ul className="plain-list compact">
            {its.toCheck.accounts.map((a) => (
              <li key={a.account}>
                {names.get(a.account) ?? a.account}
                <span className="muted small"> · statements up to {dayMonth(a.until)}</span>
              </li>
            ))}
          </ul>
          {its.toCheck.lines.length ? <LineList lines={its.toCheck.lines} why="doesn’t match its printed balance" /> : null}
        </Section>
      ) : null}
    </>
  )
}

/** Groups ranked only with 3+ payments, most first; the rest by name. */
function Groups<T>({ of, line, fewer }: { of: Ranked<T>; line: (item: T) => ReactNode; fewer: string }) {
  return (
    <>
      {of.ranked.length ? <ul className="plain-list compact">{of.ranked.map(line)}</ul> : null}
      {of.ranked.length && of.others.length ? <p className="muted small">{fewer}</p> : null}
      {of.others.length ? <ul className="plain-list compact">{of.others.map(line)}</ul> : null}
    </>
  )
}

/** Money out each month, from your accounts. */
function Chart({ lines, month, today }: { lines: readonly MoneyLine[]; month: string; today: string }) {
  const [active, setActive] = useState<number | null>(null)
  const thisMonth = today.slice(0, 7)
  const months = moneyMonthTotals(lines, month, CHART_MONTHS)
  const tapped = active === null ? undefined : months[active]
  return (
    <MonthChart
      title="Spent each month"
      months={months.map((m) => ({
        key: m.month,
        axisLabel: monthName(m.month, 'short'),
        title: m.month === thisMonth ? `${monthName(m.month)} so far` : monthYear(m.month),
        value: m.out,
        amount: pounds(m.out),
        receipts: m.lines,
      }))}
      currency="£"
      summary="Tap a month"
      active={active}
      onActive={setActive}
      labelled={months.length - 1}
      counted={{ heading: 'Payments', word: paymentsWord, none: 'no payments' }}
      detail={
        tapped && tapped.month !== month && tapped.lines ? (
          <a className="small-link" href={hashFor('money', tapped.month === thisMonth ? null : tapped.month)}>
            Open {monthYear(tapped.month)} ›
          </a>
        ) : null
      }
    />
  )
}

/** A line that opens to its payments. */
function LinesLine({ label, detail, lines, moves }: { label: string; detail?: string; lines: readonly MoneyLine[]; moves?: boolean }) {
  return (
    <li>
      <details className="week-line">
        <summary>
          <span>{label}</span>
          {detail ? <span className="muted small"> · {detail}</span> : null}
        </summary>
        <LineList lines={lines} moves={moves} />
      </details>
    </li>
  )
}

/** A payee, opening to its payments, and, where it could be, a way to say it's you moving money (the payee is remembered:
 *  its lines leave the totals, in later statements too). */
function PayeeLine({ group }: { group: PayeeGroup }) {
  return (
    <li>
      <details className="week-line">
        <summary>
          <span>{group.payee.name}</span>
          <span className="muted small">
            {' '}
            · {paymentsWord(group.lines.filter((l) => !l.refund).length)} · {pounds(group.total)}
          </span>
        </summary>
        <LineList lines={group.lines} />
        {mayBeOwn(group.lines) ? (
          <button type="button" className="small-link" onClick={() => void markOwnPayee(group.payee.key, true)}>
            It’s me, moving money
          </button>
        ) : null}
      </details>
    </li>
  )
}

/** Payees you marked as your own, each with a way back, and a name of your own (owner, 2026-10-26: a statement prints
 *  your name, not which account it went to). Payees you gave one name are one. */
function OwnLines({ lines }: { lines: readonly MoneyLine[] }) {
  const [naming, setNaming] = useState<{ name: string; keys: string[]; printed: string } | null>(null)
  const byName = [...new Set(lines.map((l) => l.payee.name))]
  return (
    <>
      {byName.map((name) => {
        const theirs = lines.filter((l) => l.payee.name === name)
        const keys = [...new Set(theirs.map((l) => l.payee.key))]
        const printed = [...new Set(theirs.map((l) => payeeOf(l.description).name))].join(', ')
        return (
          <li key={name}>
            <details className="week-line">
              <summary>
                <span>{name}</span>
                <span className="muted small">
                  {' '}
                  · {MOVED.own} · {movesWord(theirs.length)}
                </span>
              </summary>
              <LineList lines={theirs} />
              <button type="button" className="small-link" aria-label={`Rename ${name}`} onClick={() => setNaming({ name, keys, printed })}>
                Rename
              </button>
              <button type="button" className="small-link" onClick={() => void Promise.all(keys.map((key) => markOwnPayee(key, false)))}>
                It’s not me: count it again
              </button>
            </details>
          </li>
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
function LineList({ lines, why, moves = false }: { lines: readonly MoneyLine[]; why?: string; moves?: boolean }) {
  const { links, open, names } = useContext(Receipts)
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
    <ul className="plain-list compact evidence-list">
      {rows.map((row) => {
        const receipt = links.get(row.line.id)
        const told = [where(row), receipt ? 'receipt ›' : '', why ?? ''].filter(Boolean).join(' · ')
        const said = (
          <span className="payment-row">
            <span className="payment-day">{shortDayMonth(row.line.date)}</span>
            <span className="payment-told">{told}</span>
            <span className="payment-amount">{pounds(Math.abs(row.line.amount))}</span>
          </span>
        )
        return (
          <li key={row.line.id}>
            {receipt ? (
              <button type="button" className="line-button" onClick={() => open(receipt)}>
                {said}
              </button>
            ) : (
              said
            )}
          </li>
        )
      })}
    </ul>
  )
}
