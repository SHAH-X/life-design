import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import {
  acceptReceiptDate,
  accountNamesOf,
  CARD_ACCOUNTS,
  CLOSED_ACCOUNTS,
  markOwnPayee,
  matchReceiptPayment,
  PAYEE_KINDS,
  PAYMENT_NOTES,
  namePayee,
  namePayment,
  OWN_PAYEES,
  ownPayeesOf,
  PAYEE_FOR,
  PAYEE_NAMES,
  PAYMENT_FOR,
  filePayment,
  PAYMENT_NAMES,
  RECEIPT_REVIEWS,
  receiptReviewState,
  unmatchReceiptPayment,
} from '../../db/statements'
import { investingMonths } from '../../domain/investing'
import { cardAccountOf, classify, forNamesOf, giftCardsBefore, isGiftCardBuy, kindOf, labelsOf, linkGiftCards, linkReceipts, mayBeOwn, type MoneyLine, moneyMonth, nameOf, type Payee, type PayeeGroup, paymentsWithoutReceipt, type ReceiptOutcome, receiptOutcomes, receiptPaymentCandidates, suggestedPeople, withFor } from '../../domain/money'
import { notReadYet } from '../../domain/aiReading'
import { approvalOf, inWords, type KnownReceipt, money, onCard, receiptsAndCopies, rememberedKindsOf, rememberedNamesOf, shoppingMonth, shoppingMonths } from '../../domain/shopping'
import { productViews } from '../../domain/products'
import { approveReceipt, ITEM_FOR_SETTING, ITEM_KINDS_SETTING } from '../../db/receiptItems'
import { dayMonth, monthYear, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { Loading } from '../../ui/Loading'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { useOwnWords } from '../today/useOwnWords'
import { usePurposeSettings } from '../today/usePurpose'
import { type AccountsSection, AccountsMonth, MonthStepper, neighbourMonths, renameHint } from './AccountsMonth'
import { Accounts, RenameSheet } from './Accounts'
import { AccountsYear } from './AccountsYear'
import { Investing } from './Investing'
import { MoneyContext } from './MoneyContext'
import { AddReceipt } from './AddReceipt'
import { ReceiptsMonth, ReceiptsShare, receiptsWord } from './Receipts'
import { StatementImport } from './StatementImport'
import { ForSheet, KindSheet, PaymentSheet } from './PaymentSheets'
import { BillsTile } from './Bills'
import { PricesGroup, ProductSheet } from './Prices'
import { type PaidWith, ReceiptSheet } from './ReceiptSheet'
import { useAccountNames } from './useAccountNames'
import { Icon } from '../../ui/Icon'
import { BackLink } from '../../ui/BackLink'

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
  const investLines = useLiveQuery(() => db.investLines.toArray(), [])
  const investSummaries = useLiveQuery(() => db.investSummaries.toArray(), [])
  const productRecords = useLiveQuery(() => db.products.toArray(), [])
  const [productKey, setProductKey] = useState<string | null>(null)
  const own = useLiveQuery(async () => ownPayeesOf(await db.settings.get(OWN_PAYEES)), [])
  const names = useAccountNames()
  const closed = useLiveQuery(async () => new Set(ownPayeesOf(await db.settings.get(CLOSED_ACCOUNTS))), [])
  const payeeNames = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYEE_NAMES)), [])
  const paymentNames = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYMENT_NAMES)), [])
  const payeeFor = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYEE_FOR)), [])
  const paymentFor = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYMENT_FOR)), [])
  const kinds = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYEE_KINDS)), [])
  // What you wrote on a payment before v0.20.36 is its name (`labelsOf`).
  const notes = useLiveQuery(async () => accountNamesOf(await db.settings.get(PAYMENT_NOTES)), [])
  const remembered = useLiveQuery(async () => rememberedKindsOf((await db.settings.get(ITEM_KINDS_SETTING))?.value), [])
  const itemFor = useLiveQuery(async () => rememberedNamesOf((await db.settings.get(ITEM_FOR_SETTING))?.value), [])
  const receiptReviews = useLiveQuery(async () => receiptReviewState((await db.settings.get(RECEIPT_REVIEWS))?.value), [])
  const cardAccounts = useLiveQuery(async () => accountNamesOf(await db.settings.get(CARD_ACCOUNTS)), [])
  const [payment, setPayment] = useState<{ line: MoneyLine; way: string; group?: PayeeGroup } | null>(null)
  const [kindFor, setKindFor] = useState<PayeeGroup | null>(null)
  const [renaming, setRenaming] = useState<Payee | null>(null)
  const [whoFor, setWhoFor] = useState<MoneyLine | null>(null)
  // The payment whose sheet the rename was opened from: it may be named alone, which a payee's row can't offer.
  const [renamingLine, setRenamingLine] = useState<MoneyLine | null>(null)
  const [importing, setImporting] = useState(false)
  const ownWords = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)
  // Where to open can come in the address (`#/money/2026-10?section=spending&find=Tesco`, `?view=receipts`): the quick answers send a row to
  // the payments or the receipts it counted, so they land where Money lists them the same way as anywhere (audit 2026-11-23).
  const [opened] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''))
  const [view, setView] = useState<'accounts' | 'receipts' | 'investing'>(legacyView ?? (opened.get('view') === 'receipts' ? 'receipts' : 'accounts'))
  // Which part of Accounts is open lives here, so stepping to another month keeps you where you were.
  const [section, setSection] = useState<AccountsSection>(opened.get('section') === 'spending' ? 'spending' : 'overview')
  // What's typed in Spending's search box lives here too, for the same reason.
  const [query, setQuery] = useState(opened.get('find') ?? '')
  const earlierId = useId()
  useEffect(() => {
    if (legacyView) setView(legacyView)
  }, [legacyView])
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || bankLines === undefined || statements === undefined || investLines === undefined || investSummaries === undefined || productRecords === undefined || own === undefined || names === undefined || payeeNames === undefined || paymentNames === undefined || payeeFor === undefined || paymentFor === undefined || kinds === undefined || notes === undefined || remembered === undefined || itemFor === undefined || receiptReviews === undefined || cardAccounts === undefined || closed === undefined || ownWords === undefined || purpose === undefined) return <Loading />

  const byId = new Map(entries.map((e) => [e.id, e]))
  const openEntry = (receipt: KnownReceipt) => {
    const entry = byId.get(receipt.entryId)
    if (entry) setSheet({ kind: 'open', entry })
  }
  const { receipts, copies, refunds, held } = receiptsAndCopies(entries, remembered, itemFor)
  const products = productViews(receipts, productRecords)
  const openProduct = productKey ? products.find((p) => p.members.includes(productKey)) : undefined
  // Receipts added here not read yet (v0.26.0): said, so one never vanishes until it's read.
  const counted = new Set([...receipts, ...held, ...refunds].map((r) => r.id).concat(copies.map((c) => c.copy.id)))
  const receiptsWaiting = entries.filter((e) => e.status !== 'draft').flatMap((e) => e.photos ?? []).filter((p) => notReadYet(p) && !counted.has(p.id)).length
  // A receipt opens to its items; an extra copy, counted nowhere, opens its entry, where it can be deleted.
  const copyIds = new Set(copies.map((c) => c.copy.id))
  const open = (receipt: KnownReceipt) => (copyIds.has(receipt.id) ? openEntry(receipt) : setReceiptId(receipt.id))
  // A refund slip (v0.20.20) opens the same way; it's counted nowhere.
  const openReceipt = receiptId ? [...receipts, ...held, ...refunds].find((r) => r.id === receiptId) : undefined
  const lines = withFor(classify(bankLines, new Set(own), payeeNames, labelsOf(notes, paymentNames)), payeeFor, paymentFor)
  const forNames = forNamesOf(payeeFor, paymentFor, itemFor)
  const forSuggestions = suggestedPeople(entries.flatMap((e) => e.people), forNames)
  // Which account each card is (v0.24.0): only an account still brought in, or none of them.
  const cards = Object.fromEntries(Object.entries(cardAccounts).filter(([, account]) => account === '' || names.has(account)))
  const links = linkReceipts(lines, receipts, receiptReviews.paymentLinks, cards)
  const receiptReasons = receiptReviews.paymentReasons
  const manualReceiptByPayment = new Map(
    [...links].flatMap(([paymentId, receipt]) => (receiptReviews.paymentLinks[receipt.id] === paymentId ? [[paymentId, receipt.id] as const] : [])),
  )
  const reviewedDates = new Set([...receiptReviews.acceptedDates, ...Object.keys(receiptReviews.paymentLinks)])
  const linkedReceiptIds = new Set([...links.values()].map((receipt) => receipt.id))
  const matchCandidates = new Map<string, MoneyLine[]>(
    receipts
      .filter((receipt) => !linkedReceiptIds.has(receipt.id) && !receiptReviews.acceptedDates.includes(receipt.id))
      .map((receipt): [string, MoneyLine[]] => [receipt.id, receiptPaymentCandidates(lines, receipt, new Set(links.keys()), cards)])
      .filter(([, candidates]) => candidates.length > 0),
  )
  const possiblePaymentIds = new Set<string>(matchCandidates.keys())
  // What became of each receipt, and the payments with no receipt (v0.35.0).
  // With no statement in there is nothing to match to: no outcome is told, not "0 of N matched" (audit 2026-11-20).
  // The gift card bought for each receipt paid by one (owner 2026-11-20): for the cost of a card is a little under what went on it.
  const giftBuys = linkGiftCards(lines, receipts)
  const outcomes = statements.length ? receiptOutcomes(receipts, lines, links, cards, statements, names, giftBuys) : new Map<string, ReceiptOutcome>()
  const withoutReceipt = !statements.length ? [] : paymentsWithoutReceipt(lines, links, kinds, receipts, new Set([...matchCandidates.values()].flat().map((l) => l.id)))
  const paymentOfReceipt = new Map([...links].map(([lineId, receipt]) => [receipt.id, lines.find((l) => l.id === lineId)!]))
  const shownName = (account: string) => names.get(account) ?? account
  // How a receipt was paid, for its sheet: its card's account (or its payment's), its payment, or that its statement isn't in.
  const paidWith = (receipt: KnownReceipt): PaidWith => {
    const said = cardAccountOf(receipt, cards)
    const payment = paymentOfReceipt.get(receipt.id)
    const account = said || payment?.account
    const covered = !account || statements.some((s) => s.account === account && s.from <= receipt.date && receipt.date <= s.to)
    return {
      ...(receipt.card ? { card: receipt.card } : {}),
      ...(said !== undefined ? { said } : {}),
      ...(account ? { accountName: shownName(account) } : {}),
      ...(payment ? { payment: { date: payment.date, amount: -payment.amount, accountName: shownName(payment.account) }, paymentAccount: payment.account } : {}),
      notIn: !payment && !covered,
      ...(receipt.byGiftCard
        ? {
            byGiftCard: receipt.byGiftCard,
            onCard: onCard(receipt),
            ...(giftBuys.get(receipt.id) ? { bought: { date: giftBuys.get(receipt.id)!.date, amount: -giftBuys.get(receipt.id)!.amount, accountName: shownName(giftBuys.get(receipt.id)!.account) } } : {}),
            giftCards: giftCardsBefore(lines, receipt.date).map((l) => ({ id: l.id, date: l.date, amount: -l.amount, accountName: shownName(l.account) })),
          }
        : {}),
      accounts: [...names].sort((a, b) => a[1].localeCompare(b[1], 'en', { sensitivity: 'base' })),
    }
  }
  const lineById = new Map(lines.map((l) => [l.id, l]))
  const today = toDateKey(new Date())
  const thisMonth = today.slice(0, 7)
  const month = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : thisMonth
  // The months with money in or out, oldest first: Accounts steps between them.
  const accountMonths = [...new Set(lines.filter((l) => !l.moving).map((l) => l.date.slice(0, 7)))].sort()
  // The years with money in or out, oldest first: the year page steps between them. A year is the Accounts view's only.
  const accountYears = [...new Set(accountMonths.map((m) => m.slice(0, 4)))]
  const year = view === 'accounts' && lines.length && sub && /^\d{4}$/.test(sub) ? sub : null
  // The arrows between months sit in the title row (Accounts only, where there is a month of money to step through).
  const { earlier: earlierMonth, later: laterMonth } = neighbourMonths(accountMonths, month, today)
  // Investing (Trading 212's trades, dividends and interest) steps between its own months; with none in this month it opens on its latest.
  const investMonths = investingMonths(investLines)
  const investMonth = sub && /^\d{4}-\d{2}$/.test(sub) ? sub : investMonths.includes(thisMonth) ? thisMonth : (investMonths.at(-1) ?? thisMonth)
  // Only months with something in them: a later one that is not there would open the same screen again.
  const investNeighbours = { earlier: investMonths.filter((m) => m < investMonth).at(-1), later: investMonths.find((m) => m > investMonth) }
  const investLatest = investMonths.at(-1) ?? thisMonth
  // What Money works out for the month of your accounts is done once here: its title row says when a statement needs a look.
  const its = lines.length ? moneyMonth(lines, month, today, statements, closed, kinds) : null
  const statementsOpen = view === 'accounts' && section === 'statements'
  const statementsButton = its ? (
    <button
      type="button"
      className="money-statements"
      aria-pressed={statementsOpen}
      data-attention={its.toCheck.accounts.length || its.toCheck.lines.length ? '' : undefined}
      onClick={() => {
        setView('accounts')
        setSection(statementsOpen ? 'overview' : 'statements')
      }}
    >
      Statements
    </button>
  ) : null
  const steps =
    view === 'accounts' && lines.length ? (
      <MonthStepper thisMonth={thisMonth} earlier={earlierMonth} later={laterMonth} />
    ) : view === 'investing' && investLines.length ? (
      <MonthStepper thisMonth={thisMonth} earlier={investNeighbours.earlier} later={investNeighbours.later} />
    ) : null
  const earlier = shoppingMonths([...receipts, ...held]).filter((m) => m < thisMonth).sort().reverse()
  // The open payment is read afresh from the lines, so a name given to it shows in its sheet at once.
  const shown = payment ? { ...payment, line: lines.find((l) => l.id === payment.line.id) ?? payment.line } : null
  const manualReceiptId = payment ? manualReceiptByPayment.get(payment.line.id) : undefined
  const paymentReceipt = payment ? links.get(payment.line.id) : undefined
  const paymentReceiptDifference = payment && paymentReceipt ? onCard(paymentReceipt) - Math.abs(payment.line.amount) : 0
  // A gift card bought through Blue Light Card says which receipt it paid for, if one is matched to it.
  const spentOn = payment && isGiftCardBuy(payment.line) ? [...giftBuys].find(([, line]) => line.id === payment.line.id)?.[0] : undefined
  const giftReceipt = spentOn ? receipts.find((r) => r.id === spentOn) : undefined
  const paymentReceiptSummary =
    payment && giftReceipt
      ? `Spent on a receipt at ${giftReceipt.shop || 'a shop'} on ${dayMonth(giftReceipt.date)} · ${money(giftReceipt.byGiftCard!, giftReceipt.currency)} by gift card`
      : payment && paymentReceipt && paymentReceiptDifference
      ? `Receipt ${money(onCard(paymentReceipt), paymentReceipt.currency)}${paymentReceipt.byGiftCard ? ' after gift card' : ''} · debit ${money(Math.abs(payment.line.amount), '£')} · difference ${money(Math.abs(paymentReceiptDifference), paymentReceipt.currency)}${receiptReasons[paymentReceipt.id] ? ` · ${receiptReasons[paymentReceipt.id]}` : ''}`
      : null

  return (
    <MoneyContext.Provider value={{ links, receiptReasons, open, names, kinds, openPayment: (line, way, group) => setPayment({ line, way, group }), openKind: setKindFor, openRename: (payee) => { setRenamingLine(null); setRenaming(payee) }, importStatement: () => setImporting(true), moneyLine: (id) => lineById.get(id) }}>
      <div className="money-screen">
        {year ? (
          <>
            <BackLink href={hashFor('money')}>Money</BackLink>
            <h1>{year}</h1>
          </>
        ) : (
          // The same title row on every month, so nothing moves when you step back (audit 2026-11-20); the month is in the
          // figure's label under it, with a way back to the latest.
          <div className="money-title">
            <h1>Money</h1>
            {statementsButton}
            {steps}
          </div>
        )}
        {year ? null : (
          <div className="money-switch segmented" role="group" aria-label="Money sections">
          <button type="button" aria-pressed={view === 'accounts' && section === 'overview'} onClick={() => { setView('accounts'); setSection('overview') }}>
            {lines.length ? 'Overview' : 'Accounts'}
          </button>
          {lines.length ? (
            <button type="button" aria-pressed={view === 'accounts' && section === 'spending'} onClick={() => { setView('accounts'); setSection('spending') }}>
              Spending
            </button>
          ) : null}
          <button type="button" aria-pressed={view === 'receipts'} onClick={() => setView('receipts')}>
            Receipts
          </button>
          {investLines.length ? (
            <button type="button" aria-pressed={view === 'investing'} onClick={() => setView('investing')}>
              Investing
            </button>
          ) : null}
        </div>
        )}
        {year ? (
          <AccountsYear key={`accounts-year-${year}`} lines={lines} year={year} today={today} statements={statements} closed={closed} years={accountYears} />
        ) : view === 'investing' && investLines.length ? (
          <Investing key={`investing-${investMonth}`} lines={investLines} summaries={investSummaries} month={investMonth} latest={investLatest} thisMonth={thisMonth} />
        ) : view === 'accounts' && lines.length ? (
          // Keyed by month: a month opened from another starts afresh (a tapped chart column doesn't carry over).
          <AccountsMonth key={`accounts-${month}`} lines={lines} its={its!} month={month} today={today} statements={statements} closed={closed} section={section} onSection={setSection} query={query} onQuery={setQuery} />
        ) : view === 'receipts' ? (
          <>
            <AddReceipt waiting={receiptsWaiting} />
            <ReceiptsMonth
              key={`receipts-${month}`}
              receipts={receipts}
              refunds={refunds}
              held={held}
              copies={copies}
              month={month}
              today={today}
              reviewedDates={reviewedDates}
              matchCandidates={matchCandidates}
              possiblePaymentIds={possiblePaymentIds}
              outcomes={outcomes}
              withoutReceipt={withoutReceipt}
              accountName={(account) => names.get(account) ?? account}
              onAcceptDate={acceptReceiptDate}
              onApprove={(r, approve) => approveReceipt(r.entryId, r.id, approve ? approvalOf(r) : null)}
              onMatchPayment={(receiptId, paymentId, reason) => matchReceiptPayment(receiptId, paymentId, reason, new Set(receipts.map((r) => r.id)))}
              onOpen={open}
            />
          </>
        ) : null}
        {view === 'receipts' && month === thisMonth ? <PricesGroup views={products} onOpen={(p) => setProductKey(p.members[0]!)} /> : null}
        {view === 'receipts' && month === thisMonth && earlier.length ? (
          <section aria-labelledby={earlierId}>
            <h2 id={earlierId} className="week-title">
              Earlier months
            </h2>
            <nav className="money-month-history" aria-labelledby={earlierId}>
              {earlier.map((m) => {
                const bought = shoppingMonth(receipts, m, today)
                const notCounted = held.filter((r) => r.date.slice(0, 7) === m).length
                const said = [bought.receipts.length ? `${inWords(bought.spent)} on ${receiptsWord(bought.receipts.length)}` : 'Nothing counted', notCounted ? `${notCounted} not counted yet` : ''].filter(Boolean).join(' · ')
                return (
                  <a key={m} className="money-month-card" href={hashFor('money', m)}>
                    <span className="list-text">
                      <span className="list-title">{monthYear(m)}</span>
                      <span className="list-status">{said}</span>
                    </span>
                    <span className="list-chevron" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
                  </a>
                )
              })}
            </nav>
          </section>
        ) : null}
        {view === 'receipts' && month === thisMonth && receipts.length ? <ReceiptsShare receipts={receipts} /> : null}
        {view === 'accounts' && !lines.length ? (
          <>
            {/* Bills and budgets are listed by you: not out of reach until a statement is in (audit 2026-11-23). */}
            <div className="acc-tiles">
              <BillsTile lines={[]} kindSpend={{}} statements={[]} closed={new Set()} month={thisMonth} today={today} />
            </div>
            <Accounts />
          </>
        ) : null}
        {importing ? <StatementImport onClose={() => setImporting(false)} /> : null}
        {shown ? (
          <PaymentSheet
            key={shown.line.id}
            line={shown.line}
            way={shown.way}
            receiptSummary={paymentReceiptSummary}
            kind={kindOf(shown.line, kinds)}
            // A category is for money out: on money in or money moved it changes nothing on screen (audit 2026-11-20).
            onKind={
              shown.line.moving || (shown.line.amount > 0 && !shown.line.refund)
                ? null
                : () => {
                    setKindFor({ payee: shown.line.payee, total: Math.abs(shown.line.amount), lines: [shown.line] })
                  }
            }
            onWho={!shown.line.moving && (shown.line.amount < 0 || shown.line.refund) ? () => setWhoFor(shown.line) : null}
            onRename={() => {
              setRenamingLine(shown.line)
              setRenaming(shown.line.payee)
            }}
            // Whether it may be you moving money is the payee's (its payments, all of them), not where the sheet was opened from.
            onOwn={
              mayBeOwn(lines.filter((l) => l.payee.key === shown.line.payee.key))
                ? async () => {
                    await markOwnPayee(shown.line.payee.key, true)
                    setPayment(null)
                  }
                : null
            }
            onReceipt={
              links.get(shown.line.id)
                ? () => {
                    const receipt = links.get(shown.line.id)!
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
        {whoFor ? (
          <ForSheet
            current={whoFor.forWho ?? ''}
            names={forNames}
            suggestions={forSuggestions}
            scopes={{ payee: whoFor.payee.name, all: whoFor.payee.key in payeeFor && !(whoFor.id in paymentFor) }}
            onFile={(who, scope) => filePayment(whoFor.id, whoFor.payee.key, who, scope)}
            onClose={() => setWhoFor(null)}
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
            hint={renameHint(renaming)}
            onSave={async (name) => {
              await namePayee(renaming.key, name)
            }}
            only={
              renamingLine
                ? {
                    shown: nameOf(renamingLine),
                    named: Boolean(renamingLine.label),
                    shop: renaming.name,
                    onSave: (name) => namePayment(renamingLine.id, name),
                  }
                : undefined
            }
            onClose={() => {
              setRenaming(null)
              setRenamingLine(null)
            }}
          />
        ) : null}
        {openProduct ? <ProductSheet view={openProduct} onClose={() => setProductKey(null)} /> : null}
        {openReceipt ? (
          <ReceiptSheet
            receipt={openReceipt}
            names={forNames}
            suggestions={forSuggestions}
            paidWith={openReceipt.refund ? undefined : paidWith(openReceipt)}
            onApprove={(approve) => approveReceipt(openReceipt.entryId, openReceipt.id, approve ? approvalOf(openReceipt) : null)}
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
