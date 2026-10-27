import { type ReactNode, useId, useState } from 'react'
import { receiptsToCsv, shoppingCsvFileName } from '../../db/csv'
import { itemShown } from '../../domain/receipts'
import {
  inWords,
  type KindLine,
  type Kinds,
  type KnownReceipt,
  type ReceiptCopy,
  money,
  monthTotals,
  paid,
  SMALL_SHOP,
  type ShoppingMonth,
  shoppingMonth,
} from '../../domain/shopping'
import { dayMonth, dayMonthLong, monthName, monthYear, shortDayMonth } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Dialog } from '../../ui/Dialog'
import { FileActions } from '../backup/FileActions'

// Money's receipts (v0.19 as the Shopping tab; part of Money from v0.20): what you spent, from the receipts in your
// photos, worked out on the phone with no AI. Counts and amounts only (no averages, ratings or a limit), and every line
// opens to its receipts, each opening its entry.

/** The chart shows this many months, the page's own the last. */
const CHART_MONTHS = 6
/** Bought again and again shows this many; the rest are a tap away. */
const REPEATS_SHOWN = 10

export const receiptsWord = (n: number) => `${n} receipt${n === 1 ? '' : 's'}`
const itemsWord = (n: number) => `${n} item${n === 1 ? '' : 's'}`

/** A month of your receipts, top to bottom: how much, each month, shops, what changed, what came back, to check. */
export function ReceiptsMonth(props: { receipts: readonly KnownReceipt[]; copies: readonly ReceiptCopy[]; month: string; today: string; onOpen: (r: KnownReceipt) => void }) {
  const { receipts, month, today, onOpen } = props
  const headingId = useId()
  const its = shoppingMonth(receipts, month, today, props.copies)
  const shops = its.shops.ranked.length + its.shops.others.filter((s) => s.name !== null).length
  if (its.receipts.length === 0) {
    return (
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="week-title">
          From your receipts
        </h2>
        <p className="muted">{receipts.length ? `No receipts in ${monthYear(month)}.` : 'Receipts you photograph show here.'}</p>
      </section>
    )
  }
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        From your receipts
      </h2>
      <div className="card money-overview">
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
      <Shops its={its} onOpen={onOpen} />
      {its.kinds ? <ByKind kinds={its.kinds} onOpen={onOpen} /> : null}
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
        <Section title="Receipts to check">
          <ReceiptList
            receipts={its.toCheck.map((c) => c.receipt)}
            why={new Map(its.toCheck.map((c) => [c.receipt.id, c.why]))}
            copyOf={new Map(its.toCheck.flatMap((c) => (c.copyOf ? [[c.receipt.id, c.copyOf] as const] : [])))}
            onOpen={onOpen}
          />
        </Section>
      ) : null}
    </section>
  )
}

export function Section({ title, status, children }: { title: string; status?: string; children: ReactNode }) {
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
      title={others ? `Receipts each month, in ${currency}` : 'Receipts each month'}
      months={columns}
      currency={currency}
      summary="Tap a month"
      active={active}
      onActive={setActive}
      labelled={months.length - 1}
      detail={
        tapped && tapped.month !== month && tapped.receipts ? (
          <a className="small-link" href={hashFor('money', tapped.month === thisMonth ? null : tapped.month)}>
            Open {monthYear(tapped.month)} ›
          </a>
        ) : null
      }
    />
  )
}

