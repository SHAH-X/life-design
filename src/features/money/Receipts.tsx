import { type ReactNode, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { receiptsToCsv, shoppingCsvFileName } from '../../db/csv'
import { itemShown, paidFor } from '../../domain/receipts'
import {
  type Amounts,
  givenBack,
  inWords,
  type ForItems,
  type KindLine,
  type Kinds,
  type KnownReceipt,
  type ReceiptCopy,
  money,
  monthTotals,
  paid,
  shopKey,
  SMALL_SHOP,
  spentOn,
  type ShoppingMonth,
  shoppingMonth,
} from '../../domain/shopping'
import { type MoneyLine, NOBODY, nameOf } from '../../domain/money'
import { dayMonth, dayMonthLong, monthName, monthYear, shortDayMonth } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { MonthChart } from '../../ui/charts/MonthChart'
import { Dialog } from '../../ui/Dialog'
import { FileActions } from '../backup/FileActions'
import { Icon } from '../../ui/Icon'

// Money's receipts (v0.19 as the Shopping tab; part of Money from v0.20): what you spent, from the receipts in your
// photos, worked out on the phone with no AI. Counts and amounts only (no averages, ratings or a limit), and every line
// opens to its receipts, each opening to its items (v0.20.18).

/** The chart shows this many months, the page's own the last. */
const CHART_MONTHS = 6
/** Bought again and again shows this many; the rest are a tap away. */
const REPEATS_SHOWN = 10

export const receiptsWord = (n: number) => `${n} receipt${n === 1 ? '' : 's'}`
const itemsWord = (n: number) => `${n} item${n === 1 ? '' : 's'}`

// The page's look (v0.20.21): every line is a two-line row, its words on the left and its amount on the right, the whole
// row opening. The " · " between a row's parts stays in the text (for a screen reader and the tests) and is hidden by
// the styles, which set the parts apart instead.
const Sep = () => <span className="rc-sep"> · </span>

/** A line that opens: its label (and a badge), what it is in small words below, its amount on the right. */
function RowSummary(props: { label: ReactNode; badge?: ReactNode; sub?: ReactNode; amount?: ReactNode }) {
  const { label, badge, sub, amount } = props
  return (
    <summary className="rc-row">
      <span className="rc-text">
        <span className="rc-label">{label}</span>
        {badge}
        {sub ? (
          <span className="rc-sub">
            <Sep />
            {sub}
          </span>
        ) : null}
      </span>
      {amount ? (
        <span className="rc-amount">
          <Sep />
          {amount}
        </span>
      ) : null}
    </summary>
  )
}

/** A line that opens one receipt: its day, what it is, what was paid and a small flag. Words, set out as a row. */
function RowButton(props: { date: string; title: string; sub?: string; amount: string; flag?: string; onClick: () => void }) {
  const { date, title, sub, amount, flag, onClick } = props
  return (
    <button type="button" className="line-button rc-line" onClick={onClick}>
      <span className="rc-date">{date}</span> <span className="rc-name">{title}</span>
      {sub ? (
        <span className="rc-sub">
          <Sep />
          {sub}
        </span>
      ) : null}
      <span className="rc-amount">
        <Sep />
        {amount}
      </span>
      {flag ? (
        <span className="rc-flag">
          <Sep />
          {flag}
        </span>
      ) : null}
    </button>
  )
}

/** A titled group of lines on one white sheet; `count` marks one that needs you. */
function Group({ title, status, count, children }: { title: string; status?: string; count?: number; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rc-group">
      <h2 id={headingId} className="rc-title">
        {title}
        {count ? <span className="rc-count"> {count}</span> : null}
      </h2>
      {status ? <p className="rc-status">{status}</p> : null}
      <div className="rc-body">{children}</div>
    </section>
  )
}

/** A month of your receipts, top to bottom: how much, each month, shops, what changed, what came back, to check. */
export function ReceiptsMonth(props: {
  receipts: readonly KnownReceipt[]
  /** Refund slips (v0.20.20): shown, counted nowhere. */
  refunds: readonly KnownReceipt[]
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
  const refunds = props.refunds.filter((r) => r.date.slice(0, 7) === month)
  if (its.receipts.length === 0) {
    return (
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="week-title">
          From your receipts
        </h2>
        <p className="muted rc-empty">{receipts.length || refunds.length ? `No receipts in ${monthYear(month)}.` : 'Receipts you photograph show here.'}</p>
        {refunds.length ? (
          <div className="rc-body">
            <ul>
              <RefundLine refunds={refunds} onOpen={onOpen} />
            </ul>
          </div>
        ) : null}
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
          {its.before ? <ReceiptLine label={`By ${dayMonthLong(its.before.until)}`} amount={inWords(its.before.spent)} receipts={its.before.receipts} onOpen={onOpen} /> : null}
          <ReceiptLine label={`${receiptsWord(its.receipts.length)} from ${shops} shop${shops === 1 ? '' : 's'}`} receipts={its.receipts} onOpen={onOpen} />
          {refunds.length ? <RefundLine refunds={refunds} onOpen={onOpen} /> : null}
          {its.offers.saved.length ? <ReceiptLine label={`${inWords(its.offers.saved)} off with offers`} receipts={its.offers.receipts} onOpen={onOpen} /> : null}
        </ul>
      </div>
      <div className="card">
        <Months receipts={receipts} month={month} today={today} />
      </div>
      {its.toCheck.length ? (
        <Group title="Receipts to check" count={its.toCheck.length}>
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
        </Group>
      ) : null}
      <Shops its={its} onOpen={onOpen} />
      {its.kinds ? <ByKind kinds={its.kinds} onOpen={onOpen} /> : null}
      {its.forWho ? <WhoFor who={its.forWho} onOpen={onOpen} /> : null}
      {its.priceChanges.length ? (
        <Group title="Price changes at the same shop">
          <ul>
            {its.priceChanges.map((c) => (
              <ReceiptLine
                key={`${c.shop}-${c.name}`}
                label={c.name}
                sub={`${c.shop}: ${money(c.before.price, c.before.receipt.currency)} on ${dayMonth(c.before.receipt.date)}, ${money(c.now.price, c.now.receipt.currency)} on ${dayMonth(c.now.receipt.date)}`}
                receipts={[c.before.receipt, c.now.receipt]}
                onOpen={onOpen}
              />
            ))}
          </ul>
        </Group>
      ) : null}
      {its.repeats.length ? (
        <Group title="Bought again and again" status="Over the last 3 months">
          <Repeats its={its} onOpen={onOpen} />
        </Group>
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
            Open {monthYear(tapped.month)}<Icon name="chevron-right" size={16} />
          </a>
        ) : null
      }
    />
  )
}

/** Shops: those with 3+ receipts by what was spent, the rest by name; then shops under £10. */
function Shops({ its, onOpen }: { its: ShoppingMonth; onOpen: (r: KnownReceipt) => void }) {
  const line = (s: ShoppingMonth['shops']['ranked'][number]) => (
    <ReceiptLine key={s.key || 'none'} label={s.name ?? 'No shop read'} sub={receiptsWord(s.receipts.length)} amount={inWords(s.spent)} receipts={s.receipts} onOpen={onOpen} />
  )
  return (
    <Group title="Shops">
      {its.shops.ranked.length ? <ul>{its.shops.ranked.map(line)}</ul> : null}
      {its.shops.ranked.length && its.shops.others.length ? <p className="rc-note">Fewer than 3 receipts, by name</p> : null}
      {its.shops.others.length ? <ul>{its.shops.others.map(line)}</ul> : null}
      {its.small ? (
        <ul>
          <ReceiptLine
            label={`${its.small.receipts.length} shops under £${SMALL_SHOP / 100}`}
            amount={`${inWords(its.small.spent)} in all`}
            receipts={its.small.receipts}
            onOpen={onOpen}
          />
        </ul>
      ) : null}
    </Group>
  )
}

/** What was bought, by the kind your AI gave each item: kinds with 3+ items by what was spent, the rest in the list's
 *  order; then what has no kind yet. */
function ByKind({ kinds, onOpen }: { kinds: Kinds; onOpen: (r: KnownReceipt) => void }) {
  const line = (k: KindLine) => <ItemLine key={k.kind} label={k.kind} sub={itemsWord(k.items.length)} amount={inWords(k.spent)} items={k.items} onOpen={onOpen} />
  return (
    <Group title="By kind" status="Items at what you paid, after offers">
      {kinds.ranked.length ? <ul>{kinds.ranked.map(line)}</ul> : null}
      {kinds.ranked.length && kinds.others.length ? <p className="rc-note">Fewer than 3 items</p> : null}
      {kinds.others.length ? <ul>{kinds.others.map(line)}</ul> : null}
      {kinds.notSorted ? (
        <ul>
          <ReceiptLine
            label="Not sorted"
            sub={`${itemsWord(kinds.notSorted.items)} on ${receiptsWord(kinds.notSorted.receipts.length)}`}
            amount={inWords(kinds.notSorted.spent)}
            receipts={kinds.notSorted.receipts}
            onOpen={onOpen}
          />
        </ul>
      ) : null}
    </Group>
  )
}

/** What was bought by who it was for (v0.20.39): names with 3+ items by what was spent, the rest by name; what no name
 *  was given to last. */
function WhoFor({ who, onOpen }: { who: ForItems; onOpen: (r: KnownReceipt) => void }) {
  const line = (g: { who: string; items: KindLine['items']; spent: Amounts }) => <ItemLine key={g.who} label={g.who} sub={itemsWord(g.items.length)} amount={inWords(g.spent)} items={g.items} onOpen={onOpen} />
  return (
    <Group title="Who it was for" status="Items at what you paid, after offers">
      {who.ranked.length ? <ul>{who.ranked.map(line)}</ul> : null}
      {who.ranked.length && who.others.length ? <p className="rc-note">Fewer than 3 items</p> : null}
      {who.others.length ? <ul>{who.others.map(line)}</ul> : null}
      {who.nobody ? <ul>{line({ who: NOBODY, ...who.nobody })}</ul> : null}
    </Group>
  )
}

/** A kind's line, opening to its items, newest first: day, item, shop and price, each opening its receipt. */
function ItemLine(props: { label: string; sub: string; amount: string; items: KindLine['items']; onOpen: (r: KnownReceipt) => void }) {
  const { label, sub, amount, items, onOpen } = props
  const listed = [...items].sort((a, b) => b.receipt.date.localeCompare(a.receipt.date))
  return (
    <li>
      <details className="week-line">
        <RowSummary label={label} sub={sub} amount={amount} />
        <ul className="plain-list compact evidence-list">
          {listed.map(({ item, receipt }, i) => (
            <li key={`${receipt.id}-${i}`}>
              <RowButton
                date={shortDayMonth(receipt.date)}
                title={itemShown(item)}
                sub={receipt.shop || 'No shop read'}
                amount={money(paidFor(item), receipt.currency)}
                onClick={() => onOpen(receipt)}
              />
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

function Repeats({ its, onOpen }: { its: ShoppingMonth; onOpen: (r: KnownReceipt) => void }) {
  const line = (r: ShoppingMonth['repeats'][number]) => (
    <li key={r.name} className="receipt-repeat-row">
      <details className="week-line">
        <RowSummary
          label={r.name}
          badge={
            <span className="rc-badge" aria-hidden="true">
              {r.receipts.length}×
            </span>
          }
          sub={`on ${receiptsWord(r.receipts.length)}`}
          amount={inWords(r.spent)}
        />
        <ReceiptList receipts={r.receipts} onOpen={onOpen} />
      </details>
    </li>
  )
  const rest = its.repeats.slice(REPEATS_SHOWN)
  return (
    <>
      <ul>{its.repeats.slice(0, REPEATS_SHOWN).map(line)}</ul>
      {rest.length ? (
        <details className="week-line">
          <summary className="rc-row rc-more">{rest.length} more</summary>
          <ul>{rest.map(line)}</ul>
        </details>
      ) : null}
    </>
  )
}

/** A line that opens to its receipts. */
function ReceiptLine(props: { label: string; sub?: string; amount?: string; receipts: readonly KnownReceipt[]; onOpen: (r: KnownReceipt) => void }) {
  const { label, sub, amount, receipts, onOpen } = props
  return (
    <li>
      <details className="week-line">
        <RowSummary label={label} sub={sub} amount={amount} />
        <ReceiptList receipts={receipts} onOpen={onOpen} />
      </details>
    </li>
  )
}

/** The month's refund slips (v0.20.20, owner 2026-11-01: "just show it as refund receipt at max, don't include in any
 *  calculation"): what came back, said in words, no minus sign, and that it isn't counted; each opens to its items. */
function RefundLine(props: { refunds: readonly KnownReceipt[]; onOpen: (r: KnownReceipt) => void }) {
  const { refunds, onOpen } = props
  const back: Amounts = []
  for (const r of refunds) {
    const found = back.find((a) => a.currency === r.currency)
    if (found) found.minor += givenBack(r)
    else back.push({ currency: r.currency, minor: givenBack(r) })
  }
  return (
    <li>
      <details className="week-line">
        <RowSummary label={`${refunds.length} refund${refunds.length === 1 ? '' : 's'} · ${inWords(back)} back`} sub="not counted" />
        <ul className="plain-list compact evidence-list">
          {[...refunds]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((r) => (
              <li key={r.id}>
                <RowButton
                  date={shortDayMonth(r.date)}
                  title={r.shop || 'No shop read'}
                  sub={`refund of ${itemsWord(r.items.length)}`}
                  amount={`${money(givenBack(r), r.currency)} back`}
                  onClick={() => onOpen(r)}
                />
              </li>
            ))}
        </ul>
      </details>
    </li>
  )
}

const returnedCount = (r: KnownReceipt) => r.items.filter((item) => item.returned).length

/** Receipts, newest first: day, shop and what was spent, each opening to its items; with why, when it needs a look. */
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
                <RowSummary label={title} sub={r.shop || 'Unknown shop'} amount={money(paid(r), r.currency)} />
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
                                  {nameOf(line)} · {shortDayMonth(line.date)} · receipt {money(paid(r), r.currency)} · debit {money(debit, '£')}
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
              <RowButton
                date={shortDayMonth(r.date)}
                title={r.shop || 'No shop read'}
                amount={money(spentOn(r), r.currency)}
                flag={returnedCount(r) ? `${returnedCount(r)} returned` : undefined}
                onClick={() => onOpen(r)}
              />
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
                    <span className="purpose-label">{nameOf(line)} · {shortDayMonth(line.date)}</span>
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
