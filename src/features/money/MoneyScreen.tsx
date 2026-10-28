import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, type ReactNode, useContext, useEffect, useId, useState } from 'react'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import {
  acceptReceiptDate,
  accountNamesOf,
  CLOSED_ACCOUNTS,
  markOwnPayee,
  matchReceiptPayment,
  PAYEE_KINDS,
  PAYMENT_NOTES,
  namePayee,
  OWN_PAYEES,
  ownPayeesOf,
  PAYEE_NAMES,
  RECEIPT_REVIEWS,
  receiptReviewState,
  unmatchReceiptPayment,
} from '../../db/statements'
import type { StatementRecord } from '../../db/types'
import { classify, joinMoves, type KindGroup, kindOf, linkReceipts, mayBeOwn, payeeOf, type PaymentRow, type MoneyLine, moneyMonth, moneyMonthTotals, type Moving, type Payee, type PayeeGroup, type Ranked, regularPayments, receiptPaymentCandidates, type Rise, type Regular } from '../../domain/money'
import { inWords, type KnownReceipt, money, paid, receiptsAndCopies, shiftMonth, shoppingMonth, shoppingMonths } from '../../domain/shopping'
import { dayMonth, dayMonthLong, monthName, monthYear, shortDayMonth, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Loading } from '../../ui/Loading'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { useOwnWords } from '../today/useOwnWords'
import { usePurposeSettings } from '../today/usePurpose'
import { Accounts, RenameSheet } from './Accounts'
import { ReceiptsMonth, ReceiptsShare, receiptsWord, Section } from './Receipts'
import { KindSheet, PaymentSheet } from './PaymentSheets'
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
const Receipts = createContext<{
  links: ReadonlyMap<string, KnownReceipt>
  receiptReasons: Readonly<Record<string, string>>
  open: (r: KnownReceipt) => void
  names: ReadonlyMap<string, string>
  /** What you said payees are for, and your notes on payments, by line id (owner, 2026-10-26). */
  kinds: Readonly<Record<string, string>>
  notes: Readonly<Record<string, string>>
  openPayment: (line: MoneyLine, way: string) => void
  openKind: (group: PayeeGroup) => void
}>({
  links: new Map(),
  receiptReasons: {},
  open: () => {},
  names: new Map(),
  kinds: {},
  notes: {},
  openPayment: () => {},
  openKind: () => {},
})

/**
 * Money (v0.20, the Shopping tab before): what came in and went out of your accounts, from the statements you bring in,
 * then what you bought, from your receipts. All worked out on the phone with no AI; money moved between your own
 * accounts is left out. This month at #/money (#/shopping still opens it), an earlier one at #/money/2026-09. Counts and
 * amounts only (no averages, ratings or a limit); every line opens to what it counts.
 */
