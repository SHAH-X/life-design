// Money (v0.20, step 2 of the owner's plan): what came in and went out of your accounts, from the statements brought in
// (src/domain/statements.ts), worked out on the phone. Money moved between your own accounts is left out, so nothing
// counts twice: Monzo Flex (a purchase is given back by a "Flex" line and paid off later: the purchase is the spending),
// pots, the two sides of a transfer between two accounts brought in, and payees you mark as your own. Counts and amounts
// only: nothing averaged, rated or set as a limit (DECISIONS, "Never"); groups are ranked only with MIN_COUNT payments.
import { MIN_COUNT } from '../analysis/stats'
import type { BankLine, StatementRecord } from '../db/types'
import { addDays, addMonths, dayNumber } from '../lib/dates'
import { chainOf } from './receipts'
import { groupBy, type KnownReceipt, paid, shiftMonth, shopKey } from './shopping'

/** Who a line was paid to or from, as one name (a UK chain's names as the chain). */
export interface Payee {
  key: string
  name: string
}

/** Why a line is money moved, not money in or out. */
export type Moving = 'flex' | 'pot' | 'between' | 'own'

export interface MoneyLine extends BankLine {
  payee: Payee
  moving: Moving | null
  /** Money back from where it was spent: it lowers that spending, never counts as money in (owner, 2026-10-26). */
  refund: boolean
}

/** A line that says it's money back: Monzo's note on a petrol hold given back, a refund or an adjustment. */
const REFUND_NOTE = /\s*This relates to a previous transaction\.?/i
const REFUND = /^(?:refund|adjustment) for\b/i

const COUNTRY = /\s+(?:GBR|GB|IRL|USA|US|FRA|DEU|ESP|ITA|NLD|BEL|PRT)$/i

/** "EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. …" is EXAMPLE SOFTWARE DUBLIN; "Example Gym (Faster Payments)
 *  Reference: …" is Example Gym; "TESCO SOMETOWN GBR" is Tesco. */
