import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
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
import { classify, kindOf, linkReceipts, mayBeOwn, type MoneyLine, type Payee, type PayeeGroup, receiptPaymentCandidates } from '../../domain/money'
import { inWords, type KnownReceipt, money, paid, receiptsAndCopies, shoppingMonth, shoppingMonths } from '../../domain/shopping'
import { monthYear, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { Loading } from '../../ui/Loading'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { useOwnWords } from '../today/useOwnWords'
import { usePurposeSettings } from '../today/usePurpose'
import { type AccountsSection, AccountsMonth } from './AccountsMonth'
import { Accounts, RenameSheet } from './Accounts'
import { MoneyContext } from './MoneyContext'
import { ReceiptsMonth, ReceiptsShare, receiptsWord } from './Receipts'
import { StatementImport } from './StatementImport'
import { KindSheet, PaymentSheet } from './PaymentSheets'
import { ReceiptSheet } from './ReceiptSheet'
import { useAccountNames } from './useAccountNames'

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
  const [payment, setPayment] = useState<{ line: MoneyLine; way: string; group?: PayeeGroup } | null>(null)
  const [kindFor, setKindFor] = useState<PayeeGroup | null>(null)
  const [renaming, setRenaming] = useState<Payee | null>(null)
  const [importing, setImporting] = useState(false)
  const ownWords = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  const [view, setView] = useState<'accounts' | 'receipts'>(legacyView ?? 'accounts')
  // Which part of Accounts is open lives here, so stepping to another month keeps you where you were.
  const [section, setSection] = useState<AccountsSection>('overview')
  const earlierId = useId()
  useEffect(() => {
    if (legacyView) setView(legacyView)
  }, [legacyView])
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || bankLines === undefined || statements === undefined || own === undefined || names === undefined || payeeNames === undefined || kinds === undefined || notes === undefined || receiptReviews === undefined || closed === undefined || ownWords === undefined || purpose === undefined) return <Loading />

  const byId = new Map(entries.map((e) => [e.id, e]))
  const openEntry = (receipt: KnownReceipt) => {
    const entry = byId.get(receipt.entryId)
    if (entry) setSheet({ kind: 'open', entry })
  }
  const { receipts, copies, refunds } = receiptsAndCopies(entries)
  // A receipt opens to its items; an extra copy, counted nowhere, opens its entry, where it can be deleted.
  const copyIds = new Set(copies.map((c) => c.copy.id))
  const open = (receipt: KnownReceipt) => (copyIds.has(receipt.id) ? openEntry(receipt) : setReceiptId(receipt.id))
  // A refund slip (v0.20.20) opens the same way; it's counted nowhere.
  const openReceipt = receiptId ? [...receipts, ...refunds].find((r) => r.id === receiptId) : undefined
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
  // The months with money in or out, oldest first: Accounts steps between them.
  const accountMonths = [...new Set(lines.filter((l) => !l.moving).map((l) => l.date.slice(0, 7)))].sort()
  const earlier = shoppingMonths(receipts).filter((m) => m < thisMonth).sort().reverse()
  const manualReceiptId = payment ? manualReceiptByPayment.get(payment.line.id) : undefined
  const paymentReceipt = payment ? links.get(payment.line.id) : undefined
  const paymentReceiptDifference = payment && paymentReceipt ? paid(paymentReceipt) - Math.abs(payment.line.amount) : 0
  const paymentReceiptSummary =
    payment && paymentReceipt && paymentReceiptDifference
      ? `Receipt ${money(paid(paymentReceipt), paymentReceipt.currency)} · debit ${money(Math.abs(payment.line.amount), '£')} · difference ${money(Math.abs(paymentReceiptDifference), paymentReceipt.currency)}${receiptReasons[paymentReceipt.id] ? ` · ${receiptReasons[paymentReceipt.id]}` : ''}`
      : null

  return (
    <MoneyContext.Provider value={{ links, receiptReasons, open, names, kinds, notes, openPayment: (line, way, group) => setPayment({ line, way, group }), openKind: setKindFor, openRename: setRenaming, importStatement: () => setImporting(true) }}>
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
          <AccountsMonth key={`accounts-${month}`} lines={lines} month={month} today={today} statements={statements} closed={closed} months={accountMonths} section={section} onSection={setSection} />
        ) : view === 'receipts' ? (
          <ReceiptsMonth
            key={`receipts-${month}`}
            receipts={receipts}
            refunds={refunds}
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
        {view === 'receipts' && month === thisMonth && earlier.length ? (
          <section aria-labelledby={earlierId}>
            <h2 id={earlierId} className="week-title">
              Earlier months
            </h2>
            <nav className="money-month-history" aria-labelledby={earlierId}>
              {earlier.map((m) => {
                const bought = shoppingMonth(receipts, m, today)
                const said = `${inWords(bought.spent)} on ${receiptsWord(bought.receipts.length)}`
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
        {importing ? <StatementImport onClose={() => setImporting(false)} /> : null}
        {payment ? (
          <PaymentSheet
            key={payment.line.id}
            line={payment.line}
            way={payment.way}
            note={notes[payment.line.id] ?? ''}
            receiptSummary={paymentReceiptSummary}
            kind={kindOf(payment.line, kinds)}
            onKind={() => {
              setKindFor({ payee: payment.line.payee, total: Math.abs(payment.line.amount), lines: [payment.line] })
            }}
            onRename={() => {
              setRenaming(payment.line.payee)
            }}
            onOwn={
              payment.group && mayBeOwn(payment.group.lines)
                ? async () => {
                    await markOwnPayee(payment.group!.payee.key, true)
                    setPayment(null)
                  }
                : null
            }
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
        {renaming ? (
          <RenameSheet
            title="Rename transaction"
            shown={renaming.name}
            hint={renaming.original ? `Statement says “${renaming.original}”. Left empty, it restores it.` : 'Applies to existing and future matching transactions.'}
            onSave={async (name) => {
              await namePayee(renaming.key, name)
            }}
            onClose={() => setRenaming(null)}
          />
        ) : null}
        {openReceipt ? (
          <ReceiptSheet
            receipt={openReceipt}
            onOpenEntry={() => {
              setReceiptId(null)
              openEntry(openReceipt)
            }}
            onClose={() => setReceiptId(null)}
          />
        ) : null}
        <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={ownWords} purpose={purpose} />
      </div>
    </MoneyContext.Provider>
  )
}
