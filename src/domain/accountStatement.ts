// One account's statement, rebuilt from its lines (v0.30.0): the PDFs aren't kept, only what was read from them. A month
// at a time, newest day first, with what came in and went out and the balance at its end when the balances say it.
import type { BankLine } from '../db/types'
import { balanceFollows, preferOwed } from './statements'

export interface AccountDay {
  date: string
  /** Newest first. */
  lines: BankLine[]
}

export interface AccountMonthView {
  /** Newest first. */
  days: AccountDay[]
  /** In pence. */
  in: number
  out: number
  /** The balance after the month's last line, or null: none printed, or the day's order can't be told from them. */
  closing: number | null
  /** Whether its balances are what's owed (a card's, Flex's) rather than held: money out raises them. */
  owed: boolean
  count: number
}

/** Every month from the account's first line to its last, oldest first (a month with no lines between is still one: a
 *  statement missing shows as a month of nothing). */
export function accountMonths(lines: readonly BankLine[]): string[] {
  if (!lines.length) return []
  const months = lines.map((l) => l.date.slice(0, 7)).sort()
  const [first, last] = [months[0]!, months.at(-1)!]
  const all: string[] = []
  let [year, month] = [Number(first.slice(0, 4)), Number(first.slice(5))]
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`
    all.push(key)
    if (key >= last) break
    ;[year, month] = month === 12 ? [year + 1, 1] : [year, month + 1]
  }
  return all
}

/** A day's lines oldest first, in the order its printed balances give: each line's balance follows from the one before,
 *  held or owed. Lines kept with no order of their own can't be told apart without balances, so they stay as they are. */
function orderDay(day: readonly BankLine[]): { lines: BankLine[]; ordered: boolean } {
  if (day.length <= 1) return { lines: [...day], ordered: true }
  if (day.some((l) => l.balance === null)) return { lines: [...day], ordered: false }
  for (const owed of [false, true]) {
    const follows = (before: BankLine, after: BankLine) => balanceFollows(before.balance, after, owed)
    const starts = day.filter((x) => !day.some((y) => y !== x && follows(y, x)))
    if (starts.length !== 1) continue
    const chain = [starts[0]!]
    while (chain.length < day.length) {
      const next = day.filter((y) => !chain.includes(y) && follows(chain.at(-1)!, y))
      if (next.length !== 1) break
      chain.push(next[0]!)
    }
    if (chain.length === day.length) return { lines: chain, ordered: true }
  }
  return { lines: [...day], ordered: false }
}

/** Whether an account's balances are what's owed: whichever way more of them follow from another line's, a tie being held. */
function owedOf(lines: readonly BankLine[]): boolean {
  const known = lines.filter((l) => l.balance !== null)
  const follow = (owed: boolean) => known.filter((x) => known.some((y) => y !== x && balanceFollows(y.balance, x, owed))).length
  return known.length > 1 && preferOwed(follow(false), follow(true))
}

/** An account's month: its days newest first, what came in and went out (money moved between your own accounts included:
 *  it's the statement), and its balance at the end. */
export function accountMonth(lines: readonly BankLine[], month: string): AccountMonthView {
  const mine = lines.filter((l) => l.date.slice(0, 7) === month)
  const dates = [...new Set(mine.map((l) => l.date))].sort()
  const ordered = dates.map((date) => ({ date, ...orderDay(mine.filter((l) => l.date === date)) }))
  const last = ordered.at(-1)
  return {
    days: ordered.map(({ date, lines: day }) => ({ date, lines: [...day].reverse() })).reverse(),
    in: mine.filter((l) => l.amount > 0).reduce((sum, l) => sum + l.amount, 0),
    out: mine.filter((l) => l.amount < 0).reduce((sum, l) => sum - l.amount, 0),
    closing: last?.ordered ? (last.lines.at(-1)!.balance ?? null) : null,
    owed: owedOf(lines),
    count: mine.length,
  }
}