export function payeeOf(description: string): Payee {
  const name = description
    .replace(REFUND_NOTE, '')
    .replace(REFUND, '')
    .replace(/\s*Amount:\s.*$/i, '')
    .replace(/\s*\(Faster Payments\)/i, '')
    .replace(/\s*Reference:.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(COUNTRY, '')
    .trim()
  const chain = chainOf(name)
  return chain ? { key: chain.key, name: chain.name } : { key: name.toLowerCase(), name }
}

function movingOf(line: BankLine, payee: Payee, own: ReadonlySet<string>): Moving | null {
  const words = line.description.trim().toLowerCase()
  if (line.account.startsWith('Monzo') && words === 'flex') return 'flex'
  // The Flex statement itself: a purchase moved to Flex is on the current account already, and paying Flex is the
  // other side of the current account's "Flex" line. What Flex paid itself, and its refunds, count.
  if (line.account === 'Monzo Flex' && (/\bmoved to flex$/.test(words) || /^you paid (?:early|extra)\b/.test(words))) return 'flex'
  if (line.account.endsWith(' pot')) return /\binterest\b/.test(words) ? null : 'pot'
  if (/^transfer (?:from|to) pot\b/.test(words)) return 'pot'
  if (own.has(payee.key)) return 'own'
  return null
}

/** Lloyds' types for a card payment, a cash machine and a direct debit: never money moved to yourself. */
const NOT_OWN_TYPES = new Set(['DEB', 'CPT', 'DD'])

/** A card payment by its words, where no type is printed (Monzo): a foreign amount, or the country last. */
const byCard = (description: string) => /\sAmount:\s/i.test(description) || COUNTRY.test(description.trim())

/** Whether a payee's lines could be you moving money (owner, 2026-10-26: it was offered under a supermarket and every
 *  card payment): not a known shop, and none paid by card, cash machine or direct debit. */
export const mayBeOwn = (lines: readonly MoneyLine[]): boolean =>
  lines.length > 0 && !chainOf(lines[0]!.payee.name) && !lines.some((l) => NOT_OWN_TYPES.has(l.type.trim().toUpperCase()) || byCard(l.description))

/** The name each account is shown by (owner, 2026-10-26): the one you gave it, else its bank's ("Monzo"), with the
 *  account number's last 4 digits only when another account would share the name. */
export function accountNames(accounts: readonly string[], chosen: Readonly<Record<string, string>> = {}): Map<string, string> {
  const short = (account: string) => account.replace(/ ···\d{4}$/, '')
  const given = (account: string) => chosen[account]?.trim() || null
  const wanted = (account: string) => given(account) ?? short(account)
  const uses = new Map<string, number>()
  for (const account of accounts) uses.set(wanted(account), (uses.get(wanted(account)) ?? 0) + 1)
  return new Map(accounts.map((account) => [account, uses.get(wanted(account))! > 1 && !given(account) ? account : wanted(account)]))
}

/** The days an account has no statement for (owner, 2026-10-26: "for which month the data is yet not imported"): gaps
 *  from its first statement up to `today`, or only up to its last statement when it's closed. Oldest first. */
export function notBroughtIn(statements: readonly Pick<StatementRecord, 'from' | 'to'>[], today: string, closed = false): { from: string; to: string }[] {
  const spans = [...statements].sort((a, b) => a.from.localeCompare(b.from))
  if (!spans.length) return []
  const gaps: { from: string; to: string }[] = []
  let covered = spans[0]!.to
  for (const span of spans.slice(1)) {
    if (span.from > addDays(covered, 1)) gaps.push({ from: addDays(covered, 1), to: addDays(span.from, -1) })
    if (span.to > covered) covered = span.to
  }
  if (!closed && covered < today) gaps.push({ from: addDays(covered, 1), to: today })
  return gaps
}

/** How far apart (days) the two sides of a transfer between your accounts can be. */
const TRANSFER_DAYS = 3

/** Each line with its payee (by the name you gave it, if any), and whether it's money moved (in the order given). */
export function classify(lines: readonly BankLine[], own: ReadonlySet<string>, named: Readonly<Record<string, string>> = {}): MoneyLine[] {
  const classed = lines.map((line): MoneyLine => {
    const printed = payeeOf(line.description)
    const payee = named[printed.key] ? { ...printed, name: named[printed.key]! } : printed
    return { ...line, payee, moving: movingOf(line, payee, own), refund: false }
  })
  const apart = (a: MoneyLine, b: MoneyLine) => Math.abs(dayNumber(a.date) - dayNumber(b.date))
  for (const out of classed.filter((l) => !l.moving && l.amount < 0)) {
    const into = classed
      .filter((l) => !l.moving && l.amount === -out.amount && l.account !== out.account && apart(l, out) <= TRANSFER_DAYS)
      .sort((a, b) => apart(a, out) - apart(b, out))[0]
    if (into) out.moving = into.moving = 'between'
  }
  // Money in from a payee you've paid, or marked as a refund, is money back.
  // An online shop writes its name two ways ("EXAMPLESHOP.CO.UK", "EXAMPLESHOP* 972…"): its name runs into a "." or
  // "*". Plain first words aren't enough ("British Gas", "British Heart Foundation").
  const webName = (key: string) => key.match(/^([a-z]{3,})[.*]/)?.[1]
  const paidTo = new Set(classed.filter((l) => !l.moving && l.amount < 0).flatMap((l) => [l.payee.key, webName(l.payee.key) ?? []].flat()))
  for (const l of classed) {
    const web = webName(l.payee.key)
    const back = paidTo.has(l.payee.key) || (web !== undefined && paidTo.has(web)) || REFUND_NOTE.test(l.description) || REFUND.test(l.description.trim())
    l.refund = !l.moving && l.amount > 0 && back
  }
  return classed
}

/** A row in a list of payments: one line, or a move between two of your accounts (money out of `line`, into `to`). */
export interface PaymentRow {
  line: MoneyLine
  to?: MoneyLine
}

/** Lines as rows, newest first, the two sides of a move between your accounts as one (owner, 2026-10-26: a pot's
 *  move showed twice, once each way): money out of one and the same into another within TRANSFER_DAYS, nearest first. */
export function joinMoves(lines: readonly MoneyLine[]): PaymentRow[] {
  const apart = (a: MoneyLine, b: MoneyLine) => Math.abs(dayNumber(a.date) - dayNumber(b.date))
  const used = new Set<MoneyLine>()
  const rows: PaymentRow[] = []
  for (const out of lines.filter((l) => l.amount < 0).sort((a, b) => a.date.localeCompare(b.date))) {
    const to = lines.filter((l) => !used.has(l) && l.amount === -out.amount && l.account !== out.account && apart(l, out) <= TRANSFER_DAYS).sort((a, b) => apart(a, out) - apart(b, out))[0]
    if (!to) continue
    used.add(out).add(to)
    rows.push({ line: out, to })
  }
  for (const single of lines) if (!used.has(single)) rows.push({ line: single })
  return rows.sort((a, b) => b.line.date.localeCompare(a.line.date))
}

/** What a payment was for (owner, 2026-10-26): plain kinds, no order among them. */
export const PAYMENT_KINDS = [
  'Rent',
  'Council tax',
  'Energy',
  'Water',
  'Phone and internet',
  'Groceries',
  'Eating out',
  'Shopping',
  'Fuel',
  'Parking',
  'Transport',
  'Subscriptions',
  'Insurance',
  'Health',
  'Giving',
  'Saving and investing',
  'Other',
] as const
export type PaymentKind = (typeof PAYMENT_KINDS)[number]

/** Kinds guessed from a description, for common UK payees; what you choose for a payee always wins. Fuel before a
 *  supermarket ("ASDA PETROL"). */
const GUESSES: [PaymentKind, RegExp][] = [
  ['Fuel', /\b(?:petrol|fuel|esso|shell|texaco|bp)\b/i],
  ['Parking', /\bcar ?park|\bparking\b|paybyphone|ringgo/i],
  ['Council tax', /\bcouncil\b/i],
  ['Energy', /british gas|octopus|\bedf\b|e\.on|\bovo\b|scottish power/i],
  ['Water', /\bwater\b/i],
  ['Phone and internet', /virgin media|vodafone|lebara|giffgaff|\bo2\b|\bee\b|three\.co|\bbt\b|talktalk|plusnet|\bsky\b/i],
  ['Rent', /\brent\b|lettings|goodlord/i],
  ['Insurance', /insurance|hastings direct|admiral|aviva|direct line/i],
  ['Saving and investing', /trading ?212|vanguard|freetrade|hargreaves|nutmeg|moneybox/i],
  ['Subscriptions', /netflix|spotify|disney|anthropic|claude|openai|youtube|icloud|apple\.com|google (?:one|storage)|prime video|audible|github/i],
  ['Transport', /trainline|national express|flixbus|\bflix\b|transport for london|\btfl\b|\buber\b|stagecoach|arriva|\bbus\b|\brail/i],
  ['Eating out', /pizza|mcdonald|starbucks|costa|greggs|nando|kfc|subway|tim hortons|domino|deliveroo|just eat|uber eats/i],
  ['Health', /pharmacy|\bboots\b|dentist|\bnhs\b|optician/i],
  ['Giving', /charity|foundation|mandir|temple|church|mosque|gurdwara|donation/i],
  ['Shopping', /amazon|temu|ebay|argos|currys|dunelm|john lewis|\bnext\b|primark|ikea|matalan|tk ?maxx|homesense/i],
]

/** What a payment was for: the kind you chose for its payee, else a guess (a supermarket chain is groceries), else
 *  null. */
export function kindOf(line: MoneyLine, chosen: Readonly<Record<string, string>>): string | null {
  const yours = chosen[line.payee.key]
  if (yours) return yours
  const guess = GUESSES.find(([, words]) => words.test(line.description))?.[0]
  if (guess) return guess
  return chainOf(line.payee.name) ? 'Groceries' : null
}

/** A payment with no kind yet. */
export const NOT_SORTED = 'Not sorted yet'

export interface KindGroup {
  kind: string
  total: number
  lines: MoneyLine[]
}

export interface PayeeGroup {
  payee: Payee
  /** In pence, money out or in as a positive amount. */
  total: number
  lines: MoneyLine[]
}

export interface Rise {
  payee: Payee
  now: number
  before: number
  lines: MoneyLine[]
}

export interface Ranked<T> {
  /** With MIN_COUNT payments or more, most first. */
  ranked: T[]
  /** The rest, by name: never ranked. */
  others: T[]
}

export interface MoneyMonth {
  month: string
  /** Money out and in, in pence, money moved left out. */
  out: number
  in: number
  outLines: MoneyLine[]
  inLines: MoneyLine[]
  /** The month before, up to the same day: only for the month you're in, when that month has lines. */
  before: { until: string; out: number; lines: MoneyLine[] } | null
  /** Payees with more out than in the month before (by the same day, for the month you're in). */
  rose: Ranked<Rise>
  payees: { out: Ranked<PayeeGroup>; in: Ranked<PayeeGroup> }
  /** Money out by what it was for (owner, 2026-10-26); payments with no kind last. */
  kinds: Ranked<KindGroup>
  /** Money moved between your own accounts, left out, by why. */
  moved: { why: Moving; lines: MoneyLine[] }[]
  toCheck: {
    /** Lines whose printed balance doesn't follow from the line before. */
    lines: MoneyLine[]
    /** Accounts used this month or last whose statements stop before the month's end (or today). */
    accounts: { account: string; until: string }[]
  }
}

/** A spending rise needs at least £1.00 (in pence) and spending before (owner, 2026-10-28: new payees and penny FX changes left out). */
export const MIN_RISE = 100

const byName = (a: { payee: Payee }, b: { payee: Payee }) => a.payee.name.localeCompare(b.payee.name, 'en', { sensitivity: 'base' })
const sumOut = (lines: readonly MoneyLine[]) => lines.reduce((s, l) => s - l.amount, 0)
const counted = (lines: readonly MoneyLine[], month: string) => lines.filter((l) => !l.moving && l.date.slice(0, 7) === month)

function groups(lines: readonly MoneyLine[], sign: 1 | -1): Ranked<PayeeGroup> {
  const all = groupBy(lines, (l) => l.payee.key).map((same): PayeeGroup => ({ payee: same[0]!.payee, total: sign * same.reduce((s, l) => s + l.amount, 0), lines: same }))
  return {
    ranked: all.filter((g) => g.lines.length >= MIN_COUNT).sort((a, b) => b.total - a.total),
    others: all.filter((g) => g.lines.length < MIN_COUNT).sort(byName),
  }
}

function kindGroups(lines: readonly MoneyLine[], chosen: Readonly<Record<string, string>>): Ranked<KindGroup> {
  const all = groupBy(lines, (l) => kindOf(l, chosen) ?? NOT_SORTED).map((same): KindGroup => ({ kind: kindOf(same[0]!, chosen) ?? NOT_SORTED, total: sumOut(same), lines: same }))
  const payments = (g: KindGroup) => g.lines.filter((l) => !l.refund).length
  const unsortedLast = (a: KindGroup, b: KindGroup) => Number(a.kind === NOT_SORTED) - Number(b.kind === NOT_SORTED) || a.kind.localeCompare(b.kind)
  return {
    ranked: all.filter((g) => g.kind !== NOT_SORTED && payments(g) >= MIN_COUNT).sort((a, b) => b.total - a.total),
    others: all.filter((g) => g.kind === NOT_SORTED || payments(g) < MIN_COUNT).sort(unsortedLast),
  }
}

/** Everything Money says about one month ("2026-10"), on `today`. */
export function moneyMonth(
  lines: readonly MoneyLine[],
  month: string,
  today: string,
  statements: readonly StatementRecord[],
  closed: ReadonlySet<string> = new Set(),
  kinds: Readonly<Record<string, string>> = {},
): MoneyMonth {
  const current = today.slice(0, 7) === month
  const lastMonth = shiftMonth(month, -1)
  const inMonth = counted(lines, month)
  const outLines = inMonth.filter((l) => l.amount < 0 || l.refund)
  const inLines = inMonth.filter((l) => l.amount > 0 && !l.refund)
  const earlier = counted(lines, lastMonth).filter((l) => l.amount < 0 || l.refund)
  const until = addMonths(today, -1)
  const beforeLines = current ? earlier.filter((l) => l.date <= until) : earlier

  const hadLastMonth = lines.some((l) => l.date.slice(0, 7) === lastMonth)
  const rises = hadLastMonth
    ? groupBy([...outLines, ...beforeLines], (l) => l.payee.key).flatMap((same): Rise[] => {
        const now = sumOut(same.filter((l) => l.date.slice(0, 7) === month))
        const before = sumOut(same.filter((l) => l.date.slice(0, 7) === lastMonth))
        return before > 0 && now - before >= MIN_RISE ? [{ payee: same[0]!.payee, now, before, lines: same }] : []
      })
    : []

  const moved = (['flex', 'pot', 'between', 'own'] as const).flatMap((why) => {
    const these = lines.filter((l) => l.moving === why && l.date.slice(0, 7) === month)
    return these.length ? [{ why, lines: these }] : []
  })

  const monthEnd = current ? today : addDays(addMonths(`${month}-01`, 1), -1)
  const used = new Set(lines.filter((l) => l.date.slice(0, 7) === month || l.date.slice(0, 7) === lastMonth).map((l) => l.account))
  const accounts = [...used]
    .filter((account) => !closed.has(account))
    .flatMap((account) => {
      const ends = statements.filter((s) => s.account === account).map((s) => s.to)
      const last = ends.sort().at(-1)
      return last && last < monthEnd ? [{ account, until: last }] : []
    })
    .sort((a, b) => a.account.localeCompare(b.account))

  return {
    month,
    out: sumOut(outLines),
    in: inLines.reduce((s, l) => s + l.amount, 0),
    outLines,
    inLines,
    before: current && hadLastMonth ? { until, out: sumOut(beforeLines), lines: beforeLines } : null,
    rose: {
      ranked: rises.filter((r) => r.lines.length >= MIN_COUNT).sort((a, b) => b.now - b.before - (a.now - a.before)),
      others: rises.filter((r) => r.lines.length < MIN_COUNT).sort(byName),
    },
    payees: { out: groups(outLines, -1), in: groups(inLines, 1) },
    kinds: kindGroups(outLines, kinds),
    moved,
    toCheck: { lines: lines.filter((l) => !l.adds && l.date.slice(0, 7) === month), accounts },
  }
}

/** The `count` months up to `last`, oldest first: money out and how many payments, money moved left out. */
export function moneyMonthTotals(lines: readonly MoneyLine[], last: string, count: number): { month: string; out: number; lines: number }[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(last, i - count + 1)).map((month) => {
    const out = counted(lines, month).filter((l) => l.amount < 0 || l.refund)
    return { month, out: sumOut(out), lines: out.filter((l) => l.amount < 0).length }
  })
}

