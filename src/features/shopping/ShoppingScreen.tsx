import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useId, useState } from 'react'
import { receiptsToCsv, shoppingCsvFileName } from '../../db/csv'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import {
  inWords,
  type KnownReceipt,
  money,
  monthTotals,
  paid,
  receiptsOf,
  SMALL_SHOP,
  type ShoppingMonth,
  shoppingMonth,
  shoppingMonths,
} from '../../domain/shopping'
import { dayMonth, dayMonthLong, monthName, monthYear, shortDayMonth, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Dialog } from '../../ui/Dialog'
import { Loading } from '../../ui/Loading'
import { FileActions } from '../backup/FileActions'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { useOwnWords } from '../today/useOwnWords'
import { usePurposeSettings } from '../today/usePurpose'

/** The chart shows this many months, the page's own the last. */
const CHART_MONTHS = 6
/** Bought again and again shows this many; the rest are a tap away. */
const REPEATS_SHOWN = 10

const receiptsWord = (n: number) => `${n} receipt${n === 1 ? '' : 's'}`

/**
 * Shopping (v0.19, its own tab): what you spent, from the receipts in your photos, worked out on the phone with no AI.
 * This month at #/shopping, an earlier one at #/shopping/2026-09. Counts and amounts only (no averages, ratings or a
 * limit), and every line opens to its receipts, each opening its entry.
 */
export function ShoppingScreen({ sub }: { sub: string | null }) {
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const own = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || own === undefined || purpose === undefined) return <Loading />

  const byId = new Map(entries.map((e) => [e.id, e]))
  const open = (receipt: KnownReceipt) => {
    const entry = byId.get(receipt.entryId)
    if (entry) setSheet({ kind: 'open', entry })
  }
  const receipts = receiptsOf(entries)
  const today = toDateKey(new Date())
  const thisMonth = today.slice(0, 7)
  const month = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : thisMonth

  return (
    <>
      {month === thisMonth ? (
        <ThisMonth receipts={receipts} today={today} onOpen={open} />
      ) : (
        <>
          <a className="back-link" href={hashFor('shopping')}>
            ‹ Shopping
          </a>
          <h1>{monthYear(month)}</h1>
          <Month receipts={receipts} month={month} today={today} onOpen={open} />
        </>
      )}
      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </>
  )
}

