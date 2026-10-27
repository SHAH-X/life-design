import { type ReactNode, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
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
  shopKey,
  SMALL_SHOP,
  type ShoppingMonth,
  shoppingMonth,
} from '../../domain/shopping'
import type { MoneyLine } from '../../domain/money'
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
export function ReceiptsMonth(props: {
  receipts: readonly KnownReceipt[]
  copies: readonly ReceiptCopy[]
  month: string
  today: string
  reviewedDates: ReadonlySet<string>
  matchCandidates: ReadonlyMap<string, readonly MoneyLine[]>
  possiblePaymentIds: ReadonlySet<string>
  onAcceptDate: (receiptId: string) => Promise<void>
  onMatchPayment: (receiptId: string, paymentId: string, reason: string) => Promise<void>
  onOpen: (r: KnownReceipt) => void
}) {
  const { receipts, month, today, onOpen } = props
  const headingId = useId()
  const its = shoppingMonth(receipts, month, today, props.copies, props.reviewedDates, props.possiblePaymentIds)
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
      <div className="card money-overview receipt-overview">
        <div className="money-overview-heading">
          <p className="muted small">{month === today.slice(0, 7) ? `${monthName(month)} so far` : monthYear(month)}</p>
          <p className="muted small">From your photos</p>
        </div>
        <p className="money-overview-total">
          <strong>{inWords(its.spent)} <span>spent</span></strong>
        </p>
        <ul className="plain-list compact money-overview-breakdown">
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
            reviewedDates={props.reviewedDates}
            matchCandidates={props.matchCandidates}
            onAcceptDate={props.onAcceptDate}
            onMatchPayment={props.onMatchPayment}
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
function ReceiptList(props: {
  receipts: readonly KnownReceipt[]
  why?: ReadonlyMap<string, string[]>
  copyOf?: ReadonlyMap<string, KnownReceipt>
  reviewedDates?: ReadonlySet<string>
  matchCandidates?: ReadonlyMap<string, readonly MoneyLine[]>
  onAcceptDate?: (receiptId: string) => Promise<void>
  onMatchPayment?: (receiptId: string, paymentId: string, reason: string) => Promise<void>
  onOpen: (r: KnownReceipt) => void
}) {
  const { receipts, why, copyOf, onOpen } = props
  const listed = [...receipts].sort((a, b) => b.date.localeCompare(a.date))
  const [matching, setMatching] = useState<KnownReceipt | null>(null)
  return (
    <ul className="plain-list compact evidence-list">
      {listed.map((r) => {
        const reasons = why?.get(r.id)
        const duplicateOf = copyOf?.get(r.id)
        const needsReview = reasons !== undefined || duplicateOf !== undefined
        const missingDate = !duplicateOf && !r.dated && !props.reviewedDates?.has(r.id)
        const candidates = props.matchCandidates?.get(r.id) ?? []
        const hasPaymentCandidates = candidates.length > 0
        const hasAmountDifference = candidates.some((line) => Math.abs(line.amount) !== paid(r))
        const title = duplicateOf
          ? 'Duplicate · counted once'
          : missingDate
            ? `Date not read · using ${shortDayMonth(r.date)}`
            : !r.adds
              ? "Total doesn't add up"
              : !shopKey(r.shop)
                ? 'Shop not read'
                : hasAmountDifference
                  ? 'Payment differs'
                  : 'Payment to check'
        return (
          <li key={r.id}>
            {needsReview ? (
              <details className="week-line receipt-check">
                <summary>
                  <span className="receipt-check-title">{title}</span>
                  <span className="muted small">{r.shop || 'Unknown shop'} · {money(paid(r), r.currency)}</span>
                </summary>
                <div className="receipt-check-body">
                  {duplicateOf ? (
                    <>
                      <p>Extra entry {shortDayMonth(r.entryDate ?? r.date)} · kept {shortDayMonth(duplicateOf.date)}.</p>
                      <button type="button" className="link" onClick={() => onOpen(r)}>
                        Open extra entry
                      </button>
                    </>
                  ) : (
                    <>
                      {!r.adds ? <p>Items and total differ.</p> : null}
                      {!shopKey(r.shop) ? <p>Shop not read.</p> : null}
                      {missingDate ? (
                        <>
                          <p>Using the day this entry was added.</p>
                        </>
                      ) : null}
                      {hasPaymentCandidates ? (
                        <ul className="plain-list compact receipt-check-candidates">
                          {candidates.map((line) => {
                            const debit = Math.abs(line.amount)
                            const difference = Math.abs(paid(r) - debit)
                            return (
                              <li key={line.id}>
                                <span>
                                  {line.payee.name} · {shortDayMonth(line.date)} · receipt {money(paid(r), r.currency)} · debit {money(debit, '£')}
                                  {difference ? ` · difference ${money(difference, r.currency)}` : ''}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                      {!duplicateOf && (missingDate || hasPaymentCandidates) ? (
                        <div className="receipt-check-actions">
                          {missingDate ? (
                            <button type="button" onClick={() => void props.onAcceptDate?.(r.id)}>
                              Use {shortDayMonth(r.date)}
                            </button>
                          ) : null}
                          <button type="button" onClick={() => setMatching(r)}>
                            {missingDate ? 'Match a payment' : 'Review payment'}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </details>
            ) : (
              <button type="button" className="line-button" onClick={() => onOpen(r)}>
                <span>
                  <span className="muted small">{shortDayMonth(r.date)} </span>
                  {r.shop || 'No shop read'}
                  <span className="muted small"> · {money(paid(r), r.currency)}</span>
                </span>
              </button>
            )}
          </li>
        )
      })}
      {matching ? (
        <MatchPaymentDialog
          receipt={matching}
          candidates={props.matchCandidates?.get(matching.id) ?? []}
          onMatch={async (paymentId, reason) => {
            await props.onMatchPayment?.(matching.id, paymentId, reason)
            setMatching(null)
          }}
          onClose={() => setMatching(null)}
        />
      ) : null}
    </ul>
  )
}

function MatchPaymentDialog(props: {
  receipt: KnownReceipt
  candidates: readonly MoneyLine[]
  onMatch: (paymentId: string, reason: string) => Promise<void>
  onClose: () => void
}) {
  const { receipt, candidates, onMatch, onClose } = props
  const addedDate = receipt.entryDate ?? receipt.date
  const [paymentId, setPaymentId] = useState('')
  const [reasonChoice, setReasonChoice] = useState('')
  const [otherReason, setOtherReason] = useState('')
  const otherReasonInput = useRef<HTMLInputElement>(null)
  const selected = candidates.find((candidate) => candidate.id === paymentId)
  const amountDiffers = selected !== undefined && Math.abs(selected.amount) !== paid(receipt)
  const reason = amountDiffers ? (reasonChoice === 'other' ? otherReason.trim() : reasonChoice) : ''
  const canMatch = selected !== undefined && (!amountDiffers || (reasonChoice !== '' && (reasonChoice !== 'other' || reason.length > 0)))
  const footer = (
    <button type="button" className="primary wide" disabled={!canMatch} onClick={() => selected && void onMatch(selected.id, reason)}>
      Match receipt
    </button>
  )
  return (
    <Dialog title="Match a payment" onClose={onClose} footer={footer}>
      <p className="muted small">Choose a debit. The receipt and account amounts stay separate; matching never changes what Money counts.</p>
      <p>Receipt total: {money(paid(receipt), receipt.currency)}</p>
      {candidates.length ? (
        <>
          <div className="purpose-list receipt-match-list" role="radiogroup" aria-label="Statement debit">
            {candidates.map((line) => {
              const debit = Math.abs(line.amount)
              const difference = Math.abs(paid(receipt) - debit)
              return (
                <label key={line.id} className="purpose-option">
                  <input type="radio" name="receipt-payment" value={line.id} checked={paymentId === line.id} onChange={() => setPaymentId(line.id)} />
                  <span className="purpose-text">
                    <span className="purpose-label">{line.payee.name} · {shortDayMonth(line.date)}</span>
                    <span className="muted small">Debit {money(debit, '£')} · {line.account}{difference ? ` · difference ${money(difference, receipt.currency)}` : ''}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {amountDiffers ? (
            <fieldset className="receipt-match-reasons">
              <legend className="question-text">Why is the amount different?</legend>
              <label className="purpose-option">
                <input type="radio" name="receipt-reason" value="Gift-card discount" checked={reasonChoice === 'Gift-card discount'} onChange={() => setReasonChoice('Gift-card discount')} />
                <span className="purpose-text"><span className="purpose-label">Gift-card discount</span></span>
              </label>
              <label className="purpose-option">
                <input
                  type="radio"
                  name="receipt-reason"
                  value="other"
                  checked={reasonChoice === 'other'}
                  onChange={() => {
                    flushSync(() => setReasonChoice('other'))
                    otherReasonInput.current?.focus()
                  }}
                />
                <span className="purpose-text"><span className="purpose-label">Another reason</span></span>
              </label>
              {reasonChoice === 'other' ? (
                <input ref={otherReasonInput} value={otherReason} maxLength={120} autoCapitalize="sentences" aria-label="Explain the difference" placeholder="What explains the difference?" onChange={(event) => setOtherReason(event.target.value)} />
              ) : null}
            </fieldset>
          ) : null}
        </>
      ) : (
        <p>No likely payment near {shortDayMonth(addedDate)}. Bring in a statement or keep this date instead.</p>
      )}
    </Dialog>
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
