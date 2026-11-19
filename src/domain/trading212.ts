// Trading 212's statements (v0.34.0, owner 2026-11-19: what he sent to it counted as spending):
// its two documents, read for the cash that moved in and out of each account. A "Transactions Statement" is a table per
// account; an "Activity statement" has an overview of every account and, further on, each one's transactions among its trades
// and dividends. Only what moved is kept: deposits and payouts, each as the account it happened in ("Trading 212 ···0001"),
// so Money can pair them with the bank's side. Interest, dividends and trades wait for the Investing view.
import { dateIn } from './receipts'
import type { StatementAccount, StatementLine, StatementProblem, TextPiece } from './statements'

/** Lines of these accounts are never money in or out: they are your own investments (src/domain/money.ts). */
export const isInvestmentAccount = (account: string): boolean => account.startsWith('Trading 212')

/** What doesn't match, in words: a bank's line against its printed balance, Trading 212's against its statement's totals. */
export const notMatchingWords = (account: string, count: number): string =>
  `${count} ${count === 1 ? 'doesn’t match its' : 'don’t match their'} ${isInvestmentAccount(account) ? 'statement’s totals' : 'printed balance'}`.replace('its statement’s', 'the statement’s').replace('their statement’s', 'the statement’s')

/** An amount as these print it: "250", "0.1", "-300.25", "£200", "-£190", "£1,234.56"; in pence, or null. */
function pence(text: string): number | null {
  const m = text.trim().replace(/[£,]/g, '').match(/^(-)?(\d+)(?:\.(\d{1,2}))?$/)
  if (!m) return null
  const value = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || 0)
  return m[1] ? -value : value
}

/** The pieces on one line of a page (within 2 pt), left to right. */
const lineOf = (page: readonly TextPiece[], anchor: TextPiece) => page.filter((p) => Math.abs(p.y - anchor.y) <= 2).sort((a, b) => a.x - b.x)

/** Interest on cash and dividends are income inside the account, not money that moved. */
const NOT_MOVED = /\binterest\b|dividend/i

interface Row {
  id: string
  date: string
  description: string
  amount: number
  /** Whether it's interest or a dividend (shown in the account's table, not money moved). */
  income: boolean
}

const accountName = (id: string) => `Trading 212 ···${id.slice(-4)}`

