// Trading 212's trades, dividends and interest kept on the phone (v0.36.0), each line once: a statement that overlaps one
// already in adds only what's new, and the second of its two documents of the same days adds nothing (interest is in
// both, written the same way). Read on the phone (src/domain/trading212.ts), never sent anywhere.
import type { InvestingLineRead, InvestingRead } from '../domain/trading212'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'
import { ACCOUNT_NAMES, accountNamesOf, nameAccount } from './statements'
import type { InvestLine } from './types'

/** What a statement brought in for an account, by kind of line. */
export interface InvestBrought {
  account: string
  from: string
  to: string
  trades: number
  dividends: number
  interest: number
  added: number
  already: number
  /** What the statement's own totals say the lines should have added up to, and didn't. */
  mismatches: string[]
}

/** A line is the same as one kept when its kind, time, instrument, order and amounts are. */
const sameAs = (line: Pick<InvestingLineRead, 'kind' | 'at' | 'instrument' | 'orderId' | 'value' | 'result'>) =>
  [line.kind, line.at, line.instrument, line.orderId, line.value, line.result ?? ''].join('|')

export async function bringInInvesting(read: readonly InvestingRead[], database: LifeDesignDB = defaultDb, now: number = Date.now()): Promise<InvestBrought[]> {
  return guardWrite(() =>
    database.transaction('rw', database.investLines, database.investSummaries, async () => {
      const brought: InvestBrought[] = []
      for (const statement of read) {
        const kept = new Map<string, number>()
        for (const line of await database.investLines.where('account').equals(statement.account).toArray()) kept.set(sameAs(line), (kept.get(sameAs(line)) ?? 0) + 1)
        const seen = new Map<string, number>()
        const added: InvestLine[] = []
        for (const line of statement.lines) {
          const key = sameAs(line)
          seen.set(key, (seen.get(key) ?? 0) + 1)
          if (seen.get(key)! > (kept.get(key) ?? 0)) added.push({ id: crypto.randomUUID(), account: statement.account, ...line, createdAt: now, updatedAt: now })
        }
        await database.investLines.bulkPut(added)
        // Totals come only from a document that prints them; one without leaves the statement's own as they were.
        if (statement.summary) {
          const id = `${statement.account}:${statement.from}:${statement.to}`
          const before = await database.investSummaries.get(id)
          await database.investSummaries.put({ id, account: statement.account, from: statement.from, to: statement.to, ...statement.summary, createdAt: before?.createdAt ?? now, updatedAt: now })
        }
        const count = (kind: InvestingLineRead['kind']) => statement.lines.filter((l) => l.kind === kind).length
        brought.push({
          account: statement.account,
          from: statement.from,
          to: statement.to,
          trades: count('trade'),
          dividends: count('dividend'),
          interest: count('interest'),
          added: added.length,
          already: statement.lines.length - added.length,
          mismatches: statement.summary?.mismatches ?? [],
        })
      }
      return brought
    }),
  )
}

/** Each Trading 212 account shown by its type (v0.44.0, owner 2026-11-20: "name them by type"): "Trading 212 Stocks ISA"
 *  instead of "Trading 212 ···0000". Only an account with no name of yours is named, so one you renamed stays as you wrote it. */
export async function nameInvestmentAccounts(labels: Readonly<Record<string, string>> | undefined, database: LifeDesignDB = defaultDb): Promise<void> {
  if (!labels) return
  const named = accountNamesOf(await database.settings.get(ACCOUNT_NAMES))
  for (const [account, type] of Object.entries(labels)) {
    if (!named[account]) await nameAccount(account, `Trading 212 ${type}`, database)
  }
}
