// Statements brought in (v0.20): a statement's accounts and lines (src/domain/statements.ts) kept on the phone, each
// line once. A statement that overlaps one already in adds only its new lines: a line is the same as one kept when its
// date, amount, printed balance and description are; two alike lines on one day both stay (their balances differ, or,
// with none printed, as many as one statement has).
import type { StatementAccount, StatementLine } from '../domain/statements'
import { db as defaultDb, type LifeDesignDB } from './db'
import { setSetting } from './repo'
import type { BankLine } from './types'

/** What a statement brought in, account by account. */
export interface BroughtIn {
  account: string
  from: string
  to: string
  added: number
  already: number
  /** Lines whose printed balance doesn't follow from the line before: misreads, to check. */
  notAdding: number
}

const sameAs = (line: Pick<StatementLine, 'date' | 'amount' | 'balance' | 'description'>) =>
  [line.date, line.amount, line.balance ?? '', line.description.toLowerCase().replace(/\s+/g, ' ').trim()].join('|')

export async function bringInStatement(accounts: readonly StatementAccount[], database: LifeDesignDB = defaultDb, now: number = Date.now()): Promise<BroughtIn[]> {
  return database.transaction('rw', database.bankLines, database.statements, async () => {
    const brought: BroughtIn[] = []
    for (const statement of accounts) {
      const kept = new Map<string, number>()
      for (const line of await database.bankLines.where('account').equals(statement.account).toArray()) kept.set(sameAs(line), (kept.get(sameAs(line)) ?? 0) + 1)
      const seen = new Map<string, number>()
      const added: BankLine[] = []
      for (const line of statement.lines) {
        const key = sameAs(line)
        seen.set(key, (seen.get(key) ?? 0) + 1)
        if (seen.get(key)! > (kept.get(key) ?? 0)) added.push({ id: crypto.randomUUID(), account: statement.account, ...line, createdAt: now, updatedAt: now })
      }
      await database.bankLines.bulkPut(added)
      const id = `${statement.account}:${statement.from}:${statement.to}`
      const before = await database.statements.get(id)
      await database.statements.put({ id, account: statement.account, from: statement.from, to: statement.to, lines: statement.lines.length, createdAt: before?.createdAt ?? now, updatedAt: now })
      brought.push({
        account: statement.account,
        from: statement.from,
        to: statement.to,
        added: added.length,
        already: statement.lines.length - added.length,
        notAdding: statement.lines.filter((l) => !l.adds).length,
      })
    }
    return brought
  })
}

/** Payees you marked as your own account (v0.20): their lines are money moved, left out of money in and out
 *  (src/domain/money.ts). A setting, so it's in a backup. */
export const OWN_PAYEES = 'ownPayees'

export const ownPayeesOf = (setting: { value: unknown } | undefined): string[] =>
  Array.isArray(setting?.value) ? setting.value.filter((key): key is string => typeof key === 'string') : []

export async function markOwnPayee(key: string, own: boolean, database: LifeDesignDB = defaultDb): Promise<void> {
  const now = ownPayeesOf(await database.settings.get(OWN_PAYEES))
  await setSetting(OWN_PAYEES, own ? [...new Set([...now, key])] : now.filter((k) => k !== key), database)
}
