// Money (v0.20, step 2 of the owner's plan): what came in and went out of your accounts, from the statements brought in
// (src/domain/statements.ts), worked out on the phone. Money moved between your own accounts is left out, so nothing
// counts twice: Monzo Flex (a purchase is given back by a "Flex" line and paid off later: the purchase is the spending),
// pots, the two sides of a transfer between two accounts brought in, and payees you mark as your own. Counts and amounts
// only: nothing averaged, rated or set as a limit (DECISIONS, "Never"); groups are ranked only with MIN_COUNT payments.
import { MIN_COUNT } from '../analysis/stats'
import type { BankLine, StatementRecord } from '../db/types'
import { addDays, addMonths, dayNumber } from '../lib/dates'
import { chainOf } from './receipts'
import { balanceFollows, preferOwed } from './statements'
import { groupBy, type KnownReceipt, paid, shiftMonth, shopKey } from './shopping'

/** Who a line was paid to or from, as one name (a UK chain's names as the chain). */
export interface Payee {
  key: string
  name: string
  /** Original printed name before any owner renaming. */
  original?: string
}

/** Why a line is money moved, not money in or out. */
export type Moving = 'flex' | 'pot' | 'between' | 'own'

export interface MoneyLine extends BankLine {
  payee: Payee
  moving: Moving | null
  /** Money back from where it was spent: it lowers that spending, never counts as money in (owner, 2026-10-26). */
  refund: boolean
  /** A name you gave this payment alone (v0.20.35). It's still to its payee, so groups, runs and refunds don't move. */
  label?: string
  /** Who or what it was for (v0.20.38, `withFor`); none is nobody in particular. */
  forWho?: string
}

/** The rest of the money out, under "Who it was for". */
export const NOBODY = 'Nobody in particular'

/** Lines with who they were for laid on: a payment's own name over its payee's, "" meaning nobody over a payee that has
 *  one (`PAYEE_FOR`, `PAYMENT_FOR` in src/db/statements.ts). A payment is still to its payee, so nothing else moves. */
export function withFor(lines: readonly MoneyLine[], payeeFor: Readonly<Record<string, string>>, paymentFor: Readonly<Record<string, string>>): MoneyLine[] {
  return lines.map((line) => {
    const who = line.id in paymentFor ? paymentFor[line.id]! : (payeeFor[line.payee.key] ?? '')
    return who ? { ...line, forWho: who } : line
  })
}

/** The names to choose from: those in use, each once whatever its capitals, by name. */
export function forNamesOf(...filed: Readonly<Record<string, string>>[]): string[] {
  const seen = new Map<string, string>()
  for (const who of filed.flatMap((names) => Object.values(names))) if (who.trim() && !seen.has(who.toLowerCase())) seen.set(who.toLowerCase(), who.trim())
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
}

/** The people you've named in your entries who aren't a name yet, the most often first (ties as they came), at most `max`. */
export function suggestedPeople(people: readonly string[], taken: readonly string[], max = 6): string[] {
  const have = new Set(taken.map((t) => t.toLowerCase()))
  const counts = new Map<string, { name: string; n: number }>()
  for (const person of people) {
    const name = person.trim()
    if (!name || have.has(name.toLowerCase())) continue
    const seen = counts.get(name.toLowerCase())
    if (seen) seen.n += 1
    else counts.set(name.toLowerCase(), { name, n: 1 })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, max).map((c) => c.name)
}

/** The names of single payments, by the line's id: a note written before v0.20.36 ("What was it for?") is the name of its
 *  payment unless that was named since. Nothing is rewritten, so an older backup reads the same way. */
export const labelsOf = (notes: Readonly<Record<string, string>>, names: Readonly<Record<string, string>>): Record<string, string> => ({ ...notes, ...names })

/** What a payment is called: your name for it alone, else its payee's. */
export const nameOf = (line: Pick<MoneyLine, 'payee' | 'label'>): string => line.label ?? line.payee.name

/** A line that says it's money back: Monzo's note on a petrol hold given back, a refund or an adjustment. */
const REFUND_NOTE = /\s*This relates to a previous transaction\.?/i
const REFUND = /^(?:refund|adjustment) for\b/i

const COUNTRY = /\s+(?:GBR|GB|IRL|USA|US|FRA|DEU|ESP|ITA|NLD|BEL|PRT)$/i

