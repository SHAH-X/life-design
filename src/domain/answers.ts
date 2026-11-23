// Quick answers about your money and papers, and the one quiet line (step 6, 2026-11-23, owner-approved plan; its mock shown first):
// worked out on the phone to the penny, never an AI. Your bank payments are asked about only here: no AI sees them (owner,
// 2026-10-26). Each answer says its period and where it comes from, keeps what the statements show apart from an estimate and
// a thing to look at, and never counts a month with a statement missing as nothing.

import type { Bill, DocumentRecord, StatementRecord } from '../db/types'
import { addDays, addMonths, dayMonth, monthName, monthYear, shortDayMonth } from '../lib/dates'
import { money } from '../lib/money'
import { billsTotal, dueSoon, EVERY_WORDS, nextPayment, renewalIn, yearOf } from './bills'
import { KIND_WORDS, needsLook } from './documents'
import {
  type KindGroup,
  type MoneyLine,
  type Regular,
  monthCoverage,
  moneyMonth,
  NOT_SORTED,
  regularPayments,
  titleCaseShouted,
  upcoming,
} from './money'
import { compareShops, type ProductView, type UnitKind } from './products'
import { shiftMonth } from './shopping'

export interface AnswerData {
  today: string
  lines: readonly MoneyLine[]
  statements: readonly StatementRecord[]
  closed: ReadonlySet<string>
  /** The kinds you chose for payees (`PAYEE_KINDS`). */
  kinds: Readonly<Record<string, string>>
  bills: readonly Bill[]
  docs: readonly DocumentRecord[]
  products: readonly ProductView[]
  /** Receipts whose items don't add up, held back from every sum. */
  heldReceipts: number
  accountName: (account: string) => string
}

export interface AnswerRow {
  label: string
  value?: string
  sub?: string
  /** The payments behind it, to show. */
  lines?: readonly MoneyLine[]
}

export interface AnswerSection {
  heading?: string
  rows: AnswerRow[]
  note?: string
}

/** What the phone says to a question: the period it covers, what the statements show, an estimate, and a thing to look at, each
 *  kept apart. */
export interface QuickAnswer {
  title: string
  period: string
  /** What is missing, or only a pattern, said plainly. */
  caveats: string[]
  facts: AnswerSection[]
  estimate?: string
  look: { text: string }[]
  /** Said instead of an answer when there is nothing to answer from. */
  empty?: string
}

const pounds = (pence: number) => money(pence, '£')
const word = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const nameOf = (l: MoneyLine) => titleCaseShouted(l.label ?? l.payee.name)
const sumOut = (lines: readonly MoneyLine[]) => lines.reduce((s, l) => s - l.amount, 0)

/** The month before today's, "2026-10" for any day in November 2026. */
export const lastMonth = (today: string) => shiftMonth(today.slice(0, 7), -1)

const lastDay = (month: string) => addDays(addMonths(`${month}-01`, 1), -1)

/** "1 – 31 October 2026", or "1 May – 31 October 2026"; across years each end has its year. */
function rangeWords(first: string, last: string): string {
  if (first === last) return `1 – ${lastDay(last).slice(8).replace(/^0/, '')} ${monthYear(last)}`
  const [a, b] = [`1 ${monthName(first)}`, `${lastDay(last).slice(8).replace(/^0/, '')} ${monthName(last)}`]
  return first.slice(0, 4) === last.slice(0, 4) ? `${a} – ${b} ${last.slice(0, 4)}` : `${a} ${first.slice(0, 4)} – ${b} ${last.slice(0, 4)}`
}

