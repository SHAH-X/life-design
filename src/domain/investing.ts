// Trading 212's costs and charges, profit and loss, and income (v0.36.0, owner 2026-11-19): a month at a time, from the
// trades, dividends and interest read from its Activity statement (src/domain/trading212.ts). Plain sums as printed:
// nothing averaged, rated, compared or called good or bad (DECISIONS, "Never"); groups are ranked only with MIN_COUNT sales.
import { MIN_COUNT } from '../analysis/stats'
import type { InvestLine, InvestSummary } from '../db/types'
import { dayMonth } from '../lib/dates'
import type { Ranked } from './money'
import { groupBy } from './shopping'

/** What a month's sales of one instrument made or lost. */
export interface InvestGroup {
  instrument: string
  /** In pence; negative is lost. */
  result: number
  lines: InvestLine[]
}

export interface InvestingMonth {
  month: string
  /** How many trades (buys and sells) there were. */
  trades: number
  costs: {
    fxFees: number
    /** Exchange and government fees (stamp duty and the like), "third-party fees" on the overview. */
    fees: number
    /** Tax withheld from dividends, worked out in pounds from the printed rate. */
    tax: number
    total: number
    fxLines: InvestLine[]
    feeLines: InvestLine[]
    taxLines: InvestLine[]
  }
  result: {
    /** What the month's sales made (negative: lost), as the statement prints it. */
    closed: number
    /** The closed result less the month's FX and exchange fees: the statement prints its result before them. */
    afterCharges: number
    sells: number
    byInstrument: Ranked<InvestGroup>
    /** What each account held at the end of the statement that ends in this month (the latest one for an account): its
     *  value and what it still held's result, as printed. */
    held: InvestSummary[]
  }
  income: { dividends: number; dividendLines: InvestLine[]; interest: number; interestLines: InvestLine[] }
  /** Whether a statement with its own totals covers the month, and what its lines didn't add up to. */
  checked: boolean
  mismatches: string[]
}

/** The months with any line, oldest first. */
export const investingMonths = (lines: readonly InvestLine[]): string[] => [...new Set(lines.map((l) => l.date.slice(0, 7)))].sort()

const total = (lines: readonly InvestLine[], of: (l: InvestLine) => number) => lines.reduce((sum, l) => sum + of(l), 0)

/** The latest statement of each account that ends in the month, accounts in name order. */
const heldIn = (summaries: readonly InvestSummary[], month: string): InvestSummary[] => {
  const latest = new Map<string, InvestSummary>()
  for (const s of summaries.filter((s) => s.to.slice(0, 7) === month)) if (!latest.has(s.account) || s.to > latest.get(s.account)!.to) latest.set(s.account, s)
  return [...latest.values()].sort((a, b) => a.account.localeCompare(b.account))
}

export function investingMonth(all: readonly InvestLine[], summaries: readonly InvestSummary[], month: string): InvestingMonth {
  const lines = all.filter((l) => l.date.slice(0, 7) === month)
  const trades = lines.filter((l) => l.kind === 'trade')
  const sells = trades.filter((l) => l.direction === 'Sell')
  const dividends = lines.filter((l) => l.kind === 'dividend')
  const interest = lines.filter((l) => l.kind === 'interest')
  const fxLines = trades.filter((l) => l.fxFee !== 0)
  const feeLines = trades.filter((l) => l.fees !== 0)
  const taxLines = dividends.filter((l) => l.tax !== 0)
  const groups = groupBy(sells, (l) => l.instrument).map((same): InvestGroup => ({ instrument: same[0]!.instrument, result: total(same, (l) => l.result ?? 0), lines: same }))
  // A statement checks the month only when its days reach all the month's lines (audit 2026-11-20): one that covers the first days
  // of a month a later document fills in has checked those, not the month.
  const days = lines.map((l) => l.date).sort()
  const covering = summaries.filter((s) => (days.length ? s.from <= days[0]! && s.to >= days.at(-1)! : s.from.slice(0, 7) <= month && month <= s.to.slice(0, 7)))
  const fx = total(trades, (l) => l.fxFee)
  const fees = total(trades, (l) => l.fees)
  const tax = total(dividends, (l) => l.tax)
  return {
    month,
    trades: trades.length,
    costs: { fxFees: fx, fees, tax, total: fx + fees + tax, fxLines, feeLines, taxLines },
    result: {
      closed: total(sells, (l) => l.result ?? 0),
      /** The closed result less the month's FX and exchange fees: the statement prints its result before them. */
      afterCharges: total(sells, (l) => l.result ?? 0) - fx - fees,
      sells: sells.length,
      byInstrument: {
        ranked: groups.filter((g) => g.lines.length >= MIN_COUNT).sort((a, b) => b.result - a.result),
        others: groups.filter((g) => g.lines.length < MIN_COUNT).sort((a, b) => a.instrument.localeCompare(b.instrument, 'en', { sensitivity: 'base' })),
      },
      held: heldIn(summaries, month),
    },
    income: { dividends: total(dividends, (l) => l.value), dividendLines: dividends, interest: total(interest, (l) => l.value), interestLines: interest },
    checked: covering.length > 0,
    mismatches: [...new Set(covering.flatMap((s) => s.mismatches.map((m) => `${dayMonth(s.from)} – ${dayMonth(s.to)}: ${m}`)))],
  }
}