/** Words that stay as capitals in a shouted name (restyle T5: "TFL TRAVEL" is "TFL Travel", not "Tfl Travel"). */
const ACRONYMS = new Set(['TFL', 'NHS', 'HMRC', 'BBC', 'DVLA', 'ATM', 'VAT', 'UK', 'USA', 'PDF', 'DD'])
/** Small words that stay lower case inside a title-cased name. */
const SMALL_WORDS = new Set(['and', 'of', 'the', 'to', 'at', 'on', 'in', 'for'])

/** A bank prints names in capitals ("EXAMPLE SOFTWARE DUBLIN"); they are shown in title case ("Example Software Dublin"),
 *  at display time: what is stored, and every key, is as printed. A name that already has lower case is left alone
 *  (CSS `capitalize` can't lowercase the rest, so it is done here). A word with a digit, a known acronym and a single
 *  letter stay as printed. */
export function titleCaseShouted(name: string): string {
  if (!name || /[a-z]/.test(name)) return name
  let word = 0
  return name
    .split(/([\s*/&-]+)/)
    .map((token) => {
      if (!token || /^[\s*/&-]+$/.test(token)) return token
      const first = word++ === 0
      if (/\d/.test(token) || ACRONYMS.has(token) || token.length === 1) return token
      const lower = token.toLowerCase()
      return !first && SMALL_WORDS.has(lower) ? lower : lower[0]!.toUpperCase() + lower.slice(1)
    })
    .join('')
}

/** "EXAMPLE SOFTWARE DUBLIN IRL Amount: USD -5.00. …" is Example Software Dublin; "Example Gym (Faster Payments)
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
  return chain ? { key: chain.key, name: chain.name } : { key: name.toLowerCase(), name: titleCaseShouted(name) }
}

function movingOf(line: BankLine, payee: Payee, own: ReadonlySet<string>): Moving | null {
  const words = line.description.trim().toLowerCase()
  if (line.account.startsWith('Monzo') && words === 'flex') return 'flex'
  // The Flex statement itself: a purchase moved to Flex is on the current account already, and paying Flex is the
  // other side of the current account's "Flex" line. What Flex paid itself, and its refunds, count. Known by these
  // words, which only a Flex statement has, and not by the account's name: a statement whose title wasn't read came in
  // as "Account", and each of its purchases counted twice (v0.20.29).
  if (/\bmoved to flex$/.test(words) || /^you paid (?:early|extra)\b/.test(words)) return 'flex'
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
  const wanted = (account: string) => given(account) ?? titleCaseShouted(short(account))
  const uses = new Map<string, number>()
  for (const account of accounts) uses.set(wanted(account), (uses.get(wanted(account)) ?? 0) + 1)
  return new Map(accounts.map((account) => [account, uses.get(wanted(account))! > 1 && !given(account) ? titleCaseShouted(account) : wanted(account)]))
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
export function classify(lines: readonly BankLine[], own: ReadonlySet<string>, named: Readonly<Record<string, string>> = {}, labels: Readonly<Record<string, string>> = {}): MoneyLine[] {
  const classed = lines.map((line): MoneyLine => {
    const printed = payeeOf(line.description)
    const isRenamed = Boolean(named[printed.key] && named[printed.key] !== printed.name)
    const payee: Payee = isRenamed ? { ...printed, name: named[printed.key]!, original: printed.name } : printed
    return { ...line, payee, moving: movingOf(line, payee, own), refund: false, ...(labels[line.id] ? { label: labels[line.id]! } : {}) }
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
 *  supermarket ("ASDA PETROL"), Eating out before Transport ("UBER EATS" is a meal, "UBER *TRIP" a ride). */
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
  ['Eating out', /pizza|mcdonald|starbucks|costa|greggs|nando|kfc|subway|tim hortons|domino|deliveroo|just eat|uber[ *]*eats/i],
  ['Transport', /trainline|national express|flixbus|\bflix\b|transport for london|\btfl\b|\buber\b|stagecoach|arriva|\bbus\b|\brail/i],
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

/** Money out for one name (v0.20.38). */
export interface ForGroup {
  who: string
  total: number
  lines: MoneyLine[]
}

/** Money out by who it was for: names with 3+ payments ranked by amount, the rest by name, and what no name was given
 *  to apart, last. */