/** "Lloyds", "Lloyds and Monzo", "A, B and C": the accounts that have lines in the months. */
function fromAccounts(d: AnswerData, first: string, last: string): string {
  const names = [...new Set(d.lines.filter((l) => l.date.slice(0, 7) >= first && l.date.slice(0, 7) <= last).map((l) => d.accountName(l.account)))].sort()
  if (names.length === 0) return ''
  return ` · from ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`}`
}

const monthsBack = (last: string, count: number) => Array.from({ length: count }, (_, i) => shiftMonth(last, i - count + 1))

const itsOf = (d: AnswerData, month: string) => moneyMonth(d.lines, month, d.today, d.statements, d.closed, d.kinds)
const kindGroupsOf = (d: AnswerData, month: string): KindGroup[] => {
  const k = itsOf(d, month).kinds
  return [...k.ranked, ...k.others].filter((g) => g.kind !== NOT_SORTED)
}

/** The kinds with money out in a month, most first: what to ask about. */
export function kindsSpent(d: AnswerData, month: string): { kind: string; total: number }[] {
  return kindGroupsOf(d, month)
    .map((g) => ({ kind: g.kind, total: g.total }))
    .filter((k) => k.total > 0)
    .sort((a, b) => b.total - a.total)
}

/** What a month's statements leave unsaid: a statement not in, said for the month. */
function monthCaveat(d: AnswerData, month: string): string | null {
  const cover = monthCoverage(d.statements, d.closed, [month], d.today)[0]!
  if (cover.complete) return null
  if (month >= d.today.slice(0, 7)) return `${monthName(month)} isn't over yet: this is what has been paid so far.`
  if (cover.uncovered) return `${monthName(month)} has no statement, so nothing is known of it.`
  return `Not every statement for ${monthName(month)} is in (${cover.missing.map(d.accountName).join(' and ')} ${cover.missing.length === 1 ? 'is' : 'are'} missing some days), so this is only what the statements brought in show.`
}

/** What was paid to each payee in some lines, most first, each with its payments. */
function byPayee(lines: readonly MoneyLine[], limit?: number): AnswerRow[] {
  const groups = new Map<string, MoneyLine[]>()
  for (const l of lines) groups.set(l.payee.key, [...(groups.get(l.payee.key) ?? []), l])
  return [...groups.values()]
    .map((same) => ({ label: nameOf(same[0]!), total: sumOut(same), same }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ label, total, same }) => ({ label, value: pounds(total), sub: word(same.filter((l) => !l.refund).length, 'payment', 'payments'), lines: same }))
}

/** What was spent on one kind of thing in a month (last month unless one is given). */
export function spentOnKind(d: AnswerData, kind: string, month: string = lastMonth(d.today)): QuickAnswer {
  const title = `${kind} in ${monthYear(month)}`
  const base = { title, period: rangeWords(month, month) + fromAccounts(d, month, month), caveats: [monthCaveat(d, month)].filter((c): c is string => c !== null), look: [] }
  const group = kindGroupsOf(d, month).find((g) => g.kind === kind)
  if (!group || group.total === 0) return { ...base, facts: [], empty: `Nothing was paid to ${kind} in ${monthYear(month)}.` }
  const payments = group.lines.filter((l) => !l.refund).length
  return { ...base, facts: [{ rows: [{ label: 'All of it', value: pounds(group.total), sub: word(payments, 'payment', 'payments'), lines: group.lines }, ...byPayee(group.lines, 8)] }] }
}

/** The biggest expenses of a month (last month unless one is given): who was paid most, and the biggest single payments. */
export function biggestExpenses(d: AnswerData, month: string = lastMonth(d.today)): QuickAnswer {
  const out = itsOf(d, month).outLines.filter((l) => l.amount < 0 && !l.refund)
  const base = { title: `Biggest expenses in ${monthYear(month)}`, period: rangeWords(month, month) + fromAccounts(d, month, month), caveats: [monthCaveat(d, month)].filter((c): c is string => c !== null), look: [] }
  if (out.length === 0) return { ...base, facts: [], empty: `No payments out in ${monthYear(month)}.` }
  const singles = [...out].sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date)).slice(0, 5)
  return {
    ...base,
    facts: [
      { heading: 'By who was paid', rows: byPayee(out, 8) },
      { heading: 'Biggest single payments', rows: singles.map((l) => ({ label: nameOf(l), value: pounds(-l.amount), sub: shortDayMonth(l.date), lines: [l] })) },
    ],
  }
}

/** How what was spent on one kind changed over the last months (six, to last month): the months with every statement in, the
 *  latest against the one before, a year at the latest as an estimate, and any regular payment in it that changed. */
