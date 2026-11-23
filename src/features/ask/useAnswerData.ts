import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { ITEM_FOR_SETTING, ITEM_KINDS_SETTING } from '../../db/receiptItems'
import { ACCOUNT_NAMES, accountNamesOf, CLOSED_ACCOUNTS, OWN_PAYEES, ownPayeesOf, PAYEE_KINDS, PAYEE_NAMES, PAYMENT_NAMES, PAYMENT_NOTES } from '../../db/statements'
import type { AnswerData } from '../../domain/answers'
import { accountNames, classify, labelsOf } from '../../domain/money'
import { productViews } from '../../domain/products'
import { receiptsAndCopies, rememberedKindsOf, rememberedNamesOf } from '../../domain/shopping'
import { toDateKey } from '../../lib/dates'

/** What the quick answers and Today's quiet line are worked out from (step 6): your statements as Money reads them, your receipts, bills,
 *  documents and products. Read on the phone; undefined while loading. */
export function useAnswerData(): AnswerData | undefined {
  return useLiveQuery(loadAnswerData, [])
}

/** The same, worked out once when the screen opens and not again as the database changes: for Today, where a background save of what you are
 *  writing must not re-read every statement and receipt (audit 2026-11-23, not measured on a phone). */
export function useAnswerDataOnce(): AnswerData | undefined {
  const [data, setData] = useState<AnswerData | undefined>(undefined)
  useEffect(() => {
    let live = true
    void loadAnswerData().then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [])
  return data
}

async function loadAnswerData(): Promise<AnswerData> {
  {
    const [bankLines, statements, entries, bills, docs, records, own, closed, payeeNames, paymentNames, notes, kinds, accountSetting, remembered, itemFor] = await Promise.all([
      db.bankLines.toArray(),
      db.statements.toArray(),
      db.entries.toArray(),
      db.bills.toArray(),
      db.documents.toArray(),
      db.products.toArray(),
      db.settings.get(OWN_PAYEES),
      db.settings.get(CLOSED_ACCOUNTS),
      db.settings.get(PAYEE_NAMES),
      db.settings.get(PAYMENT_NAMES),
      db.settings.get(PAYMENT_NOTES),
      db.settings.get(PAYEE_KINDS),
      db.settings.get(ACCOUNT_NAMES),
      db.settings.get(ITEM_KINDS_SETTING),
      db.settings.get(ITEM_FOR_SETTING),
    ])
    const lines = classify(bankLines, new Set(ownPayeesOf(own)), accountNamesOf(payeeNames), labelsOf(accountNamesOf(notes), accountNamesOf(paymentNames)))
    const { receipts, held } = receiptsAndCopies(entries, rememberedKindsOf(remembered?.value), rememberedNamesOf(itemFor?.value))
    const names = accountNames([...new Set(statements.map((s) => s.account))].sort(), accountNamesOf(accountSetting))
    return {
      today: toDateKey(new Date()),
      lines,
      statements,
      closed: new Set(ownPayeesOf(closed)),
      kinds: accountNamesOf(kinds),
      bills,
      docs,
      products: productViews(receipts, records),
      heldReceipts: held.length,
      accountName: (account) => names.get(account) ?? account,
    }
  }
}
