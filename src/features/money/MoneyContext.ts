import { createContext, useContext } from 'react'
import type { MoneyLine, Payee, PayeeGroup } from '../../domain/money'
import type { KnownReceipt } from '../../domain/shopping'

/** What every list of payments in Money reads: card payments linked to their receipts (v0.20.2) and the receipt to open,
 *  the accounts' names, what you said payees are for (owner, 2026-10-26), and how
 *  to open a payment, a payee's kind or a payee's name. */
export interface MoneyContextValue {
  links: ReadonlyMap<string, KnownReceipt>
  receiptReasons: Readonly<Record<string, string>>
  open: (r: KnownReceipt) => void
  names: ReadonlyMap<string, string>
  kinds: Readonly<Record<string, string>>
  /** `group` is given where the payment stands for its whole payee (a payee paid once), so its sheet can say it's you moving money. */
  openPayment: (line: MoneyLine, way: string, group?: PayeeGroup) => void
  openKind: (group: PayeeGroup) => void
  openRename: (payee: Payee) => void
  /** Opens "Bring in a statement". The sheet belongs to the screen, not to the part showing its button: the first statement
   *  brought in changes which part that is, and a sheet inside it closed before it said what came in. */
  importStatement: () => void
}

export const MoneyContext = createContext<MoneyContextValue>({
  links: new Map(),
  receiptReasons: {},
  open: () => {},
  names: new Map(),
  kinds: {},
  openPayment: () => {},
  openKind: () => {},
  openRename: () => {},
  importStatement: () => {},
})

export const useMoney = () => useContext(MoneyContext)