export function costChange(d: AnswerData, kind: string, count = 6): QuickAnswer {
  const last = lastMonth(d.today)
  const months = monthsBack(last, count)
  const coverage = monthCoverage(d.statements, d.closed, months, d.today)
  const base = { title: kind, period: rangeWords(months[0]!, last) + fromAccounts(d, months[0]!, last), look: [] as { text: string }[] }
  const caveats: string[] = []
  const rows: AnswerRow[] = []
  const totals: { month: string; total: number }[] = []
  for (const c of coverage) {
    if (!c.complete) {
      caveats.push(c.uncovered ? `${monthName(c.month)} has no statement, so it is left out.` : `${monthName(c.month)} is missing some statements (${c.missing.map(d.accountName).join(' and ')}), so it is left out.`)
      continue
    }
    const group = kindGroupsOf(d, c.month).find((g) => g.kind === kind)
    const total = group?.total ?? 0
    totals.push({ month: c.month, total })
    rows.push({ label: monthName(c.month), value: pounds(total), lines: group?.lines })
  }
  if (totals.every((t) => t.total === 0)) return { ...base, caveats, facts: [], empty: `Nothing was paid to ${kind} in these months.` }
  const [now, before] = [totals.at(-1), totals.at(-2)]
  const note = now && before ? `${monthName(now.month)} is ${pounds(Math.abs(now.total - before.total))} ${now.total >= before.total ? 'more' : 'less'} than ${monthName(before.month)}.` : undefined
  const estimate = now && now.total > 0 ? `At ${monthName(now.month)}’s amount, a year of it would come to ${pounds(now.total * 12)} (12 × ${pounds(now.total)}). Nothing says it will stay there.` : undefined
  const look = regularPayments(d.lines, last, d.today)
    .filter((r) => r.changed && r.lines.some((l) => (d.kinds[l.payee.key] ?? kindOfName(d, l)) === kind))
    .map((r) => ({ text: `${titleCaseShouted(r.payee.name)} is a regular payment that went up by ${pounds(r.changed!.to - r.changed!.from)} a ${r.every} on ${dayMonth(r.changed!.date)}.` }))
    .filter((_, i) => i < 3)
  return { ...base, caveats, facts: [{ rows, note }], estimate, look }
}

/** The kind of a line as Money says it (the kinds you chose win), for matching a regular payment to a kind. */
function kindOfName(d: AnswerData, l: MoneyLine): string | null {
  for (const g of kindGroupsOf(d, l.date.slice(0, 7))) if (g.lines.some((x) => x.id === l.id)) return g.kind
  return null
}

/** The payments you pay regularly that are not on your list of bills. */
function unlisted(d: AnswerData): Regular[] {
  const listed = new Set(d.bills.flatMap((b) => (b.payee ? [b.payee] : [])))
  return regularPayments(d.lines, d.today.slice(0, 7), d.today).filter((r) => !listed.has(r.payee.key))
}

const everyWord = (r: Regular) => (r.every === 'month' ? 'every month' : 'every week')

/** The bills and subscriptions you listed with what each comes to in a year, and those the statements show that you have not listed. */
export function billsAnswer(d: AnswerData): QuickAnswer {
  const sorted = [...d.bills].sort((a, b) => nextPayment(a, d.today).localeCompare(nextPayment(b, d.today)) || a.name.localeCompare(b.name))
  const found = unlisted(d).sort((a, b) => a.payee.name.localeCompare(b.payee.name, 'en', { sensitivity: 'base' }))
  const facts: AnswerSection[] = []
  if (sorted.length) facts.push({ heading: 'Your bills', rows: sorted.map((b) => ({ label: b.name, value: pounds(b.amount), sub: `${EVERY_WORDS[b.every]} · ${pounds(yearOf(b))} a year · next around ${shortDayMonth(nextPayment(b, d.today))}` })) })
  if (found.length) facts.push({ heading: 'Found in your statements, not listed', rows: found.map((r) => ({ label: titleCaseShouted(r.payee.name), value: pounds(r.amount), sub: `${everyWord(r)} · ${pounds(r.year)} a year`, lines: r.lines })) })
  const total = billsTotal(d.bills)
  return {
    title: 'Bills and subscriptions',
    period: found.length ? 'What you listed, and the regular payments in your statements' : 'What you listed',
    caveats: [],
    facts,
    estimate: total.count ? `A year of the bills you listed comes to ${pounds(total.year)}, each counted from its cycle.` : undefined,
    look: [],
    empty: facts.length ? undefined : 'Nothing is listed yet, and no regular payment has been found. Add a bill in Money → Bills and budgets.',
  }
}

