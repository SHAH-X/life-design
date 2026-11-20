// Trading 212's statements (v0.34.0, owner 2026-11-19: what he sent to it counted as spending):
// its two documents, read for the cash that moved in and out of each account. A "Transactions Statement" is a table per
// account; an "Activity statement" has an overview of every account and, further on, each one's transactions among its trades
// and dividends. What moved (deposits and payouts) is kept as lines of the account it happened in ("Trading 212 ···0001"),
// so Money can pair them with the bank's side. Its trades, dividends and interest (v0.36.0) are kept apart, for the
// Investing view: an Activity statement's overview totals are checked against them, and what doesn't match is said.
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
  /** The time as "2026-10-01 07:05:49", whichever of the documents printed it. */
  at: string
  description: string
  amount: number
  /** Whether it's interest or a dividend (shown in the account's table, not money moved). */
  income: boolean
}

/** One trade, dividend or interest line as read, before it is kept (src/db/invest.ts). */
export interface InvestingLineRead {
  kind: 'trade' | 'dividend' | 'interest'
  date: string
  at: string
  instrument: string
  direction: '' | 'Buy' | 'Sell'
  orderId: string
  value: number
  fxFee: number
  fees: number
  result: number | null
  tax: number
}

/** What a statement says of an account's trades, dividends and interest. `summary` is null from a document with no totals. */
export interface InvestingRead {
  account: string
  from: string
  to: string
  lines: InvestingLineRead[]
  summary: { accountValue: number | null; openResult: number | null; openResultChange: number | null; mismatches: string[] } | null
}

/** "9.5", "$0.14823", "p329.28", "15%": the number in it. */
const figure = (text: string): number => Number(text.replace(/[£$€,p%]/g, ''))

