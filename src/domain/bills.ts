// Bills and subscriptions you list yourself, and a monthly budget for each kind of spending (step 4, 2026-11-23, owner-approved
// plan): worked out on the phone, never an AI. A year is multiplied out (a week 52, a month 12, three months 4), never
// averaged. Nothing here pays, changes or cancels anything: it says what you listed, when it falls due, and what the
// statements last showed beside it.

import type { Bill, BillEvery, Budget } from '../db/types'
import { addDays, addMonths } from '../lib/dates'
import { money } from '../lib/money'
import type { IcsEvent } from '../reminders/ics'
import { type MoneyLine, PAYMENT_KINDS, type Regular } from './money'

export const EVERY_WORDS: Record<BillEvery, string> = { week: 'every week', month: 'every month', quarter: 'every 3 months', year: 'every year' }

const PER_YEAR: Record<BillEvery, number> = { week: 52, month: 12, quarter: 4, year: 1 }

/** What a bill comes to in a year, in pence. */
export const yearOf = (bill: Pick<Bill, 'amount' | 'every'>): number => bill.amount * PER_YEAR[bill.every]

/** What your bills come to in a year, and how many are paid on each cycle. */
export function billsTotal(bills: readonly Bill[]): { year: number; count: number; by: Record<BillEvery, number> } {
  const by: Record<BillEvery, number> = { week: 0, month: 0, quarter: 0, year: 0 }
  for (const b of bills) by[b.every] += 1
  return { year: bills.reduce((s, b) => s + yearOf(b), 0), count: bills.length, by }
}

/** The `k`th payment after the one you gave, counted from it each time so a short month doesn't pull later ones earlier
 *  (31 Jan + 1 month is 28 Feb, and + 2 months is 31 Mar). */
const dueAfter = (bill: Pick<Bill, 'every' | 'next'>, k: number): string => {
  switch (bill.every) {
    case 'week':
      return addDays(bill.next, 7 * k)
    case 'month':
      return addMonths(bill.next, k)
    case 'quarter':
      return addMonths(bill.next, 3 * k)
    case 'year':
      return addMonths(bill.next, 12 * k)
  }
}

/** The first payment on or after `today`: the date you gave while it's to come, then a cycle at a time. It is a pattern you
 *  stated, not a promise from the bank. */
export function nextPayment(bill: Pick<Bill, 'every' | 'next'>, today: string): string {
  let k = 0
  while (dueAfter(bill, k) < today) k += 1
  return dueAfter(bill, k)
}

/** Bills due within `days` days of `today`, the last day included, soonest first. */
export function dueSoon(bills: readonly Bill[], today: string, days: number): { bill: Bill; date: string }[] {
  const last = addDays(today, days)
  return bills
    .map((bill) => ({ bill, date: nextPayment(bill, today) }))
    .filter(({ date }) => date <= last)
    .sort((a, b) => a.date.localeCompare(b.date) || a.bill.name.localeCompare(b.bill.name))
}

const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000)

/** Days to the renewal you gave, 0 for today; null with none, or once it has passed. */
export function renewalIn(bill: Pick<Bill, 'renewal'>, today: string): number | null {
  if (!bill.renewal) return null
  const days = dayNumber(bill.renewal) - dayNumber(today)
  return days >= 0 ? days : null
}

/** What the statements last showed paid to a bill's payee: when, how much (as a positive amount), and whether that differs from
 *  what you listed. Money moved and money in are left out. Null for a bill with no payee, or one never paid. */
export function paidAgainst(bill: Pick<Bill, 'payee' | 'amount'>, lines: readonly MoneyLine[]): { date: string; amount: number; differs: boolean } | null {
  if (!bill.payee) return null
  const paid = lines.filter((l) => l.payee.key === bill.payee && l.amount < 0 && !l.moving).sort((a, b) => b.date.localeCompare(a.date))[0]
  return paid ? { date: paid.date, amount: -paid.amount, differs: -paid.amount !== bill.amount } : null
}

/** A regular payment found in the statements, as the start of a bill: yours to change and keep. */
export function draftFromRegular(r: Regular): Pick<Bill, 'name' | 'kind' | 'amount' | 'every' | 'next' | 'renewal' | 'method' | 'notes' | 'payee'> {
  return { name: r.payee.name, kind: '', amount: r.amount, every: r.every, next: r.next, renewal: null, method: '', notes: '', payee: r.payee.key }
}