export interface Regular {
  payee: Payee
  every: 'month' | 'week'
  /** The latest payment, in pence. */
  amount: number
  last: string
  /** When the latest payment differs from the one before. */
  changed: { from: number; to: number; date: string } | null
  lines: MoneyLine[]
}

/** Days between payments for each, and how many make it regular. */
const CADENCE = { week: { least: 4, from: 6, to: 8 }, month: { least: 3, from: 26, to: 35 } } as const

/** Payees paid every week or month, their latest payment in the month or the one before: the latest run of payments
 *  that far apart, 4 a week or 3 a month at least. A shop paid on many days isn't regular; money moved isn't either. */
export function regularPayments(lines: readonly MoneyLine[], month: string): Regular[] {
  // An older Money page describes what was regular at that time. Payments from later statements must not make its
  // latest run look too new and disappear (for example, viewing September after importing October).
  const out = lines.filter((l) => !l.moving && l.amount < 0 && l.date.slice(0, 7) <= month).sort((a, b) => a.date.localeCompare(b.date))
  const found: Regular[] = []
  for (const paid of groupBy(out, (l) => l.payee.key)) {
    for (const every of ['week', 'month'] as const) {
      const { least, from, to } = CADENCE[every]
      let start = paid.length - 1
      while (start > 0) {
        const gap = dayNumber(paid[start]!.date) - dayNumber(paid[start - 1]!.date)
        if (gap < from || gap > to) break
        start--
      }
      const run = paid.slice(start)
      const last = run.at(-1)!
      if (run.length < least || last.date.slice(0, 7) < shiftMonth(month, -1)) continue
      const before = run.at(-2)!
      found.push({
        payee: last.payee,
        every,
        amount: -last.amount,
        last: last.date,
        changed: before.amount !== last.amount ? { from: -before.amount, to: -last.amount, date: last.date } : null,
        lines: run,
      })
      break
    }
  }
  return found.sort(byName)
}

