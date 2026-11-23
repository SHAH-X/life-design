import type { Product } from './types'
import { db as defaultDb, type LifeDesignDB } from './db'
import { guardWrite } from './saveErrors'

// What you say about a product (step 3, 2026-11-23): list it as regular, say another shop's item is the same, or is not. Each is
// read and written in one transaction. A product you only look at has no record; one is made when you first say something.

/** The product as the screen has it: its record's id (or its one key, when it has no record) and its keys. */
export interface ProductRef {
  id: string
  members: string[]
}

const now = () => Date.now()

/** The record for a product: by its id, else by any of its keys, else none. */
async function recordOf(ref: ProductRef, database: LifeDesignDB): Promise<Product | undefined> {
  return (await database.products.get(ref.id)) ?? (await database.products.where('members').anyOf(ref.members).first())
}

const unique = (list: readonly string[]) => [...new Set(list)]

/** Lists a product as regular, or not. A record with nothing left to say is removed. */
export async function listProduct(ref: ProductRef, regular: boolean, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.products, async () => {
      const record = await recordOf(ref, database)
      if (!record) {
        if (regular) await database.products.add({ id: crypto.randomUUID(), members: unique(ref.members), notSame: [], regular: true, createdAt: now(), updatedAt: now() })
        return
      }
      const next = { ...record, regular, updatedAt: now() }
      if (!regular && next.members.length <= 1 && next.notSame.length === 0) await database.products.delete(record.id)
      else await database.products.put(next)
    }),
  )
}

/** Says the other keys are the same product as this one. A record the others were in is merged in; what you said is not the same
 *  of them is forgotten. */
export async function joinProduct(ref: ProductRef, other: readonly string[], database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.products, async () => {
      const mine = await recordOf(ref, database)
      const others = await database.products.where('members').anyOf([...other]).toArray()
      const merged = others.filter((r) => r.id !== mine?.id)
      const members = unique([...(mine?.members ?? ref.members), ...merged.flatMap((r) => r.members), ...other])
      const notSame = unique([...(mine?.notSame ?? []), ...merged.flatMap((r) => r.notSame)]).filter((k) => !members.includes(k))
      const regular = Boolean(mine?.regular) || merged.some((r) => r.regular)
      for (const r of merged) await database.products.delete(r.id)
      await database.products.put({ id: mine?.id ?? crypto.randomUUID(), members, notSame, regular, createdAt: mine?.createdAt ?? now(), updatedAt: now() })
    }),
  )
}

/** Says the other keys are not the same product as this one: it is not suggested again. */
export async function notSameProduct(ref: ProductRef, other: readonly string[], database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.products, async () => {
      const mine = await recordOf(ref, database)
      const notSame = unique([...(mine?.notSame ?? []), ...other])
      await database.products.put({ id: mine?.id ?? crypto.randomUUID(), members: mine?.members ?? unique(ref.members), notSame, regular: Boolean(mine?.regular), createdAt: mine?.createdAt ?? now(), updatedAt: now() })
    }),
  )
}

/** Takes one key out of a joined product: it is a product of its own again. */
export async function splitProduct(ref: ProductRef, key: string, database: LifeDesignDB = defaultDb): Promise<void> {
  await guardWrite(() =>
    database.transaction('rw', database.products, async () => {
      const mine = await recordOf(ref, database)
      if (!mine) return
      const members = mine.members.filter((k) => k !== key)
      if (members.length === 0 || (members.length === 1 && !mine.regular && mine.notSame.length === 0)) await database.products.delete(mine.id)
      else await database.products.put({ ...mine, members, updatedAt: now() })
    }),
  )
}
