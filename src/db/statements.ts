// Statements brought in (v0.20): a statement's accounts and lines (src/domain/statements.ts) kept on the phone, each
// line once. A statement that overlaps one already in adds only its new lines: a line is the same as one kept when its
// date, amount, printed balance and description are; two alike lines on one day both stay (their balances differ, or,
// with none printed, as many as one statement has).
import type { StatementAccount, StatementLine } from '../domain/statements'
import { db as defaultDb, type LifeDesignDB } from './db'
import { setSetting } from './repo'
import type { BankLine } from './types'
import { guardWrite } from './saveErrors'

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

/** The names you gave your accounts (owner, 2026-10-26), by the account as its statement names it: a setting, so it's
 *  in a backup. Shown by `accountNames` (src/domain/money.ts). */
export const ACCOUNT_NAMES = 'accountNames'

export const accountNamesOf = (setting: { value: unknown } | undefined): Record<string, string> => {
  const value = setting?.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
}

/** Gives an account your name for it; a blank name goes back to the bank's. */
export async function nameAccount(account: string, name: string, database: LifeDesignDB = defaultDb): Promise<void> {
  const { [account]: _, ...rest } = accountNamesOf(await database.settings.get(ACCOUNT_NAMES))
  await setSetting(ACCOUNT_NAMES, name.trim() ? { ...rest, [account]: name.trim() } : rest, database)
}

/** The names you gave payees you move money to (owner, 2026-10-26: a statement prints your own name, not which account), by the
 *  payee's key: a setting, so it's in a backup. Read with `accountNamesOf`; shown by `classify`. */
export const PAYEE_NAMES = 'payeeNames'

/** Gives a payee your name for it; a blank name goes back to the printed one. */
export async function namePayee(key: string, name: string, database: LifeDesignDB = defaultDb): Promise<void> {
  const { [key]: _, ...rest } = accountNamesOf(await database.settings.get(PAYEE_NAMES))
  await setSetting(PAYEE_NAMES, name.trim() ? { ...rest, [key]: name.trim() } : rest, database)
}

/** Takes an account out wholly (owner, 2026-10-26: a statement read wrongly): its lines, its statements and your name
 *  for it. Bringing its statements in again puts it back. */
export async function removeAccount(account: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.bankLines, database.statements, database.settings, async () => {
    await database.bankLines.where('account').equals(account).delete()
    await database.statements.where('account').equals(account).delete()
    await nameAccount(account, '', database)
    await markClosed(account, false, database)
  })
}

/** Accounts you've closed (owner, 2026-10-26): no statement is missing after their last. A setting, so in backups. */
export const CLOSED_ACCOUNTS = 'closedAccounts'

export async function markClosed(account: string, closed: boolean, database: LifeDesignDB = defaultDb): Promise<void> {
  const now = ownPayeesOf(await database.settings.get(CLOSED_ACCOUNTS))
  await setSetting(CLOSED_ACCOUNTS, closed ? [...new Set([...now, account])] : now.filter((a) => a !== account), database)
}

/** What each payee is for, as you chose it (owner, 2026-10-26), by the payee's key: a setting, so in backups. Read with
 *  `accountNamesOf`; used by `kindOf` (src/domain/money.ts). */
export const PAYEE_KINDS = 'payeeKinds'

/** Sets what a payee is for; null goes back to the guess. */
export async function setPayeeKind(key: string, kind: string | null, database: LifeDesignDB = defaultDb): Promise<void> {
  const { [key]: _, ...rest } = accountNamesOf(await database.settings.get(PAYEE_KINDS))
  await setSetting(PAYEE_KINDS, kind ? { ...rest, [key]: kind } : rest, database)
}

/** Your note on one payment ("Birthday present"), by the line's id (owner, 2026-10-26): a setting, so in backups. */
export const PAYMENT_NOTES = 'paymentNotes'

/** Keeps a payment's note; an empty one is taken away. */
export async function notePayment(lineId: string, note: string, database: LifeDesignDB = defaultDb): Promise<void> {
  const { [lineId]: _, ...rest } = accountNamesOf(await database.settings.get(PAYMENT_NOTES))
  await setSetting(PAYMENT_NOTES, note.trim() ? { ...rest, [lineId]: note.trim() } : rest, database)
}

/** Owner-reviewed receipt dates and payment links, kept on the phone and included in a backup. */
export const RECEIPT_REVIEWS = 'receiptReviews'

export interface ReceiptReviewState {
  acceptedDates: string[]
  paymentLinks: Record<string, string>
}

export function receiptReviewState(value: unknown): ReceiptReviewState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { acceptedDates: [], paymentLinks: {} }
  const record = value as Record<string, unknown>
  const payments = record.paymentLinks
  return {
    acceptedDates: Array.isArray(record.acceptedDates) ? record.acceptedDates.filter((id): id is string => typeof id === 'string') : [],
    paymentLinks:
      payments && typeof payments === 'object' && !Array.isArray(payments)
        ? Object.fromEntries(Object.entries(payments).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
        : {},
  }
}

async function updateReceiptReviews(update: (state: ReceiptReviewState) => ReceiptReviewState, database: LifeDesignDB): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.settings, async () => {
      const state = receiptReviewState((await database.settings.get(RECEIPT_REVIEWS))?.value)
      const value = update(state)
      await database.settings.put({ key: RECEIPT_REVIEWS, value, updatedAt: Date.now() })
    }),
  )
}

export async function acceptReceiptDate(receiptId: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await updateReceiptReviews(
    (state) => ({ ...state, acceptedDates: [...new Set([...state.acceptedDates, receiptId])] }),
    database,
  )
}

export async function matchReceiptPayment(
  receiptId: string,
  paymentId: string,
  validReceiptIds: ReadonlySet<string>,
  database: LifeDesignDB = defaultDb,
): Promise<void> {
  await updateReceiptReviews((state) => {
    const currentLinks = Object.fromEntries(Object.entries(state.paymentLinks).filter(([id]) => validReceiptIds.has(id)))
    const alreadyUsed = Object.entries(currentLinks).find(([id, linked]) => linked === paymentId && id !== receiptId)
    if (alreadyUsed) throw new Error('This payment is already linked to another receipt.')
    return { ...state, paymentLinks: { ...currentLinks, [receiptId]: paymentId } }
  }, database)
}

export async function unmatchReceiptPayment(receiptId: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await updateReceiptReviews((state) => {
    const { [receiptId]: _, ...paymentLinks } = state.paymentLinks
    return { ...state, paymentLinks }
  }, database)
}