function ThisMonth({ receipts, today, onOpen }: { receipts: readonly KnownReceipt[]; today: string; onOpen: (r: KnownReceipt) => void }) {
  const [sharing, setSharing] = useState(false)
  const headingId = useId()
  const thisMonth = today.slice(0, 7)
  const earlier = shoppingMonths(receipts).filter((m) => m < thisMonth)
  if (receipts.length === 0) {
    return (
      <>
        <h1>Shopping</h1>
        <p className="muted">Receipts you photograph show here.</p>
      </>
    )
  }
  return (
    <>
      <h1>Shopping</h1>
      <Month receipts={receipts} month={thisMonth} today={today} onOpen={onOpen} />
      {earlier.length ? (
        <section aria-labelledby={headingId}>
          <h2 id={headingId} className="week-title">
            Earlier months
          </h2>
          <nav className="list" aria-labelledby={headingId}>
            {earlier.map((m) => {
              const its = shoppingMonth(receipts, m, today)
              return (
                <a key={m} className="list-row" href={hashFor('shopping', m)}>
                  <span className="list-text">
                    <span className="list-title">{monthYear(m)}</span>
                    <span className="list-status">
                      {inWords(its.spent)} · {receiptsWord(its.receipts.length)}
                    </span>
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
      <button type="button" className="primary wide top-gap" onClick={() => setSharing(true)}>
        Share as a spreadsheet
      </button>
      {sharing ? <SpreadsheetDialog receipts={receipts} onClose={() => setSharing(false)} /> : null}
    </>
  )
}

/** Everything about one month, top to bottom: how much, each month, where, what changed, what came back, to check. */
function Month({ receipts, month, today, onOpen }: { receipts: readonly KnownReceipt[]; month: string; today: string; onOpen: (r: KnownReceipt) => void }) {
  const its = shoppingMonth(receipts, month, today)
  if (its.receipts.length === 0) return <p className="muted">No receipts in {monthYear(month)}.</p>
  const shops = its.shops.ranked.length + its.shops.others.filter((s) => s.name !== null).length
  return (
    <>
      <div className="card">
        <p className="muted small">{month === today.slice(0, 7) ? `${monthName(month)} so far` : monthYear(month)}</p>
        <p>
          <strong>{inWords(its.spent)}</strong>
        </p>
        <ul className="plain-list compact">
          {its.before ? <ReceiptLine label={`By ${dayMonthLong(its.before.until)}`} detail={inWords(its.before.spent)} receipts={its.before.receipts} onOpen={onOpen} /> : null}
          <ReceiptLine label={`${receiptsWord(its.receipts.length)} from ${shops} shop${shops === 1 ? '' : 's'}`} receipts={its.receipts} onOpen={onOpen} />
          {its.offers.saved.length ? <ReceiptLine label={`${inWords(its.offers.saved)} off with offers`} receipts={its.offers.receipts} onOpen={onOpen} /> : null}
        </ul>
      </div>
      <div className="card">
        <Months receipts={receipts} month={month} today={today} />
      </div>
      <Where its={its} onOpen={onOpen} />
      {its.priceChanges.length ? (
        <Section title="Price changes at the same shop">
          <ul className="plain-list compact">
            {its.priceChanges.map((c) => (
              <ReceiptLine
                key={`${c.shop}-${c.name}`}
                label={c.name}
                detail={`${c.shop}: ${money(c.before.price, c.before.receipt.currency)} on ${dayMonth(c.before.receipt.date)}, ${money(c.now.price, c.now.receipt.currency)} on ${dayMonth(c.now.receipt.date)}`}
                receipts={[c.before.receipt, c.now.receipt]}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </Section>
      ) : null}
      {its.repeats.length ? (
        <Section title="Bought again and again" status="Over the last 3 months">
          <Repeats its={its} onOpen={onOpen} />
        </Section>
      ) : null}
      {its.toCheck.length ? (
        <Section title="To check">
          <ReceiptList receipts={its.toCheck.map((c) => c.receipt)} why={new Map(its.toCheck.map((c) => [c.receipt.id, c.why]))} onOpen={onOpen} />
        </Section>
      ) : null}
    </>
  )
}

function Section({ title, status, children }: { title: string; status?: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        {title}
      </h2>
      {status ? <p className="muted small week-period">{status}</p> : null}
      <div className="card">{children}</div>
    </section>
  )
}

/** The chart: the six months up to the page's, a tapped one opening to its own page. */
function Months({ receipts, month, today }: { receipts: readonly KnownReceipt[]; month: string; today: string }) {
  const [active, setActive] = useState<number | null>(null)
  const thisMonth = today.slice(0, 7)
  const { currency, months } = monthTotals(receipts, month, CHART_MONTHS)
  const others = receipts.some((r) => r.currency !== currency)
  const columns = months.map((m) => ({
    key: m.month,
    axisLabel: monthName(m.month, 'short'),
    title: m.month === thisMonth ? `${monthName(m.month)} so far` : monthYear(m.month),
    value: m.minor,
    amount: inWords(m.spent),
    receipts: m.receipts,
  }))
  const tapped = active === null ? undefined : months[active]
  return (
    <MonthChart
      title={others ? `Spent each month, in ${currency}` : 'Spent each month'}
      months={columns}
      currency={currency}
      summary="Tap a month"
      active={active}
      onActive={setActive}
      labelled={months.length - 1}
      detail={
        tapped && tapped.month !== month && tapped.receipts ? (
          <a className="small-link" href={hashFor('shopping', tapped.month === thisMonth ? null : tapped.month)}>
            Open {monthYear(tapped.month)} ›
          </a>
        ) : null
      }
    />
  )
}

/** Shops: those with 3+ receipts by what was spent, the rest by name; then shops under £10. */
function Where({ its, onOpen }: { its: ShoppingMonth; onOpen: (r: KnownReceipt) => void }) {
  const line = (s: ShoppingMonth['shops']['ranked'][number]) => (
    <ReceiptLine key={s.key || 'none'} label={s.name ?? 'No shop read'} detail={`${receiptsWord(s.receipts.length)} · ${inWords(s.spent)}`} receipts={s.receipts} onOpen={onOpen} />
  )
  return (
    <Section title="Where">
      {its.shops.ranked.length ? <ul className="plain-list compact">{its.shops.ranked.map(line)}</ul> : null}
      {its.shops.ranked.length && its.shops.others.length ? <p className="muted small">Fewer than 3 receipts, by name</p> : null}
      {its.shops.others.length ? <ul className="plain-list compact">{its.shops.others.map(line)}</ul> : null}
      {its.small ? (
        <ul className="plain-list compact">
          <ReceiptLine
            label={`${its.small.receipts.length} shops under £${SMALL_SHOP / 100}`}
            detail={`${inWords(its.small.spent)} in all`}
            receipts={its.small.receipts}
            onOpen={onOpen}
          />
        </ul>
      ) : null}
    </Section>
  )
}

function Repeats({ its, onOpen }: { its: ShoppingMonth; onOpen: (r: KnownReceipt) => void }) {
  const line = (r: ShoppingMonth['repeats'][number]) => (
    <ReceiptLine key={r.name} label={r.name} detail={`on ${receiptsWord(r.receipts.length)} · ${inWords(r.spent)}`} receipts={r.receipts} onOpen={onOpen} />
  )
  const rest = its.repeats.slice(REPEATS_SHOWN)
  return (
    <>
      <ul className="plain-list compact">{its.repeats.slice(0, REPEATS_SHOWN).map(line)}</ul>
      {rest.length ? (
        <details className="week-line">
          <summary>{rest.length} more</summary>
          <ul className="plain-list compact">{rest.map(line)}</ul>
        </details>
      ) : null}
    </>
  )
}

/** A line that opens to its receipts. */
function ReceiptLine(props: { label: string; detail?: string; receipts: readonly KnownReceipt[]; onOpen: (r: KnownReceipt) => void }) {
  const { label, detail, receipts, onOpen } = props
  return (
    <li>
      <details className="week-line">
        <summary>
          <span>{label}</span>
          {detail ? <span className="muted small"> · {detail}</span> : null}
        </summary>
        <ReceiptList receipts={receipts} onOpen={onOpen} />
      </details>
    </li>
  )
}

/** Receipts, newest first: day, shop and what it came to, each opening its entry; with why, when it needs a look. */
function ReceiptList(props: { receipts: readonly KnownReceipt[]; why?: ReadonlyMap<string, string[]>; onOpen: (r: KnownReceipt) => void }) {
  const { receipts, why, onOpen } = props
  const listed = [...receipts].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <ul className="plain-list compact evidence-list">
      {listed.map((r) => {
        const reasons = why?.get(r.id)
        return (
          <li key={r.id}>
            <button type="button" className="line-button" onClick={() => onOpen(r)}>
              <span>
                <span className="muted small">{shortDayMonth(r.date)} </span>
                {r.shop || 'No shop read'}
                <span className="muted small"> · {money(paid(r), r.currency)}</span>
                {reasons ? <span className="muted small"> · {reasons.join('; ')}</span> : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Every item on your receipts as a spreadsheet, through the share menu. */
function SpreadsheetDialog({ receipts, onClose }: { receipts: readonly KnownReceipt[]; onClose: () => void }) {
  const [file] = useState(() => new File([receiptsToCsv(receipts)], shoppingCsvFileName(new Date()), { type: 'text/csv' }))
  const items = receipts.reduce((n, r) => n + r.items.length, 0)
  return (
    <Dialog title="Shopping as a spreadsheet" onClose={onClose}>
      <p>Every item on your receipts, a row each (CSV), for Numbers, Excel or Google Sheets.</p>
      <p className="muted small">
        {items} item{items === 1 ? '' : 's'} on {receiptsWord(receipts.length)}
      </p>
      <FileActions file={file} saveLabel="Save or share…" />
    </Dialog>
  )
}