export function MoneyScreen({ sub, legacyView }: { sub: string | null; legacyView?: 'receipts' }) {
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const bankLines = useLiveQuery(() => db.bankLines.toArray(), [])
  const statements = useLiveQuery(() => db.statements.toArray(), [])
  const own = useLiveQuery(async () => ownPayeesOf(await db.settings.get(OWN_PAYEES)), [])
  const names = useAccountNames()
  const closed = useLiveQuery(async () => new Set(ownPayeesOf(await db.settings.get(CLOSED_ACCOUNTS))), [])
  const payeeNames = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYEE_NAMES)), [])
  const kinds = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYEE_KINDS)), [])
  const notes = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYMENT_NOTES)), [])
  const receiptReviews = useLiveQuery(async () => receiptReviewState((await db.settings.get(RECEIPT_REVIEWS))?.value), [])
  const [payment, setPayment] = useState<{ line: MoneyLine; way: string } | null>(null)
  const [kindFor, setKindFor] = useState<PayeeGroup | null>(null)
  const ownWords = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  const [view, setView] = useState<'accounts' | 'receipts'>(legacyView ?? 'accounts')
  const earlierId = useId()
  useEffect(() => {
    if (legacyView) setView(legacyView)
  }, [legacyView])
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || bankLines === undefined || statements === undefined || own === undefined || names === undefined || payeeNames === undefined || kinds === undefined || notes === undefined || receiptReviews === undefined || closed === undefined || ownWords === undefined || purpose === undefined) return <Loading />

  const byId = new Map(entries.map((e) => [e.id, e]))
  const open = (receipt: KnownReceipt) => {
    const entry = byId.get(receipt.entryId)
    if (entry) setSheet({ kind: 'open', entry })
  }
  const { receipts, copies } = receiptsAndCopies(entries)
  const lines = classify(bankLines, new Set(own), payeeNames)
  const links = linkReceipts(lines, receipts, receiptReviews.paymentLinks)
  const receiptReasons = receiptReviews.paymentReasons
  const manualReceiptByPayment = new Map(
    [...links].flatMap(([paymentId, receipt]) => (receiptReviews.paymentLinks[receipt.id] === paymentId ? [[paymentId, receipt.id] as const] : [])),
  )
  const reviewedDates = new Set([...receiptReviews.acceptedDates, ...Object.keys(receiptReviews.paymentLinks)])
  const linkedReceiptIds = new Set([...links.values()].map((receipt) => receipt.id))
  const matchCandidates = new Map<string, MoneyLine[]>(
    receipts
      .filter((receipt) => !linkedReceiptIds.has(receipt.id) && !receiptReviews.acceptedDates.includes(receipt.id))
      .map((receipt): [string, MoneyLine[]] => [receipt.id, receiptPaymentCandidates(lines, receipt, new Set(links.keys()))])
      .filter(([, candidates]) => candidates.length > 0),
  )
  const possiblePaymentIds = new Set<string>(matchCandidates.keys())
  const today = toDateKey(new Date())
  const thisMonth = today.slice(0, 7)
  const month = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : thisMonth
  const earlier =
    view === 'accounts'
      ? [...new Set(lines.filter((l) => !l.moving).map((l) => l.date.slice(0, 7)))].filter((m) => m < thisMonth).sort().reverse()
      : shoppingMonths(receipts).filter((m) => m < thisMonth).sort().reverse()
  const manualReceiptId = payment ? manualReceiptByPayment.get(payment.line.id) : undefined
  const paymentReceipt = payment ? links.get(payment.line.id) : undefined
  const paymentReceiptDifference = payment && paymentReceipt ? paid(paymentReceipt) - Math.abs(payment.line.amount) : 0
  const paymentReceiptSummary =
    payment && paymentReceipt && paymentReceiptDifference
      ? `Receipt ${money(paid(paymentReceipt), paymentReceipt.currency)} · debit ${money(Math.abs(payment.line.amount), '£')} · difference ${money(Math.abs(paymentReceiptDifference), paymentReceipt.currency)}${receiptReasons[paymentReceipt.id] ? ` · ${receiptReasons[paymentReceipt.id]}` : ''}`
      : null

  return (
    <Receipts.Provider value={{ links, receiptReasons, open, names, kinds, notes, openPayment: (line, way) => setPayment({ line, way }), openKind: setKindFor }}>
      <div className="money-screen">
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
        <div className="money-switch" role="group" aria-label="Money sections">
          <button type="button" aria-pressed={view === 'accounts'} onClick={() => setView('accounts')}>
            Accounts
          </button>
          <button type="button" aria-pressed={view === 'receipts'} onClick={() => setView('receipts')}>
            Receipts
          </button>
        </div>
        {view === 'accounts' && lines.length ? (
          // Keyed by month: a month opened from another starts afresh (a tapped chart column doesn't carry over).
          <AccountsMonth key={`accounts-${month}`} lines={lines} month={month} today={today} statements={statements} closed={closed} />
        ) : view === 'receipts' ? (
          <ReceiptsMonth
            key={`receipts-${month}`}
            receipts={receipts}
            copies={copies}
            month={month}
            today={today}
            reviewedDates={reviewedDates}
            matchCandidates={matchCandidates}
            possiblePaymentIds={possiblePaymentIds}
            onAcceptDate={acceptReceiptDate}
            onMatchPayment={(receiptId, paymentId, reason) => matchReceiptPayment(receiptId, paymentId, reason, new Set(receipts.map((r) => r.id)))}
            onOpen={open}
          />
        ) : null}
        {month === thisMonth && earlier.length ? (
          <section aria-labelledby={earlierId}>
            <h2 id={earlierId} className="week-title">
              Earlier months
            </h2>
            <nav className="money-month-history" aria-labelledby={earlierId}>
              {earlier.map((m) => {
                let said: string
                if (view === 'accounts') said = `${pounds(moneyMonth(lines, m, today, statements, closed).out)} out`
                else {
                  const bought = shoppingMonth(receipts, m, today)
                  said = `${inWords(bought.spent)} on ${receiptsWord(bought.receipts.length)}`
                }
                return (
                  <a key={m} className="money-month-card" href={hashFor('money', m)}>
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
        {view === 'receipts' && month === thisMonth && receipts.length ? <ReceiptsShare receipts={receipts} /> : null}
        {view === 'accounts' && !lines.length ? <Accounts /> : null}
        {payment ? (
          <PaymentSheet
            key={payment.line.id}
            line={payment.line}
            way={payment.way}
            note={notes[payment.line.id] ?? ''}
            receiptSummary={paymentReceiptSummary}
            onReceipt={
              links.get(payment.line.id)
                ? () => {
                    const receipt = links.get(payment.line.id)!
                    setPayment(null)
                    open(receipt)
                  }
                : null
            }
            onUnlinkReceipt={manualReceiptId
              ? async () => {
                    await unmatchReceiptPayment(manualReceiptId)
                    setPayment(null)
                  }
              : null
            }
            onClose={() => setPayment(null)}
          />
        ) : null}
        {kindFor ? (
          <KindSheet
            payeeKey={kindFor.payee.key}
            payee={kindFor.payee.name}
            chosen={kinds[kindFor.payee.key] ?? null}
            guess={kindOf(kindFor.lines[0]!, {})}
            onClose={() => setKindFor(null)}
          />
        ) : null}
        <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={ownWords} purpose={purpose} />
      </div>
    </Receipts.Provider>
  )
}

/** A month of your accounts: out and in, where it rose, regular payments, by payee, money moved, to check. */
function AccountsMonth(props: { lines: readonly MoneyLine[]; month: string; today: string; statements: readonly StatementRecord[]; closed: ReadonlySet<string> }) {
  const { lines, month, today, statements, closed } = props
  const { names, kinds } = useContext(Receipts)
  const [section, setSection] = useState<'overview' | 'spending' | 'accounts'>('overview')
  const its = moneyMonth(lines, month, today, statements, closed, kinds)
  const regular = regularPayments(lines, month)
  const current = month === today.slice(0, 7)
  const lastMonth = monthName(shiftMonth(month, -1))
  const anyRose = its.rose.ranked.length + its.rose.others.length > 0
  return (
    <>
      <div className="card money-overview">
        <div className="money-overview-heading">
          <p className="muted small">{current ? `${monthName(month)} so far` : monthYear(month)}</p>
          <p className="muted small">From your accounts</p>
        </div>
        <p className="money-overview-total">
          <strong>{pounds(its.out)} <span>out</span></strong>
        </p>
        <ul className="plain-list compact money-overview-breakdown">
          {its.before ? <LinesLine className="money-overview-comparison" overview label={`By ${dayMonthLong(its.before.until)}`} detail={`${pounds(its.before.out)} out`} lines={its.before.lines} /> : null}
          <LinesLine className="money-overview-stat" overview label="Money in" detail={pounds(its.in)} lines={its.inLines} />
          <LinesLine className="money-overview-stat" overview label="Payments out" detail={paymentsWord(its.outLines.length)} lines={its.outLines} />
        </ul>
      </div>
      <nav className="money-detail-switch" aria-label="Account details">
        <button type="button" aria-pressed={section === 'overview'} onClick={() => setSection('overview')}>Overview</button>
        <button type="button" aria-pressed={section === 'spending'} onClick={() => setSection('spending')}>Spending</button>
        <button type="button" aria-pressed={section === 'accounts'} onClick={() => setSection('accounts')}>Accounts</button>
      </nav>
      {section === 'overview' ? (
        <>
          <div className="card"><Chart lines={lines} month={month} today={today} /></div>
          {anyRose ? <Section title="Where it rose" status={current ? `Next to ${lastMonth} by the same day` : `Next to ${lastMonth}`}><Groups of={its.rose} line={(r: Rise) => <RiseLine key={r.payee.key} rise={r} />} fewer="Fewer than 3 payments, by name" /></Section> : null}
          {regular.length ? <Section title="Regular payments"><ul className="plain-list compact">{regular.map((r) => <RegularPaymentLine key={r.payee.key} item={r} />)}</ul></Section> : null}
        </>
      ) : null}
      {section === 'spending' ? (
        <>
          {its.outLines.length ? <Section title="By what it was for"><Groups of={its.kinds} line={(g: KindGroup) => <KindMeterLine key={g.kind} group={g} totalOut={its.out} />} fewer="Fewer than 3 payments, by name" /></Section> : null}
          {its.outLines.length ? <Section title="Money out"><Groups of={its.payees.out} line={(g: PayeeGroup) => <PayeeLine key={g.payee.key} group={g} out />} fewer="Fewer than 3 payments, by name" /></Section> : null}
          {its.inLines.length ? <Section title="Money in"><Groups of={its.payees.in} line={(g: PayeeGroup) => <PayeeLine key={g.payee.key} group={g} />} fewer="Fewer than 3 payments, by name" /></Section> : null}
        </>
      ) : null}
      {section === 'accounts' ? (
        <>
          {its.moved.length ? <Section title="Moved between your accounts" status="Left out of money in and out"><ul className="plain-list compact">{its.moved.map((m) => m.why === 'own' ? <OwnLines key={m.why} lines={m.lines} /> : <LinesLine key={m.why} label={MOVED[m.why]} detail={movesWord(joinMoves(m.lines).length)} lines={m.lines} moves />)}</ul></Section> : null}
          {its.toCheck.lines.length || its.toCheck.accounts.length ? <Section title="To check"><ul className="plain-list compact">{its.toCheck.accounts.map((a) => <li key={a.account}>{names.get(a.account) ?? a.account}<span className="muted small"> · statements up to {dayMonth(a.until)}</span></li>)}</ul>{its.toCheck.lines.length ? <LineList lines={its.toCheck.lines} why="doesn’t match its printed balance" /> : null}</Section> : null}
          <Accounts />
        </>
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
  const [page, setPage] = useState(0)
  const thisMonth = today.slice(0, 7)
  const last = shiftMonth(month, -page * CHART_MONTHS)
  const months = moneyMonthTotals(lines, last, CHART_MONTHS)
  const average = Math.round(months.reduce((sum, item) => sum + item.out, 0) / months.length)
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
        average={{ value: average, label: `Average over these ${months.length} months: ${pounds(average)} per month`, amount: pounds(average) }}
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

/** A line that opens to its payments. */
function LinesLine({
  label,
  detail,
  lines,
  moves,
  className,
  overview = false,
  action,
}: {
  label: string
  detail?: string
  lines: readonly MoneyLine[]
  moves?: boolean
  className?: string
  overview?: boolean
  action?: ReactNode
}) {
  return (
    <li className={className}>
      <details className="week-line">
        <summary className={overview ? 'money-overview-summary' : undefined}>
          <span>{label}</span>
          {detail ? <span className={overview ? 'money-overview-value' : 'muted small'}>{overview ? ` ${detail}` : ` · ${detail}`}</span> : null}
        </summary>
        <LineList lines={lines} moves={moves} />
      </details>
      {action}
    </li>
  )
}

function RenameRegularPayment({ payee }: { payee: Payee }) {
  const [naming, setNaming] = useState(false)
  return (
    <>
      <button type="button" className="small-link" aria-label={`Rename ${payee.name}`} onClick={() => setNaming(true)}>
        Rename
      </button>
      {naming ? (
        <RenameSheet
          title="Rename regular payment"
          shown={payee.name}
          hint="Applies to existing and future matching payments."
          onSave={(name) => namePayee(payee.key, name)}
          onClose={() => setNaming(false)}
        />
      ) : null}
    </>
  )
}

function KindMeterLine({ group, totalOut }: { group: KindGroup; totalOut: number }) {
  const count = group.lines.filter((l) => !l.refund).length
  const pct = totalOut > 0 ? Math.min(100, Math.max(2, Math.round((group.total / totalOut) * 100))) : 0
  return (
    <li className="money-kind-row">
      <details className="week-line">
        <summary className="money-kind-summary">
          <span className="money-kind-header">
            <span className="money-kind-label">{group.kind}</span>
            <span className="muted small">
              {' · '}
              {paymentsWord(count)} · {pounds(group.total)}
            </span>
          </span>
          <span className="money-kind-meter" aria-hidden="true">
            <span className="money-kind-meter-fill" style={{ width: `${pct}%` }} />
          </span>
        </summary>
        <LineList lines={group.lines} />
      </details>
    </li>
  )
}

function RiseLine({ rise }: { rise: Rise }) {
  const diff = rise.now - rise.before
  return (
    <li className="money-rise-row">
      <details className="week-line">
        <summary className="money-rise-summary">
          <span className="money-rise-header">
            <span className="money-rise-label">{rise.payee.name}</span>
            <span className="money-rise-badge" aria-hidden="true">
              +{pounds(diff)}
            </span>
          </span>
          <span className="muted small">
            {' · '}
            {pounds(rise.now)}, up from {pounds(rise.before)}
          </span>
        </summary>
        <LineList lines={rise.lines} />
      </details>
    </li>
  )
}

function RegularPaymentLine({ item }: { item: Regular }) {
  const detailParts = [`every ${item.every}`, pounds(item.amount), item.changed ? `was ${pounds(item.changed.from)} until ${dayMonth(item.changed.date)}` : ''].filter(Boolean)
  return (
    <li className="regular-payment-line">
      <details className="week-line">
        <summary className="regular-payment-summary">
          <span className="regular-payment-header">
            <span className="regular-payment-name">{item.payee.name}</span>
            <span className="regular-payment-pill" aria-hidden="true">
              {item.every === 'week' ? 'Weekly' : 'Monthly'}
            </span>
          </span>
          <span className="muted small">
            {' · '}
            {detailParts.join(' · ')}
          </span>
        </summary>
        <LineList lines={item.lines} />
      </details>
      <RenameRegularPayment payee={item.payee} />
    </li>
  )
}

/** A payee, opening to its payments, and, where it could be, a way to say it's you moving money (the payee is remembered:
 *  its lines leave the totals, in later statements too). */
function PayeeLine({ group, out = false }: { group: PayeeGroup; out?: boolean }) {
  const { kinds, links, names, notes, openKind, openPayment } = useContext(Receipts)
  const kind = out ? kindOf(group.lines[0]!, kinds) : null
  const line = group.lines[0]!
  const account = names.get(line.account) ?? line.account
  const way = line.amount < 0 ? `Out of ${account}` : line.refund ? `Back into ${account}` : `Into ${account}`
  const receipt = links.get(line.id)
  const note = notes[line.id]
  const single = group.lines.length === 1
  if (single) {
    return (
      <li className="payee-single">
        <details className="week-line" open>
          <summary>
            <span>{group.payee.name}</span>
            <span className="muted small">
              {' '}
              · {kind ? `${kind} · ` : ''}
              {paymentsWord(group.lines.filter((l) => !l.refund).length)} · {pounds(group.total)}
            </span>
          </summary>
          <button type="button" className="payee-single-payment" onClick={() => openPayment(line, way)}>
            <span className="payee-single-copy">
              <span className="payee-single-name">{group.payee.name}</span>
              <span className="payee-single-detail">{shortDayMonth(line.date)} · {way}{receipt ? ' · Receipt' : ''}{note ? ` · “${note}”` : ''}</span>
            </span>
            <span className="payee-single-amount">{pounds(Math.abs(line.amount))}</span>
          </button>
          {out ? <button type="button" className="payee-kind-action" aria-label={`What ${group.payee.name} is for`} onClick={() => openKind(group)}>{kind ? `${kind} · Change` : 'What is it for?'}</button> : null}
          {mayBeOwn(group.lines) ? <button type="button" className="small-link payee-own-action" onClick={() => void markOwnPayee(group.payee.key, true)}>It’s me, moving money</button> : null}
        </details>
      </li>
    )
  }
  return (
    <li>
      <details className="week-line">
        <summary>
          <span>{group.payee.name}</span>
          <span className="muted small">
            {' '}
            · {kind ? `${kind} · ` : ''}
            {paymentsWord(group.lines.filter((l) => !l.refund).length)} · {pounds(group.total)}
          </span>
        </summary>
        <LineList lines={group.lines} />
        {out ? (
          <button type="button" className="small-link" aria-label={`What ${group.payee.name} is for`} onClick={() => openKind(group)}>
            {kind ? `For: ${kind} · Change` : 'What is it for?'}
          </button>
        ) : null}
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
  const { links, receiptReasons, names, notes, openPayment } = useContext(Receipts)
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
        const note = notes[row.line.id]
        const receiptDetail = receipt
          ? receiptReasons[receipt.id]
            ? `receipt ${money(paid(receipt), receipt.currency)} · ${receiptReasons[receipt.id]}`
            : 'receipt'
          : ''
        const told = [where(row), note ? `“${note}”` : '', receiptDetail, why ?? ''].filter(Boolean).join(' · ')
        const said = (
          <span className="payment-row">
            <span className="payment-day">{shortDayMonth(row.line.date)}</span>
            <span className="payment-told">{told}</span>
            <span className="payment-amount">{pounds(Math.abs(row.line.amount))}</span>
          </span>
        )
        return (
          <li key={row.line.id}>
            <button type="button" className="line-button" onClick={() => openPayment(row.line, where(row))}>
              {said}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