/** £1,234.56 in words (no sign). */
const pounds = (p: number) => `£${(Math.abs(p) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "01/10/2026 07:05:49" as "2026-10-01 07:05:49". */
const isoAt = (dmy: string): string | null => {
  const [day, time] = dmy.split(' ')
  const date = day ? dateIn(day, false) : null
  return date && time ? `${date} ${time}` : null
}

const accountName = (id: string) => `Trading 212 ···${id.slice(-4)}`

/** "30.09.2026 21:00" is midnight in UK summer time, so the first day is the one after. */
function dayAfter(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function readTrading212(all: readonly TextPiece[]): { accounts: StatementAccount[]; investing: InvestingRead[]; labels?: Record<string, string> } | { problem: StatementProblem } | null {
  const pieces = all.filter((p) => p.size >= 1 && p.w > 0 && p.str.trim())
  if (!pieces.some((p) => /Trading 212 UK/i.test(p.str))) return null
  const kind = pieces.some((p) => /^Transactions Statement$/i.test(p.str.trim())) ? 'transactions' : pieces.some((p) => /^Activity statement$/i.test(p.str.trim())) ? 'activity' : null
  if (!kind) return null
  const pages = [...new Set(pieces.map((p) => p.page))].sort((a, b) => a - b)
  const rows: Row[] = []
  const trades: (InvestingLineRead & { id: string })[] = []
  const dividends: (InvestingLineRead & { id: string })[] = []
  let period: { from: string; to: string } | null = null
  /** What the overview says of each account (activity only): its figures by their labels. */
  const printed = new Map<string, Record<string, number>>()
  /** Each account's type as its overview heads it ("Stocks ISA"), by the name it is kept under. */
  const labels: Record<string, string> = {}
  /** The "Account value" a Transactions Statement prints above each account's table. */
  const hasOverview = kind === 'activity'

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
        const at = isoAt(time.str.trim())
        // Only pounds: a figure in another currency would be wrong as pounds.
        if (!current || amount === null || !date || !at || !type || currency !== 'GBP') continue
        rows.push({ id: current, date, at, description: type, amount, income: NOT_MOVED.test(type) })
      }
    }
  } else {
    const covering = pieces.map((p) => p.str.match(/covering from (\d{2}\.\d{2}\.\d{4}) (\d{2}):\d{2} \(UTC\) to (\d{2}\.\d{2}\.\d{4})/)).find(Boolean)
    if (covering) {
      const [from, to] = [dateIn(covering[1]!, false), dateIn(covering[3]!, false)]
      if (from && to) period = { from: Number(covering[2]) >= 21 ? dayAfter(from) : from, to }
    }
    // The overview: each account's name, ID and what it says (deposits, withdrawals, results, fees, dividends, interest, value).
    const ids = new Map<string, string>()
    const first = pieces.filter((p) => p.page === pages[0])
    const LABELS = new Set(['Deposits', 'Withdrawals', 'Closed result', 'Realised return', 'Open result', 'Open return', 'Open result change', 'Open return change', 'Dividends and distributions', 'Interest on cash', 'FX fee', 'Third-party fees', 'Account value'])
    for (const idPiece of first.filter((p) => /^Account ID:\s*\d+/.test(p.str))) {
      const id = idPiece.str.match(/(\d+)/)![1]!
      const band = (p: TextPiece) => Math.abs(p.x - idPiece.x) <= 6
      const heading = first.filter((p) => band(p) && p.y > idPiece.y && /^Trading 212 /.test(p.str)).sort((a, b) => a.y - b.y)[0]
      if (heading) {
        const type = heading.str.replace(/^Trading 212\s+/, '').trim()
        ids.set(type.toLowerCase(), id)
        labels[accountName(id)] = type
      }
      const sums: Record<string, number> = {}
      // Accounts sit side by side: a figure is the line's last piece before the next account's block begins.
      const next = Math.min(...first.filter((p) => /^Account ID:\s*\d+/.test(p.str) && p.x > idPiece.x + 6).map((p) => p.x), Number.POSITIVE_INFINITY)
      for (const label of first.filter((p) => p.y < idPiece.y && p.x >= idPiece.x - 2 && p.x < idPiece.x + 40 && LABELS.has(p.str.trim()))) {
        const value = lineOf(first, label).filter((p) => p.x > label.x + label.w && p.x + p.w < next).at(-1)
        const amount = value ? pence(value.str) : null
        if (amount !== null) sums[label.str.trim()] = amount
      }
      printed.set(id, sums)
    }
    // Each page is a table of one account (a title says which; a page with none carries on the one before).
    let table: { label: string; what: string } | null = null
    for (const n of pages.slice(1)) {
      const page = pieces.filter((p) => p.page === n)
      const title = page.map((p) => p.str.trim().match(/^(.+?) account - (executed trades|open positions summary|cash breakdown|transactions(?: and dividends)?)$/i)).find(Boolean)
      if (title) table = { label: title[1]!.toLowerCase(), what: title[2]!.toLowerCase() }
      const id = table ? ids.get(table.label) : undefined
      if (!table || !id) continue
      if (table.what.startsWith('executed trades')) {
        // Its columns are where its headings end (money is aligned right): the last "VALUE" is in the account's currency.
        const right = (text: string, last = false) => page.filter((p) => p.str.trim() === text).map((p) => p.x + p.w).sort((a, b) => (last ? b - a : a - b))[0]
        const cols = { fxFee: right('FX FEE'), fees: right('GOVT FEES'), result: right('RETURN'), value: right('VALUE', true) }
        if ([cols.fxFee, cols.fees, cols.result, cols.value].some((c) => c === undefined)) continue
        const instrument = page.find((p) => p.str.trim() === 'INSTRUMENT')?.x
        for (const time of page.filter((p) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p.str.trim()))) {
          const line = lineOf(page, time)
          const direction = line.find((p) => p.str.trim() === 'Buy' || p.str.trim() === 'Sell')?.str.trim() as 'Buy' | 'Sell' | undefined
          const at = (column: number) => line.find((p) => Math.abs(p.x + p.w - column) <= 8)
          const money = (column: number) => {
            const piece = at(column)
            return piece && piece.str.trim() !== '-' ? pence(piece.str) : null
          }
          const value = money(cols.value!)
          const date = dateIn(time.str, false)
          const ticker = line.find((p) => instrument !== undefined && Math.abs(p.x - instrument) <= 4)?.str.trim()
          if (!direction || value === null || !date || !ticker) continue
          trades.push({
            id, kind: 'trade', date, at: time.str.trim(), instrument: ticker, direction,
            orderId: line.find((p) => /^\d{8,}$/.test(p.str.trim()))?.str.trim() ?? '',
            value, fxFee: money(cols.fxFee!) ?? 0, fees: money(cols.fees!) ?? 0, result: direction === 'Sell' ? money(cols.result!) : null, tax: 0,
          })
        }
        continue
      }
      if (!table.what.startsWith('transactions')) continue
      // The dividends table can follow the transactions on the same page.
      const heading = page.find((p) => p.str.trim() === 'Dividends')
      for (const time of page.filter((p) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(p.str.trim()) && (!heading || p.y > heading.y))) {
        const line = lineOf(page, time)
        const [type, amount] = [line[1]?.str.trim(), pence(line.at(-1)?.str ?? '')]
        const date = dateIn(time.str, false)
        if (!type || amount === null || !date) continue
        rows.push({ id, date, at: time.str.trim(), description: type, amount, income: NOT_MOVED.test(type) })
      }
      // A dividend: the account's amount is after tax; the tax is its printed rate's, in the instrument's currency.
      for (const pay of page.filter((p) => /^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/.test(p.str.trim()) && (!heading || p.y < heading.y))) {
        const line = lineOf(page, pay)
        const [ticker, net, whtText, , , fxText] = [line[0]?.str.trim(), pence(line.at(-1)?.str ?? ''), line.at(-2)?.str, line.at(-3)?.str, line.at(-4)?.str, line.at(-5)?.str]
        const date = dateIn(pay.str, false)
        if (!ticker || net === null || !date || whtText === undefined || fxText === undefined) continue
        dividends.push({
          id, kind: 'dividend', date, at: `${date} ${pay.str.trim().split(' ')[1]}:00`, instrument: ticker, direction: '', orderId: '',
          value: net, fxFee: 0, fees: 0, result: null, tax: Math.round(figure(whtText) * figure(fxText) * 100),
        })
      }
    }
  }

  const accounts: StatementAccount[] = []
  const investing: InvestingRead[] = []
  for (const id of [...new Set([...rows.map((r) => r.id), ...trades.map((t) => t.id), ...dividends.map((d) => d.id)])]) {
    // Printed newest first: oldest first, a day's in the order printed.
    const mine = rows.filter((r) => r.id === id)
    const moved = mine.filter((r) => !r.income).reverse()
    const sums = printed.get(id)
    // What the overview says came in and went out must be what these add up to.
    const total = (positive: boolean) => moved.filter((r) => r.amount > 0 === positive).reduce((sum, r) => sum + r.amount, 0)
    const matches = !sums || ((sums.Deposits === undefined || sums.Deposits === total(true)) && (sums.Withdrawals === undefined || sums.Withdrawals === total(false)))
    const lines: StatementLine[] = moved
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ date: r.date, amount: r.amount, description: r.description, type: '', balance: null, adds: matches }))
    const dates = [...mine, ...trades.filter((t) => t.id === id), ...dividends.filter((d) => d.id === id)].map((r) => r.date).sort()
    const [from, to] = [period?.from ?? dates[0]!, period?.to ?? dates.at(-1)!]
    const name = accountName(id)
    if (mine.length) accounts.push({ account: name, from, to, lines })

    // Its trades, dividends and interest, oldest first.
    const interest: InvestingLineRead[] = mine
      .filter((r) => /\binterest\b/i.test(r.description))
      .reverse()
      .map((r) => ({ kind: 'interest', date: r.date, at: r.at, instrument: '', direction: '', orderId: '', value: r.amount, fxFee: 0, fees: 0, result: null, tax: 0 }))
    const mineTrades = trades.filter((t) => t.id === id).map(({ id: _, ...t }) => t)
    const mineDividends = dividends.filter((d) => d.id === id).map(({ id: _, ...d }) => d)
    if (!interest.length && !mineTrades.length && !mineDividends.length) continue
    const sum = (list: readonly number[]) => list.reduce((a, b) => a + b, 0)
    const checks: [string, number, number | undefined][] = [
      ['FX fees', sum(mineTrades.map((t) => t.fxFee)), sums?.['FX fee'] === undefined ? undefined : Math.abs(sums['FX fee'])],
      ['Third-party fees', sum(mineTrades.map((t) => t.fees)), sums?.['Third-party fees'] === undefined ? undefined : Math.abs(sums['Third-party fees'])],
      ['Closed result', sum(mineTrades.map((t) => t.result ?? 0)), sums?.['Closed result'] ?? sums?.['Realised return']],
      ['Dividends', sum(mineDividends.map((d) => d.value)), sums?.['Dividends and distributions']],
      ['Interest', sum(interest.map((i) => i.value)), sums?.['Interest on cash']],
    ]
    const mismatches = checks.filter(([, got, said]) => said !== undefined && got !== said).map(([label, got, said]) => `${label} ${pounds(got)}, the statement says ${pounds(said!)}`)
    const pick = (...labels: string[]) => labels.map((l) => sums?.[l]).find((v) => v !== undefined) ?? null
    investing.push({
      account: name,
      from,
      to,
      lines: [...mineTrades, ...mineDividends, ...interest].sort((a, b) => a.at.localeCompare(b.at)),
      summary: hasOverview && sums ? { accountValue: pick('Account value'), openResult: pick('Open result', 'Open return'), openResultChange: pick('Open result change', 'Open return change'), mismatches } : null,
    })
  }
  return accounts.length || investing.length ? { accounts, investing, ...(Object.keys(labels).length ? { labels } : {}) } : { problem: 'no-table' }
}