/** Shops: those with 3+ receipts by what was spent, the rest by name; then shops under £10. */
function Shops({ its, onOpen }: { its: ShoppingMonth; onOpen: (r: KnownReceipt) => void }) {
  const line = (s: ShoppingMonth['shops']['ranked'][number]) => (
    <ReceiptLine key={s.key || 'none'} label={s.name ?? 'No shop read'} detail={`${receiptsWord(s.receipts.length)} · ${inWords(s.spent)}`} receipts={s.receipts} onOpen={onOpen} />
  )
  return (
    <Section title="Shops">
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

/** What was bought, by the kind your AI gave each item: kinds with 3+ items by what was spent, the rest in the list's
 *  order; then what has no kind yet. */
function ByKind({ kinds, onOpen }: { kinds: Kinds; onOpen: (r: KnownReceipt) => void }) {
  const line = (k: KindLine) => <ItemLine key={k.kind} label={k.kind} detail={`${itemsWord(k.items.length)} · ${inWords(k.spent)}`} items={k.items} onOpen={onOpen} />
  return (
    <Section title="By kind" status="Items at their prices, before offers">
      {kinds.ranked.length ? <ul className="plain-list compact">{kinds.ranked.map(line)}</ul> : null}
      {kinds.ranked.length && kinds.others.length ? <p className="muted small">Fewer than 3 items</p> : null}
      {kinds.others.length ? <ul className="plain-list compact">{kinds.others.map(line)}</ul> : null}
      {kinds.notSorted ? (
        <ul className="plain-list compact">
          <ReceiptLine
            label="Not sorted"
            detail={`${itemsWord(kinds.notSorted.items)} on ${receiptsWord(kinds.notSorted.receipts.length)} · ${inWords(kinds.notSorted.spent)}`}
            receipts={kinds.notSorted.receipts}
            onOpen={onOpen}
          />
        </ul>
      ) : null}
    </Section>
  )
}

/** A kind's line, opening to its items, newest first: day, item, shop and price, each opening its receipt's entry. */
function ItemLine(props: { label: string; detail: string; items: KindLine['items']; onOpen: (r: KnownReceipt) => void }) {
  const { label, detail, items, onOpen } = props
  const listed = [...items].sort((a, b) => b.receipt.date.localeCompare(a.receipt.date))
  return (
    <li>
      <details className="week-line">
        <summary>
          <span>{label}</span>
          <span className="muted small"> · {detail}</span>
        </summary>
        <ul className="plain-list compact evidence-list">
          {listed.map(({ item, receipt }, i) => (
            <li key={`${receipt.id}-${i}`}>
              <button type="button" className="line-button" onClick={() => onOpen(receipt)}>
                <span>
                  <span className="muted small">{shortDayMonth(receipt.date)} </span>
                  {itemShown(item)}
                  <span className="muted small">
                    {' '}
                    · {receipt.shop || 'No shop read'} · {money(item.price, receipt.currency)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </details>
    </li>
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
function ReceiptList(props: { receipts: readonly KnownReceipt[]; why?: ReadonlyMap<string, string[]>; copyOf?: ReadonlyMap<string, KnownReceipt>; onOpen: (r: KnownReceipt) => void }) {
  const { receipts, why, copyOf, onOpen } = props
  const listed = [...receipts].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <ul className="plain-list compact evidence-list">
      {listed.map((r) => {
        const reasons = why?.get(r.id)
        const duplicateOf = copyOf?.get(r.id)
        return (
          <li key={r.id}>
            <button
              type="button"
              className="line-button"
              aria-label={duplicateOf ? 'Open the extra duplicate entry to review or delete it' : undefined}
              onClick={() => onOpen(r)}
            >
              <span>
                <span className="muted small">{shortDayMonth(r.date)} </span>
                {r.shop || 'No shop read'}
                <span className="muted small"> · {money(paid(r), r.currency)}</span>
                {reasons ? <span className="muted small"> · {reasons.join('; ')}</span> : null}
                {duplicateOf ? (
                  <span className="receipt-copy-help">
                    {duplicateOf.entryId === r.entryId ? (
                      <>The original is in this same entry. No action needed: this photo is counted once. Don’t delete the entry, or the original will go too.</>
                    ) : (
                      <>
                        Extra entry logged {shortDayMonth(r.entryDate ?? r.date)}. Original kept: {shortDayMonth(duplicateOf.date)}. Tap to open this entry, then choose Delete and confirm. This deletes the whole entry and all its photos, so keep it if there’s anything else you want.
                      </>
                    )}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** "Share as a spreadsheet": every item on your receipts, through the share menu. */
export function ReceiptsShare({ receipts }: { receipts: readonly KnownReceipt[] }) {
  const [sharing, setSharing] = useState(false)
  return (
    <>
      <button type="button" className="primary wide top-gap" onClick={() => setSharing(true)}>
        Share as a spreadsheet
      </button>
      {sharing ? <SpreadsheetDialog receipts={receipts} onClose={() => setSharing(false)} /> : null}
    </>
  )
}

/** Every item on your receipts as a spreadsheet, through the share menu. */
function SpreadsheetDialog({ receipts, onClose }: { receipts: readonly KnownReceipt[]; onClose: () => void }) {
  const [file] = useState(() => new File([receiptsToCsv(receipts)], shoppingCsvFileName(new Date()), { type: 'text/csv' }))
  const items = receipts.reduce((n, r) => n + r.items.length, 0)
  return (
    <Dialog title="Receipts as a spreadsheet" onClose={onClose}>
      <p>Every item on your receipts, a row each (CSV), for Numbers, Excel or Google Sheets.</p>
      <p className="muted small">
        {items} item{items === 1 ? '' : 's'} on {receiptsWord(receipts.length)}
      </p>
      <FileActions file={file} saveLabel="Save or share…" />
    </Dialog>
  )
}