/** How many days a card payment can be from its receipt's date: it can post a day or two later. */
const RECEIPT_DAYS = 3

/** Whether a receipt's shop is a payment's payee: the same chain, or the same first word (3 letters or more). */
function samePlace(shop: string, payee: Payee): boolean {
  const key = shopKey(shop)
  if (!key) return false
  if (key === payee.key) return true
  const first = key.split(' ')[0]!
  return first.length >= 3 && payee.key.split(' ')[0] === first
}

/** Each card payment with the receipt for it, by the payment's id (v0.20.2): the same amount, within RECEIPT_DAYS, its
 *  shop the payee. Each payment and each receipt once, the nearest day first; a receipt paid another way (a gift card,
 *  cash) has none. The two are never added together: a payment opens its receipt. */
export function receiptPaymentCandidates(
  lines: readonly MoneyLine[],
  receipt: KnownReceipt,
  occupied: ReadonlySet<string> = new Set(),
): MoneyLine[] {
  if (receipt.currency && receipt.currency !== '£') return []
  const date = receipt.dated ? receipt.date : (receipt.entryDate ?? receipt.date)
  const days = (line: MoneyLine) => Math.abs(dayNumber(line.date) - dayNumber(date))
  return lines
    .filter((line) => !line.moving && line.amount < 0 && !occupied.has(line.id) && days(line) <= RECEIPT_DAYS && samePlace(receipt.shop, line.payee))
    .sort((a, b) => Number(-a.amount !== paid(receipt)) - Number(-b.amount !== paid(receipt)) || days(a) - days(b) || b.date.localeCompare(a.date))
}

/** Owner-chosen links take precedence; receipts without a printed date are never linked automatically. */
export function linkReceipts(
  lines: readonly MoneyLine[],
  receipts: readonly KnownReceipt[],
  chosen: Readonly<Record<string, string>> = {},
): Map<string, KnownReceipt> {
  const links = new Map<string, KnownReceipt>()
  const byLine = new Map(lines.map((line) => [line.id, line]))
  const chosenReceipts = new Set<string>()
  for (const receipt of receipts) {
    const line = byLine.get(chosen[receipt.id] ?? '')
    if (!line || line.amount >= 0 || line.moving || links.has(line.id)) continue
    links.set(line.id, receipt)
    chosenReceipts.add(receipt.id)
  }
  for (const receipt of [...receipts].filter((r) => r.dated && !chosenReceipts.has(r.id)).sort((a, b) => a.date.localeCompare(b.date))) {
    if (receipt.currency && receipt.currency !== '£') continue
    const payment = receiptPaymentCandidates(lines, receipt, new Set(links.keys())).find((line) => -line.amount === paid(receipt))
    if (payment) links.set(payment.id, receipt)
  }
  return links
}
