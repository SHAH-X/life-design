import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { ACCOUNT_NAMES, accountNamesOf } from '../../db/statements'
import { accountNames } from '../../domain/money'

/** Each account brought in, by the name it's shown by (yours, else its bank's): undefined while loading. */
export function useAccountNames(): ReadonlyMap<string, string> | undefined {
  return useLiveQuery(async () => {
    const [statements, setting] = await Promise.all([db.statements.toArray(), db.settings.get(ACCOUNT_NAMES)])
    return accountNames([...new Set(statements.map((s) => s.account))].sort(), accountNamesOf(setting))
  }, [])
}