/** What is due in the next days: your bills, regular payments not listed, and tracked dates in your documents, soonest first. */
export function dueAnswer(d: AnswerData, days = 30): QuickAnswer {
  type Item = { date: string; row: AnswerRow; amount: number }
  const items: Item[] = [
    ...dueSoon(d.bills, d.today, days).map(({ bill, date }): Item => ({ date, amount: bill.amount, row: { label: bill.name, value: pounds(bill.amount), sub: `around ${shortDayMonth(date)}` } })),
    ...upcoming(unlisted(d), d.today, days).map((u): Item => ({ date: u.date, amount: u.amount, row: { label: titleCaseShouted(u.payee.name), value: pounds(u.amount), sub: `around ${shortDayMonth(u.date)}` } })),
    ...needsLook(d.docs, d.today, days).map((n): Item => ({ date: n.date, amount: 0, row: { label: n.doc.title, sub: `${KIND_WORDS[n.kind].replace(/^is /, '')} ${shortDayMonth(n.date)}` } })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.row.label.localeCompare(b.row.label))
  const total = items.reduce((s, i) => s + i.amount, 0)
  return {
    title: `Due in the next ${days} days`,
    period: `${shortDayMonth(d.today)} – ${shortDayMonth(addDays(d.today, days))}`,
    caveats: ['These are a pattern, not a promise: nothing says a payment will happen on the day.'],
    facts: items.length ? [{ rows: items.map((i) => i.row) }] : [],
    estimate: total > 0 ? `About ${pounds(total)} to pay, from the amounts last paid or listed.` : undefined,
    look: [],
    empty: items.length ? undefined : `Nothing is due in the next ${days} days that your bills, statements or documents show.`,
  }
}

/** Prices you pay at the same shop that went up in the last days (90), newest first. */
export function pricesRose(d: AnswerData, days = 90): QuickAnswer {
  const since = addDays(d.today, -days)
  const rows = d.products
    .filter((v) => v.change && v.change.to > v.change.from && v.change.toDate >= since)
    .sort((a, b) => b.change!.toDate.localeCompare(a.change!.toDate) || a.title.localeCompare(b.title))
    .map((v): AnswerRow => ({ label: v.title, value: `▲ ${pounds(Math.round(v.change!.to - v.change!.from))}`, sub: `${titleCaseShouted(v.change!.shop)} · ${pounds(Math.round(v.change!.from))} → ${pounds(Math.round(v.change!.to))} · ${shortDayMonth(v.change!.toDate)}` }))
  return {
    title: 'Prices that rose',
    period: `Your receipts from ${shortDayMonth(since)} to ${shortDayMonth(d.today)}, at the same shop`,
    caveats: [],
    facts: rows.length ? [{ rows }] : [],
    look: [],
    empty: rows.length ? undefined : `No price you pay at the same shop has gone up in the last ${days} days.`,
  }
}

const UNIT: Record<UnitKind, string> = { litre: 'a litre', kg: 'a kg', each: 'each' }

/** For products you said are the same at more than one shop, the cheapest shop when each was last bought. */
export function cheapestShops(d: AnswerData): QuickAnswer {
  const compared = d.products
    .map((view) => ({ view, compare: compareShops(view) }))
    .filter((c): c is { view: ProductView; compare: NonNullable<ReturnType<typeof compareShops>> } => c.compare !== null)
    .sort((a, b) => Number(b.view.regular) - Number(a.view.regular) || a.view.title.localeCompare(b.view.title))
  const rows: AnswerRow[] = compared.map(({ compare }, i) => {
    const [cheapest, ...others] = compare.rows
    return {
      label: compared[i]!.view.title,
      value: `${titleCaseShouted(cheapest!.shop)} ${pounds(Math.round(cheapest!.perUnit))} ${UNIT[compare.kind]}`,
      sub: others.map((r) => `${titleCaseShouted(r.shop)} ${pounds(Math.round(r.perUnit))} ${UNIT[compare.kind]}`).join(' · ') + ` · last bought ${[cheapest!, ...others].map((r) => `${titleCaseShouted(r.shop)} ${shortDayMonth(r.date)}`).join(', ')}`,
    }
  })
  return {
    title: 'Cheapest shop for what you buy',
    period: 'What you paid on the day you paid it, per litre or kg, for products you said are the same',
    caveats: ['Not what a shop charges now.'],
    facts: rows.length ? [{ rows }] : [],
    look: compared.filter((c) => c.compare.cheaper).map((c) => ({ text: `${titleCaseShouted(c.compare.cheaper!.shop)} was ${pounds(c.compare.cheaper!.lessBy)} ${UNIT[c.compare.kind]} less when last bought; it may have changed since.` })),
    empty: rows.length ? undefined : 'Nothing to compare yet. In Receipts → Prices you’ve paid, say “Same product” for an item at two shops, and it appears here.',
  }
}

/** What needs a look: tracked dates and renewals coming up, receipts not counted, statements not in, payments that don't add up. */
export function needsLookAnswer(d: AnswerData, within = 60): QuickAnswer {
  const rows: AnswerRow[] = []
  for (const n of needsLook(d.docs, d.today, within)) rows.push({ label: n.doc.title, sub: `${KIND_WORDS[n.kind].replace(/^is /, '')} ${shortDayMonth(n.date)} · in ${word(n.days, 'day', 'days')}` })
  for (const b of d.bills) {
    const days = renewalIn(b, d.today)
    if (days !== null && days <= within) rows.push({ label: b.name, sub: `renews ${shortDayMonth(b.renewal!)} · in ${word(days, 'day', 'days')}` })
  }
  if (d.heldReceipts) rows.push({ label: `${word(d.heldReceipts, 'receipt', 'receipts')} not counted yet`, sub: 'their items don’t add up to the total; open Money → Receipts to count or correct' })
  for (const a of itsOf(d, d.today.slice(0, 7)).toCheck.accounts) rows.push({ label: d.accountName(a.account), sub: `statement needed: nothing after ${shortDayMonth(a.until)}` })
  const odd = d.lines.filter((l) => !l.adds).length
  if (odd) rows.push({ label: word(odd, 'payment', 'payments'), sub: 'whose printed balance did not follow from the line before: open Money → Statements' })
  return {
    title: 'What needs a look',
    period: `From today to ${shortDayMonth(addDays(d.today, within))}, and anything waiting`,
    caveats: [],
    facts: rows.length ? [{ rows }] : [],
    look: [],
    empty: rows.length ? undefined : 'Nothing needs a look right now.',
  }
}

export interface MoneyNotice {
  /** What it is about, so it is shown once. */
  key: string
  text: string
  /** Where "See it" goes. */
  href: string
  /** When it happened: the newest is the one shown. */
  date: string
}

/** A payment counts as unusual when it is over £20 and more than twice the largest of at least 3 earlier payments to the same payee
 *  (owner-approved 2026-11-23); a price rose when it is 20p or 10% or more, for something bought at least twice there. */
export const NOTICE = { minPayment: 2000, times: 2, earlier: 3, riseMinor: 20, risePercent: 0.1, days: 21 } as const

/** The one quiet line for Today, if there is one not already seen: the newest payment far above any earlier one to the same payee, or
 *  price that rose, in the last three weeks. */
export function moneyNotice(d: AnswerData, seen: ReadonlySet<string>): MoneyNotice | null {
  const since = addDays(d.today, -NOTICE.days)
  const found: MoneyNotice[] = []
  const out = d.lines.filter((l) => l.amount < 0 && !l.moving && !l.refund)
  for (const l of out.filter((x) => x.date >= since && x.date <= d.today && -x.amount >= NOTICE.minPayment)) {
    const before = out.filter((x) => x.payee.key === l.payee.key && (x.date < l.date || (x.date === l.date && x.id < l.id)))
    if (before.length < NOTICE.earlier) continue
    const most = Math.max(...before.map((x) => -x.amount))
    if (-l.amount <= NOTICE.times * most) continue
    found.push({ key: `big:${l.id}`, date: l.date, href: `#/money/${l.date.slice(0, 7)}`, text: `${pounds(-l.amount)} to ${nameOf(l)} on ${dayMonth(l.date)} is the most you have paid there. The most before was ${pounds(most)}.` })
  }
  for (const v of d.products) {
    const c = v.change
    if (!c || c.toDate < since || c.toDate > d.today || v.times < 2) continue
    const rise = c.to - c.from
    if (rise <= 0 || (rise < NOTICE.riseMinor && rise / c.from < NOTICE.risePercent)) continue
    found.push({ key: `price:${v.id}:${c.toDate}`, date: c.toDate, href: '#/shopping', text: `${v.title} rose ${pounds(Math.round(rise))} at ${titleCaseShouted(c.shop)} on ${dayMonth(c.toDate)} (${pounds(Math.round(c.from))} → ${pounds(Math.round(c.to))}).` })
  }
  return found.filter((n) => !seen.has(n.key)).sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key))[0] ?? null
}