/** "30.09.2026 21:00" is midnight in UK summer time, so the first day is the one after. */
function dayAfter(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function readTrading212(all: readonly TextPiece[]): { accounts: StatementAccount[] } | { problem: StatementProblem } | null {
  const pieces = all.filter((p) => p.size >= 1 && p.w > 0 && p.str.trim())
  if (!pieces.some((p) => /Trading 212 UK/i.test(p.str))) return null
  const kind = pieces.some((p) => /^Transactions Statement$/i.test(p.str.trim())) ? 'transactions' : pieces.some((p) => /^Activity statement$/i.test(p.str.trim())) ? 'activity' : null
  if (!kind) return null
  const pages = [...new Set(pieces.map((p) => p.page))].sort((a, b) => a - b)
  const rows: Row[] = []
  let period: { from: string; to: string } | null = null
  /** What the overview says each account took in and paid out (activity only). */
  const printed = new Map<string, { deposits?: number; withdrawals?: number }>()

  if (kind === 'transactions') {
    const text = pieces.map((p) => p.str).join(' ')
    const range = text.match(/(\d{2}\.\d{2}\.\d{4})\s*-\s*(\d{2}\.\d{2}\.\d{4})/)
    const [from, to] = range ? [dateIn(range[1]!, false), dateIn(range[2]!, false)] : [null, null]
    if (from && to) period = { from, to }
    let current: string | null = null
    for (const n of pages) {
      const page = pieces.filter((p) => p.page === n)
      current = page.map((p) => p.str.match(/^Account ID:\s*(\d+)/)?.[1]).find(Boolean) ?? current
      for (const time of page.filter((p) => /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/.test(p.str.trim()))) {
        // AMOUNT, CURRENCY, TIME, TRANSACTION TYPE, NOTES: left to right.
        const line = lineOf(page, time)
        const [amount, currency, , type] = [pence(line[0]?.str ?? ''), line[1]?.str.trim(), time, line[3]?.str.trim()]
        const date = dateIn(time.str, false)
        // Only pounds: a figure in another currency would be wrong as pounds.
        if (!current || amount === null || !date || !type || currency !== 'GBP') continue
        rows.push({ id: current, date, description: type, amount, income: NOT_MOVED.test(type) })
      }
    }
  } else {
    const covering = pieces.map((p) => p.str.match(/covering from (\d{2}\.\d{2}\.\d{4}) (\d{2}):\d{2} \(UTC\) to (\d{2}\.\d{2}\.\d{4})/)).find(Boolean)
    if (covering) {
      const [from, to] = [dateIn(covering[1]!, false), dateIn(covering[3]!, false)]
      if (from && to) period = { from: Number(covering[2]) >= 21 ? dayAfter(from) : from, to }
    }
    // The overview: each account's name, ID and what it says came in and went out.
    const ids = new Map<string, string>()
    const first = pieces.filter((p) => p.page === pages[0])
    for (const idPiece of first.filter((p) => /^Account ID:\s*\d+/.test(p.str))) {
      const id = idPiece.str.match(/(\d+)/)![1]!
      const band = (p: TextPiece) => Math.abs(p.x - idPiece.x) <= 6
      const heading = first.filter((p) => band(p) && p.y > idPiece.y && /^Trading 212 /.test(p.str)).sort((a, b) => a.y - b.y)[0]
      if (heading) ids.set(heading.str.replace(/^Trading 212\s+/, '').trim().toLowerCase(), id)
      const sums: { deposits?: number; withdrawals?: number } = {}
      // Accounts sit side by side: a figure is the line's last piece before the next account's block begins.
      const next = Math.min(...first.filter((p) => /^Account ID:\s*\d+/.test(p.str) && p.x > idPiece.x + 6).map((p) => p.x), Number.POSITIVE_INFINITY)
      for (const label of first.filter((p) => p.y < idPiece.y && p.x >= idPiece.x - 2 && p.x < idPiece.x + 40 && /^(Deposits|Withdrawals)$/.test(p.str.trim()))) {
        const value = lineOf(first, label).filter((p) => p.x > label.x + label.w && p.x + p.w < next).at(-1)
        const amount = value ? pence(value.str) : null
        if (amount !== null) sums[label.str.trim() === 'Deposits' ? 'deposits' : 'withdrawals'] = amount
      }
      printed.set(id, sums)
    }
    // Each page is a table of one account (a title says which; a page with none carries on the one before).
    let table: { label: string; what: string } | null = null
    for (const n of pages.slice(1)) {
      const page = pieces.filter((p) => p.page === n)
      const title = page.map((p) => p.str.trim().match(/^(.+?) account - (executed trades|open positions summary|cash breakdown|transactions(?: and dividends)?)$/i)).find(Boolean)
      if (title) table = { label: title[1]!.toLowerCase(), what: title[2]!.toLowerCase() }
      if (!table?.what.startsWith('transactions')) continue
      const id = ids.get(table.label)
      // The dividends table can follow the transactions on the same page.
      const dividends = page.find((p) => p.str.trim() === 'Dividends')
      for (const time of page.filter((p) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p.str.trim()) && (!dividends || p.y > dividends.y))) {
        const line = lineOf(page, time)
        const [type, amount] = [line[1]?.str.trim(), pence(line.at(-1)?.str ?? '')]
        const date = dateIn(time.str, false)
        if (!id || !type || amount === null || !date) continue
        rows.push({ id, date, description: type, amount, income: NOT_MOVED.test(type) })
      }
    }
  }

  const accounts: StatementAccount[] = []
  for (const id of [...new Set(rows.map((r) => r.id))]) {
    // Printed newest first: oldest first, a day's in the order printed.
    const moved = rows.filter((r) => r.id === id && !r.income).reverse()
    const sums = printed.get(id)
    // What the overview says came in and went out must be what these add up to.
    const total = (positive: boolean) => moved.filter((r) => r.amount > 0 === positive).reduce((sum, r) => sum + r.amount, 0)
    const matches = !sums || ((sums.deposits === undefined || sums.deposits === total(true)) && (sums.withdrawals === undefined || sums.withdrawals === total(false)))
    const lines: StatementLine[] = moved
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, amount: r.amount, description: r.description, type: '', balance: null, adds: matches }))
    const dates = rows.filter((r) => r.id === id).map((r) => r.date).sort()
    accounts.push({ account: accountName(id), from: period?.from ?? dates[0]!, to: period?.to ?? dates.at(-1)!, lines })
  }
  return accounts.length ? { accounts } : { problem: 'no-table' }
}
