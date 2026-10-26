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
}

const COUNTRY = /\s+(?:GBR|GB|IRL|USA|US|FRA|DEU|ESP|ITA|NLD|BEL|PRT)$/i

/** "EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. …" is EXAMPLE SOFTWARE DUBLIN; "Example Gym (Faster Payments)
 *  Reference: …" is Example Gym; "TESCO SOMETOWN GBR" is Tesco. */
export function payeeOf(description: string): Payee {
  const name = description
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

/** How far apart (days) the two sides of a transfer between your accounts can be. */
const TRANSFER_DAYS = 3

/** Each line with its payee (by the name you gave it, if any), and whether it's money moved (in the order given). */
export function classify(lines: readonly BankLine[], own: ReadonlySet<string>, named: Readonly<Record<string, string>> = {}): MoneyLine[] {
  const classed = lines.map((line): MoneyLine => {
    const printed = payeeOf(line.description)
    const payee = named[printed.key] ? { ...printed, name: named[printed.key]! } : printed
    return { ...line, payee, moving: movingOf(line, payee, own) }
  })
  const apart = (a: MoneyLine, b: MoneyLine) => Math.abs(dayNumber(a.date) - dayNumber(b.date))
  for (const out of classed.filter((l) => !l.moving && l.amount < 0)) {
    const into = classed
      .filter((l) => !l.moving && l.amount === -out.amount && l.account !== out.account && apart(l, out) <= TRANSFER_DAYS)
      .sort((a, b) => apart(a, out) - apart(b, out))[0]
    if (into) out.moving = into.moving = 'between'
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
  /** Money moved between your own accounts, left out, by why. */
  moved: { why: Moving; lines: MoneyLine[] }[]
  toCheck: {
    /** Lines whose printed balance doesn't follow from the line before. */
    lines: MoneyLine[]
    /** Accounts used this month or last whose statements stop before the month's end (or today). */
    accounts: { account: string; until: string }[]
  }
}

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

/** Everything Money says about one month ("2026-10"), on `today`. */
export function moneyMonth(lines: readonly MoneyLine[], month: string, today: string, statements: readonly StatementRecord[]): MoneyMonth {
  const current = today.slice(0, 7) === month
  const lastMonth = shiftMonth(month, -1)
  const inMonth = counted(lines, month)
  const outLines = inMonth.filter((l) => l.amount < 0)
  const inLines = inMonth.filter((l) => l.amount > 0)
  const earlier = counted(lines, lastMonth).filter((l) => l.amount < 0)
  const until = addMonths(today, -1)
  const beforeLines = current ? earlier.filter((l) => l.date <= until) : earlier

  const hadLastMonth = lines.some((l) => l.date.slice(0, 7) === lastMonth)
  const rises = hadLastMonth
    ? groupBy([...outLines, ...beforeLines], (l) => l.payee.key).flatMap((same): Rise[] => {
        const now = sumOut(same.filter((l) => l.date.slice(0, 7) === month))
        const before = sumOut(same.filter((l) => l.date.slice(0, 7) === lastMonth))
        return now > before ? [{ payee: same[0]!.payee, now, before, lines: same }] : []
      })
    : []

  const moved = (['flex', 'pot', 'between', 'own'] as const).flatMap((why) => {
    const these = lines.filter((l) => l.moving === why && l.date.slice(0, 7) === month)
    return these.length ? [{ why, lines: these }] : []
  })

  const monthEnd = current ? today : addDays(addMonths(`${month}-01`, 1), -1)
  const used = new Set(lines.filter((l) => l.date.slice(0, 7) === month || l.date.slice(0, 7) === lastMonth).map((l) => l.account))
  const accounts = [...used]
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
    moved,
    toCheck: { lines: lines.filter((l) => !l.adds && l.date.slice(0, 7) === month), accounts },
  }
}

/** The `count` months up to `last`, oldest first: money out and how many payments, money moved left out. */
export function moneyMonthTotals(lines: readonly MoneyLine[], last: string, count: number): { month: string; out: number; lines: number }[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(last, i - count + 1)).map((month) => {
    const out = counted(lines, month).filter((l) => l.amount < 0)
    return { month, out: sumOut(out), lines: out.length }
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
  const out = lines.filter((l) => !l.moving && l.amount < 0).sort((a, b) => a.date.localeCompare(b.date))
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
      if (run.length < least || last.date.slice(0, 7) > month || last.date.slice(0, 7) < shiftMonth(month, -1)) continue
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
export function linkReceipts(lines: readonly MoneyLine[], receipts: readonly KnownReceipt[]): Map<string, KnownReceipt> {
  const links = new Map<string, KnownReceipt>()
  for (const receipt of [...receipts].sort((a, b) => a.date.localeCompare(b.date))) {
    if (receipt.currency && receipt.currency !== '£') continue
    const amount = paid(receipt)
    const days = (l: MoneyLine) => Math.abs(dayNumber(l.date) - dayNumber(receipt.date))
    const payment = lines
      .filter((l) => !l.moving && !links.has(l.id) && -l.amount === amount && days(l) <= RECEIPT_DAYS && samePlace(receipt.shop, l.payee))
      .sort((a, b) => days(a) - days(b))[0]
    if (payment) links.set(payment.id, receipt)
  }
  return links
}