export interface BudgetRow {
  kind: string
  budget: number
  spent: number
  /** What is left; negative when it's over. */
  left: number
}

/** Each budget you set against what was spent on that kind in the month, in the kinds' own order, and the total of those: only
 *  amounts and what is left, never a score. */
export function budgetRows(budgets: readonly Budget[], spentByKind: Readonly<Record<string, number>>): { rows: BudgetRow[]; total: { budget: number; spent: number; left: number } | null } {
  const order = (kind: string) => PAYMENT_KINDS.indexOf(kind as (typeof PAYMENT_KINDS)[number])
  const rows = [...budgets]
    .sort((a, b) => order(a.kind) - order(b.kind) || a.kind.localeCompare(b.kind))
    .map((b): BudgetRow => ({ kind: b.kind, budget: b.amount, spent: spentByKind[b.kind] ?? 0, left: b.amount - (spentByKind[b.kind] ?? 0) }))
  if (rows.length === 0) return { rows, total: null }
  const budget = rows.reduce((s, r) => s + r.budget, 0)
  const spent = rows.reduce((s, r) => s + r.spent, 0)
  return { rows, total: { budget, spent, left: budget - spent } }
}

/** Money out for each calendar quarter, from each month's, and how many of its months there is a figure for. */
export function quartersOf(months: readonly { month: string; out: number }[]): { quarter: string; out: number; months: number }[] {
  const found = new Map<string, { out: number; months: number }>()
  for (const { month, out } of months) {
    const quarter = `${month.slice(0, 4)} Q${Math.floor((Number(month.slice(5, 7)) - 1) / 3) + 1}`
    const was = found.get(quarter) ?? { out: 0, months: 0 }
    found.set(quarter, { out: was.out + out, months: was.months + 1 })
  }
  return [...found].sort(([a], [b]) => a.localeCompare(b)).map(([quarter, v]) => ({ quarter, ...v }))
}

/** How a bill repeats. A day after the 28th falls in no short month, and a calendar drops a month that has no such day; the app moves it to the
 *  month's last day (`dueAfter`), so the rule picks the last of the few days up to it that the month has (audit 2026-11-23). */
export function repeatRule(every: BillEvery, start: string): string {
  const day = Number(start.slice(8))
  const late = day > 28 ? `;BYMONTHDAY=${[day - 3, day - 2, day - 1, day].join(',')};BYSETPOS=-1` : ''
  switch (every) {
    case 'week':
      return 'FREQ=WEEKLY'
    case 'month':
      return `FREQ=MONTHLY${late}`
    case 'quarter':
      return `FREQ=MONTHLY;INTERVAL=3${late}`
    case 'year':
      return 'FREQ=YEARLY'
  }
}
const APP = 'https://shah-x.github.io/life-design/#/money'

/** Calendar events for your bills (a calendar file you add yourself): each repeats on its cycle from its next payment with an
 *  alert two days before, carrying your notes; a renewal still to come is a one-off event of its own. */
export function billEvents(bills: readonly Bill[], today: string): IcsEvent[] {
  return bills.flatMap((bill): IcsEvent[] => {
    const what = `${bill.name} ${money(bill.amount, '£')}`
    const description = [`Paid ${EVERY_WORDS[bill.every]}`, bill.method, bill.notes].filter(Boolean).join('. ')
    const start = nextPayment(bill, today)
    const due: IcsEvent = {
      uid: `bill-${bill.id}@life-design`,
      summary: `${what} due`,
      description,
      url: APP,
      startDate: start,
      startTime: '09:00',
      durationMinutes: 15,
      rrule: repeatRule(bill.every, start),
      alarm: `${what} is due in 2 days`,
      alarmBefore: '-P2D',
    }
    if (!bill.renewal || bill.renewal < today) return [due]
    return [due, { uid: `bill-renewal-${bill.id}@life-design`, summary: `${bill.name} renews`, description: [bill.notes, bill.method].filter(Boolean).join('. '), url: APP, startDate: bill.renewal, startTime: '09:00', durationMinutes: 15, alarm: `${bill.name} renews in 2 days`, alarmBefore: '-P2D' }]
  })
}