export interface ForGroups extends Ranked<ForGroup> {
  nobody: ForGroup | null
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
  /** Money out by who it was for (v0.20.38); null until something is filed. */
  forWho: ForGroups | null
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
/** The lines counted in a period, a month ("2026-10") or a year ("2026"): money moved is left out. */
const counted = (lines: readonly MoneyLine[], period: string) => lines.filter((l) => !l.moving && l.date.startsWith(period))

function groups(lines: readonly MoneyLine[], sign: 1 | -1): Ranked<PayeeGroup> {
  const all = groupBy(lines, (l) => l.payee.key).map((same): PayeeGroup => ({ payee: same[0]!.payee, total: sign * same.reduce((s, l) => s + l.amount, 0), lines: same }))
  return {
    ranked: all.filter((g) => g.lines.length >= MIN_COUNT).sort((a, b) => b.total - a.total),
    others: all.filter((g) => g.lines.length < MIN_COUNT).sort(byName),
  }
}

/** Who it was for, from money out; null until something is filed under a name (the block isn't there before). */
function forGroups(lines: readonly MoneyLine[]): ForGroups | null {
  if (!lines.some((l) => l.forWho)) return null
  const payments = (g: ForGroup) => g.lines.filter((l) => !l.refund).length
  const all = groupBy(lines.filter((l) => l.forWho), (l) => l.forWho!).map((same): ForGroup => ({ who: same[0]!.forWho!, total: sumOut(same), lines: same }))
  const rest = lines.filter((l) => !l.forWho)
  return {
    ranked: all.filter((g) => payments(g) >= MIN_COUNT).sort((a, b) => b.total - a.total),
    others: all.filter((g) => payments(g) < MIN_COUNT).sort((a, b) => a.who.localeCompare(b.who, 'en', { sensitivity: 'base' })),
    nobody: rest.length ? { who: NOBODY, total: sumOut(rest), lines: rest } : null,
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
    forWho: forGroups(outLines),
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

/** A regular payment as it was paid in a year: what was paid, not what's expected. */
export interface RegularPaid {
  payee: Payee
  every: 'month' | 'week'
  /** Paid in the year, in pence. */
  total: number
  lines: MoneyLine[]
}

export interface MoneyYear {
  year: string
  /** Money out and in, in pence, money moved left out. */
  out: number
  in: number
  outLines: MoneyLine[]
  inLines: MoneyLine[]
  /** The first and last month (YYYY-MM) with money in or out: a year is only as long as the statements brought in. */
  months: { first: string; last: string } | null
  payees: { out: Ranked<PayeeGroup> }
  kinds: Ranked<KindGroup>
  /** Money out by who it was for; null until something is filed. */
  forWho: ForGroups | null
  /** Payees paid regularly at some point, even if since stopped, with what was paid in the year; most first. */
  regular: RegularPaid[]
  /** Days with no statement inside the year (up to today), by account: left out of every figure. */
  gaps: { account: string; from: string; to: string }[]
}

/** Everything Money says about one year ("2026"), on `today` (v0.20.27). */
export function moneyYear(
  lines: readonly MoneyLine[],
  year: string,
  today: string,
  statements: readonly StatementRecord[],
  closed: ReadonlySet<string> = new Set(),
  kinds: Readonly<Record<string, string>> = {},
): MoneyYear {
  const inYear = counted(lines, year)
  const outLines = inYear.filter((l) => l.amount < 0 || l.refund)
  const inLines = inYear.filter((l) => l.amount > 0 && !l.refund)
  const months = [...new Set(inYear.map((l) => l.date.slice(0, 7)))].sort()

  const regular = regularRuns(lines, `${year}-12`)
    .flatMap(({ every, run }): RegularPaid[] => {
      const paidIn = run.filter((l) => l.date.startsWith(year))
      return paidIn.length ? [{ payee: run[0]!.payee, every, total: sumOut(paidIn), lines: paidIn }] : []
    })
    .sort((a, b) => b.total - a.total || byName(a, b))

  const first = `${year}-01-01`
  const last = [`${year}-12-31`, today].sort()[0]!
  const gaps = [...new Set(statements.map((s) => s.account))].sort().flatMap((account) =>
    notBroughtIn(statements.filter((s) => s.account === account), today, closed.has(account)).flatMap((gap) => {
      const clipped = { account, from: gap.from < first ? first : gap.from, to: gap.to > last ? last : gap.to }
      return clipped.from <= clipped.to ? [clipped] : []
    }),
  )

  return {
    year,
    out: sumOut(outLines),
    in: inLines.reduce((s, l) => s + l.amount, 0),
    outLines,
    inLines,
    months: months.length ? { first: months[0]!, last: months.at(-1)! } : null,
    payees: { out: groups(outLines, -1) },
    kinds: kindGroups(outLines, kinds),
    forWho: forGroups(outLines),
    regular,
    gaps,
  }
}

/** An account's lines on one day. Their order isn't kept (ids are random and a statement's lines share a time), so
 *  where one ends is told by the balances. */
interface Day {
  date: string
  lines: BankLine[]
}

/** Whether `next` is the line after `earlier`, by the printed balances (both must be known). */
const nextAfter = (earlier: BankLine, next: BankLine, owed: boolean) => earlier.balance !== null && next.balance !== null && balanceFollows(earlier.balance, next, owed)

/** The balance before a line, from the balance printed beside it (the other way round from `balanceFollows`). */
const balanceBefore = (line: BankLine & { balance: number }, owed: boolean) => (owed ? line.balance + line.amount : line.balance - line.amount)

/** The balance after a day's last line. A day ends where the day before ended plus its amounts, whatever order its lines
 *  come in (v0.20.31: +£350.00 then -£350.00 ends where it began, which chaining can't tell), when one of its printed
 *  balances says so. With no day before, or when it doesn't fit (a statement missing), it is found by chaining: the line
 *  no other follows. Null when any balance is missing or the chain doesn't end in one line. */
function dayEnd(day: readonly BankLine[], owed: boolean, before: number | null = null): number | null {
  if (day.some((l) => l.balance === null)) return null
  if (before !== null) {
    const end = before + (owed ? -1 : 1) * day.reduce((sum, l) => sum + l.amount, 0)
    if (day.some((l) => l.balance === end)) return end
  }
  const ends = day.filter((x) => !day.some((y) => y !== x && nextAfter(x, y, owed)))
  return ends.length === 1 ? ends[0]!.balance : null
}

/** The balance after each day's last line, each from the one before. */
function dayEnds(days: readonly Day[], owed: boolean): (number | null)[] {
  const ends: (number | null)[] = []
  days.forEach((day, i) => ends.push(dayEnd(day.lines, owed, i > 0 ? ends[i - 1]! : null)))
  return ends
}

/** The balance before a day's first line: the line that follows no other. */
function dayStart(day: readonly BankLine[], owed: boolean): number | null {
  if (day.some((l) => l.balance === null)) return null
  const starts = day.filter((x) => !day.some((y) => y !== x && nextAfter(y, x, owed)))
  return starts.length === 1 ? balanceBefore(starts[0] as BankLine & { balance: number }, owed) : null
}

/** How many balances follow from the one before if they are held (`owed` false) or owed: within a day by chaining, and
 *  from one day's end to the next's by adding the day's amounts, which doesn't depend on their order. */
function followingBalances(days: readonly Day[], owed: boolean): number {
  const ends = dayEnds(days, owed)
  let count = 0
  days.forEach((day, i) => {
    count += day.lines.filter((x) => day.lines.some((y) => y !== x && nextAfter(y, x, owed))).length
    const before = i > 0 ? ends[i - 1]! : null
    const end = ends[i]!
    if (before !== null && end !== null && end === before + (owed ? -1 : 1) * day.lines.reduce((sum, l) => sum + l.amount, 0)) count++
  })
  return count
}

export interface BalanceMonth {
  month: string
  /** In pence, across the accounts that hold money (current accounts, pots): null if none, or if one isn't known. */
  held: number | null
  /** In pence, across the cards and Flex, which owe: kept apart from `held`, never netted. Null likewise. */
  owed: number | null
  /** The accounts whose balance isn't known at this month's end: no statement for the days up to it, or the order of
   *  the last day's lines can't be told. */
  unknown: { account: string; owed: boolean; why: 'statement' | 'order' }[]
}

/** What you hold and what you owe at the end of each month of a year, up to today (v0.20.28). A month's end is known for an
 *  account only when its statements cover every day from its last line to that end; a balance that cannot be told is
 *  said, never guessed. A closed account counts up to its last statement. */
export function monthEndBalances(
  lines: readonly BankLine[],
  statements: readonly StatementRecord[],
  closed: ReadonlySet<string>,
  year: string,
  today: string,
): { accounts: { account: string; owed: boolean }[]; months: BalanceMonth[] } {
  const ledgers = [...new Set(statements.map((s) => s.account))].sort().flatMap((account) => {
    const mine = lines.filter((l) => l.account === account)
    if (!mine.length) return []
    const days: Day[] = groupBy(
      [...mine].sort((a, b) => a.date.localeCompare(b.date)),
      (l) => l.date,
    ).map((same) => ({ date: same[0]!.date, lines: same }))
    const owed = preferOwed(followingBalances(days, false), followingBalances(days, true))
    const its = statements.filter((s) => s.account === account)
    return [{ account, owed, days, ends: dayEnds(days, owed), statements: its, firstFrom: its.map((s) => s.from).sort()[0]!, lastTo: its.map((s) => s.to).sort().at(-1)! }]
  })

  const balanceAt = (ledger: (typeof ledgers)[number], end: string): { balance: number } | { why: 'statement' | 'order' } => {
    let last = -1
    ledger.days.forEach((d, i) => {
      if (d.date <= end) last = i
    })
    const balance = last >= 0 ? ledger.ends[last]! : dayStart(ledger.days[0]!.lines, ledger.owed)
    const from = last >= 0 ? ledger.days[last]!.date : ledger.firstFrom
    if (notBroughtIn(ledger.statements, end).some((gap) => gap.from <= end && gap.to >= from)) return { why: 'statement' }
    return balance === null ? { why: 'order' } : { balance }
  }

  const thisMonth = today.slice(0, 7)
  const months: BalanceMonth[] = []
  for (let n = 1; n <= 12; n++) {
    const month = `${year}-${String(n).padStart(2, '0')}`
    if (month > thisMonth) break
    const end = month === thisMonth ? today : addDays(addMonths(`${month}-01`, 1), -1)
    const here = ledgers.filter((l) => end >= l.firstFrom && !(closed.has(l.account) && end > l.lastTo))
    if (!here.length && !months.length) continue
    const found = here.map((ledger) => ({ ledger, at: balanceAt(ledger, end) }))
    const total = (owed: boolean) => {
      const these = found.filter((f) => f.ledger.owed === owed)
      return these.length && these.every((f) => 'balance' in f.at) ? these.reduce((sum, f) => sum + (f.at as { balance: number }).balance, 0) : null
    }
    months.push({
      month,
      held: total(false),
      owed: total(true),
      unknown: found.flatMap((f) => ('why' in f.at ? [{ account: f.ledger.account, owed: f.ledger.owed, why: f.at.why }] : [])),
    })
  }
  return { accounts: ledgers.map((l) => ({ account: l.account, owed: l.owed })), months }
}

/** Whether a month has every statement in (v0.20.32): the chart's average counted a month not begun as £0, and one with a
 *  single account's statements as all its spending. */
export interface MonthCoverage {
  month: string
  /** The month is over, some account's statements had begun by its end, and none of them is missing days of it. */
  complete: boolean
  /** The accounts, as the statements name them, with days of the month not brought in. */
  missing: string[]
}

/** For each month, whether every account in use has statements for all its days. An account is in use from its first
 *  statement, and a closed one isn't asked for the days after its last; the month you are in is never complete, nor is
 *  one before any statement began (nothing is known of it, which isn't the same as nothing spent). */
export function monthCoverage(statements: readonly StatementRecord[], closed: ReadonlySet<string>, months: readonly string[], today: string): MonthCoverage[] {
  const accounts = [...new Set(statements.map((s) => s.account))].sort().map((account) => {
    const its = statements.filter((s) => s.account === account)
    return { account, firstFrom: its.map((s) => s.from).sort()[0]!, gaps: notBroughtIn(its, today, closed.has(account)) }
  })
  return months.map((month) => {
    const start = `${month}-01`
    const end = addDays(addMonths(start, 1), -1)
    const begun = accounts.filter((a) => a.firstFrom <= end)
    const missing = begun.filter((a) => a.gaps.some((gap) => gap.from <= end && gap.to >= start)).map((a) => a.account)
    return { month, complete: end < today && begun.length > 0 && missing.length === 0, missing }
  })
}

/** The average of the months that are complete, in pence, and how many that is; null from fewer than 2 (an average of one
 *  month is that month). Months that aren't complete are left out, never counted as nothing. */
export function averageOfComplete(totals: readonly { month: string; out: number }[], coverage: readonly MonthCoverage[]): { value: number; months: number } | null {
  const done = new Set(coverage.filter((c) => c.complete).map((c) => c.month))
  const these = totals.filter((t) => done.has(t.month))
  return these.length >= 2 ? { value: Math.round(these.reduce((sum, t) => sum + t.out, 0) / these.length), months: these.length } : null
}

/** A search needs at least this many characters: one letter matches nearly everything. */
export const MIN_SEARCH = 2

/** Every line (money moved too, as it's on a statement) that a search finds, newest first (v0.20.33): the payee as you
 *  named it or as printed, your name for that payment alone, who it was for, the statement's own words, or its amount,
 *  as far as you've typed it
 *  ("24.9" finds £24.99). */
export function searchPayments(lines: readonly MoneyLine[], query: string): MoneyLine[] {
  const wanted = query.trim().toLowerCase().replace(/^£/, '')
  if (wanted.length < MIN_SEARCH) return []
  const amountLike = /^\d+(\.\d{0,2})?$/.test(wanted)
  return lines
    .filter((l) => {
      const words = [l.label ?? '', l.forWho ?? '', l.payee.name, l.payee.original ?? '', l.description].join(' ').toLowerCase()
      return words.includes(wanted) || (amountLike && (Math.abs(l.amount) / 100).toFixed(2).startsWith(wanted))
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** What a search found in one year: payments out and what they come to (a refund taking off), what came in, and the money
 *  moved, which is in neither and kept apart: a purchase on Monzo Flex is on the bank's statement and again on Flex's, and
 *  two rows of one amount in one list read as a double charge (owner, 2026-11-01). */
export interface PaymentYear {
  year: string
  payments: number
  /** In pence; negative when only money came back. */
  out: number
  in: number
  /** Payments, refunds and money in. */
  lines: MoneyLine[]
  /** Money moved between your accounts, left out of the figures above. */
  moves: MoneyLine[]
}

/** What a search found, by year, newest first. */
export function paymentYears(found: readonly MoneyLine[]): PaymentYear[] {
  return groupBy(found, (l) => l.date.slice(0, 4))
    .map((all): PaymentYear => {
      const lines = all.filter((l) => !l.moving)
      const out = lines.filter((l) => l.amount < 0 || l.refund)
      return {
        year: all[0]!.date.slice(0, 4),
        payments: out.filter((l) => l.amount < 0).length,
        out: sumOut(out),
        in: lines.filter((l) => l.amount > 0 && !l.refund).reduce((sum, l) => sum + l.amount, 0),
        lines,
        moves: all.filter((l) => l.moving),
      }
    })
    .sort((a, b) => b.year.localeCompare(a.year))
}

export interface Regular {
  payee: Payee
  every: 'month' | 'week'
  /** The latest payment, in pence. */
  amount: number
  /** What it comes to in a year, in pence: the latest payment times PER_YEAR (multiplied, never averaged). */
  year: number
  last: string
  /** When it is due next, as a date: the first on or after today (v0.20.25). It is a pattern, not a promise: say "around". */
  next: string
  /** When the latest payment differs from the one before; `year` is the difference over a year, in pence (a fall is negative). */
  changed: { from: number; to: number; date: string; year: number } | null
  lines: MoneyLine[]
}

/** How many times a regular payment is paid in a year. */
const PER_YEAR = { month: 12, week: 52 } as const

/** The `k`th payment after the latest, counted from the latest each time: a short month doesn't pull later ones earlier
 *  (31 Jan + 2 months is 31 Mar, not 28 Mar). */
const dueAfter = (r: Pick<Regular, 'every' | 'last'>, k: number) => (r.every === 'month' ? addMonths(r.last, k) : addDays(r.last, 7 * k))

/** The first payment due on or after `today`: a cycle at a time from the latest. */
function nextDue(r: Pick<Regular, 'every' | 'last'>, today: string): string {
  let k = 1
  while (dueAfter(r, k) < today) k++
  return dueAfter(r, k)
}

/** Days between payments for each, and how many make it regular. */
const CADENCE = { week: { least: 4, from: 6, to: 8 }, month: { least: 3, from: 26, to: 35 } } as const

/** A payee's latest run of payments that far apart, however long ago it ended. */
interface Run {
  every: 'month' | 'week'
  /** The run: its last payment is the payee's last. */
  run: MoneyLine[]
  /** Every payment to the payee up to the month, oldest first. */
  history: MoneyLine[]
}

/** Payees whose latest payments are 4 a week or 3 a month at least that far apart. A shop paid on many days isn't
 *  regular; money moved isn't either. An older Money page describes what was regular at that time: payments from later
 *  statements must not make its latest run look too new and disappear (for example, viewing September after
 *  importing October). */
function regularRuns(lines: readonly MoneyLine[], month: string): Run[] {
  const out = lines.filter((l) => !l.moving && l.amount < 0 && l.date.slice(0, 7) <= month).sort((a, b) => a.date.localeCompare(b.date))
  const found: Run[] = []
  for (const history of groupBy(out, (l) => l.payee.key)) {
    for (const every of ['week', 'month'] as const) {
      const { least, from, to } = CADENCE[every]
      let start = history.length - 1
      while (start > 0) {
        const gap = dayNumber(history[start]!.date) - dayNumber(history[start - 1]!.date)
        if (gap < from || gap > to) break
        start--
      }
      const run = history.slice(start)
      if (run.length < least) continue
      found.push({ every, run, history })
      break
    }
  }
  return found
}

/** Payees paid every week or month, their latest payment in the month or the one before. */
export function regularPayments(lines: readonly MoneyLine[], month: string, today: string): Regular[] {
  const recent = shiftMonth(month, -1)
  return regularRuns(lines, month)
    .filter(({ run }) => run.at(-1)!.date.slice(0, 7) >= recent)
    .map(({ every, run }): Regular => {
      const last = run.at(-1)!
      const before = run.at(-2)!
      return {
        payee: last.payee,
        every,
        amount: -last.amount,
        year: -last.amount * PER_YEAR[every],
        last: last.date,
        next: nextDue({ every, last: last.date }, today),
        changed: before.amount !== last.amount ? { from: -before.amount, to: -last.amount, date: last.date, year: (before.amount - last.amount) * PER_YEAR[every] } : null,
        lines: run,
      }
    })
    .sort((a, b) => b.amount - a.amount || byName(a, b))
}

/** A regular payment that started or stopped (v0.20.26). */
export interface RegularChange {
  payee: Payee
  every: 'month' | 'week'
  /** The latest payment, in pence. */
  amount: number
  /** The first payment of the run, and the last. */
  first: string
  last: string
  lines: MoneyLine[]
}

/** How many days past the longest gap a regular payment can be late before it counts as stopped. */
const GRACE = { week: 3, month: 7 } as const

/** Regular payments that started or stopped, for the month you're on (v0.20.26). Neither is said when statements could
 *  hide the truth: a payment is "stopped" only when its account's statements cover the days it should have been paid on
 *  (a missing statement is never a cancelled bill) and the account isn't closed; it is "started" only when the
 *  account's statements begin at least a cycle before its first payment (otherwise it is only the oldest we have).
 *  - Stopped: no payment for the longest gap and a few days over, told for the 3 months from then.
 *  - Started: the payee's first payments ever, told in the month its run became regular (3rd payment, or 4th a week). */
export function regularChanges(
  lines: readonly MoneyLine[],
  month: string,
  today: string,
  statements: readonly StatementRecord[],
  closed: ReadonlySet<string>,
): { started: RegularChange[]; lapsed: RegularChange[] } {
  const asOf = month === today.slice(0, 7) ? today : addDays(addMonths(`${month}-01`, 1), -1)
  const news = `${shiftMonth(month, -2)}-01`
  const covered = (account: string, from: string, to: string) => {
    const its = statements.filter((s) => s.account === account)
    return its.length > 0 && !notBroughtIn(its, to).some((gap) => gap.from <= to && gap.to >= from)
  }
  const started: RegularChange[] = []
  const lapsed: RegularChange[] = []
  for (const { every, run, history } of regularRuns(lines, month)) {
    const { least, to } = CADENCE[every]
    const first = run[0]!
    const last = run.at(-1)!
    const change: RegularChange = { payee: last.payee, every, amount: -last.amount, first: first.date, last: last.date, lines: run }

    const noticedBy = addDays(last.date, to + GRACE[every])
    if (!closed.has(last.account) && noticedBy < asOf && noticedBy >= news && covered(last.account, addDays(last.date, 1), noticedBy)) lapsed.push(change)

    if (run.length === history.length && run[least - 1]!.date.slice(0, 7) === month) {
      const begins = statements.filter((s) => s.account === first.account).map((s) => s.from).sort()[0]
      if (begins !== undefined && begins <= (every === 'month' ? addMonths(first.date, -1) : addDays(first.date, -7))) started.push(change)
    }
  }
  const order = (a: RegularChange, b: RegularChange) => b.amount - a.amount || byName(a, b)
  return { started: started.sort(order), lapsed: lapsed.sort(order) }
}

export interface RegularTotals {
  /** What the monthly ones come to in a month, in pence. */
  monthly: number
  /** What the weekly ones come to in a week, in pence. */
  weekly: number
  /** All of them in a year, in pence: monthly ones 12 times, weekly ones 52. Monthly and weekly amounts are never
   *  added as one figure (a week isn't a month). */
  year: number
  count: number
}

/** The total of regular payments, by cadence and as a year. */
export function regularPaymentsTotal(regular: readonly Regular[]): RegularTotals {
  const monthly = regular.filter((r) => r.every === 'month').reduce((s, r) => s + r.amount, 0)
  const weekly = regular.filter((r) => r.every === 'week').reduce((s, r) => s + r.amount, 0)
  return { monthly, weekly, year: regular.reduce((s, r) => s + r.year, 0), count: regular.length }
}

/** A month's money out split in two (v0.20.25): what went to payees that are paid regularly, a refund from one counted
 *  against it, and everything else. Committed changes with one decision (cancelling, switching); everyday with habits. */
export function committedOf(outLines: readonly MoneyLine[], regular: readonly { payee: Payee }[]): { committed: number; everyday: number } {
  const keys = new Set(regular.map((r) => r.payee.key))
  const committed = sumOut(outLines.filter((l) => keys.has(l.payee.key)))
  return { committed, everyday: sumOut(outLines) - committed }
}

/** One regular payment expected on a day. */
export interface Upcoming {
  payee: Payee
  date: string
  /** In pence: the latest payment's amount. */
  amount: number
}

/** The regular payments due from `today` for `days` days, the last day included: a weekly one each week, a monthly one
 *  once. Soonest first, then by name. */
export function upcoming(regular: readonly Regular[], today: string, days: number): Upcoming[] {
  const until = addDays(today, days)
  const due: Upcoming[] = []
  for (const r of regular) {
    for (let k = 1; dueAfter(r, k) <= until; k++) {
      const date = dueAfter(r, k)
      if (date >= today) due.push({ payee: r.payee, date, amount: r.amount })
    }
  }
  return due.sort((a, b) => a.date.localeCompare(b.date) || a.payee.name.localeCompare(b.payee.name, 'en', { sensitivity: 'base' }))
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

/** The account a receipt's card is (v0.24.0): yours to say once for each card (`CARD_ACCOUNTS`, src/db/statements.ts).
 *  Undefined when no card was read or you haven't said; "" when it is none of the accounts brought in. */
export const cardAccountOf = (receipt: Pick<KnownReceipt, 'card'>, cards: Readonly<Record<string, string>>): string | undefined =>
  receipt.card && Object.hasOwn(cards, receipt.card.last4) ? cards[receipt.card.last4] : undefined

/** Each card payment with the receipt for it, by the payment's id (v0.20.2): the same amount, within RECEIPT_DAYS, its
 *  shop the payee. Each payment and each receipt once, the nearest day first; a receipt paid another way (a gift card,
 *  cash) has none. The two are never added together: a payment opens its receipt. A receipt whose card you said is one
 *  of your accounts looks only in that account's lines, and one you said is none of them has none (v0.24.0). */
export function receiptPaymentCandidates(
  lines: readonly MoneyLine[],
  receipt: KnownReceipt,
  occupied: ReadonlySet<string> = new Set(),
  cards: Readonly<Record<string, string>> = {},
): MoneyLine[] {
  if (receipt.currency && receipt.currency !== '£') return []
  const account = cardAccountOf(receipt, cards)
  if (account === '') return []
  const date = receipt.dated ? receipt.date : (receipt.entryDate ?? receipt.date)
  const days = (line: MoneyLine) => Math.abs(dayNumber(line.date) - dayNumber(date))
  return lines
    .filter((line) => (account === undefined || line.account === account) && !line.moving && line.amount < 0 && !occupied.has(line.id) && days(line) <= RECEIPT_DAYS && samePlace(receipt.shop, line.payee))
    .sort((a, b) => Number(-a.amount !== paid(receipt)) - Number(-b.amount !== paid(receipt)) || days(a) - days(b) || b.date.localeCompare(a.date))
}

/** Owner-chosen links take precedence; receipts without a printed date are never linked automatically. A card you said
 *  is one of your accounts is matched only in it (`cards`, v0.24.0). */
export function linkReceipts(
  lines: readonly MoneyLine[],
  receipts: readonly KnownReceipt[],
  chosen: Readonly<Record<string, string>> = {},
  cards: Readonly<Record<string, string>> = {},
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
    const payment = receiptPaymentCandidates(lines, receipt, new Set(links.keys()), cards).find((line) => -line.amount === paid(receipt))
    if (payment) links.set(payment.id, receipt)
  }
  return links
}
