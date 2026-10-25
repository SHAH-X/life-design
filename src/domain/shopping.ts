// Shopping (2026-10-25): the receipts in your photos and what was spent, all worked out on the phone. Ask's
// spend_by_shop gives these totals as they are, so Ask and the Shopping tab can't disagree. Money stays in pence (minor
// units), so sums are exact, and pounds and euros are never added together.
import type { Entry, PhotoRef } from '../db/types'
import { readReceipt, type Receipt } from './receipts'

/** A receipt in a photo of a finished entry. Its id is the photo's; its date is the receipt's, else the entry's. */
export interface KnownReceipt extends Omit<Receipt, 'date'> {
  id: string
  entryId: string
  date: string
}

/** A photo's receipt: as your AI read it when it did (v0.18), else as the phone read it. Whether its items add up is
 *  the phone's to say, from the numbers. */
function receiptOf(photo: PhotoRef): Receipt | null {
  const ai = photo.ai?.receipt
  if (ai) {
    const sum = ai.items.reduce((s, item) => s + item.price, 0)
    const phone = photo.text ? readReceipt(photo.text) : null
    return { shop: ai.shop || phone?.shop || '', date: ai.date ?? phone?.date ?? null, items: ai.items, total: ai.total, adds: ai.total === null || sum === ai.total, currency: ai.currency }
  }
  return photo.text ? readReceipt(photo.text) : null
}

export function receiptsOf(entries: readonly Entry[]): KnownReceipt[] {
  return entries
    .filter((e) => e.status !== 'draft')
    .flatMap((entry) =>
      (entry.photos ?? []).flatMap((photo) => {
        const receipt = receiptOf(photo)
        return receipt ? [{ ...receipt, id: photo.id, entryId: entry.id, date: receipt.date ?? entry.date }] : []
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Words that say which kind of branch, or that it's a company, not which shop: "Tesco Express" is Tesco. */
const BRANCH_WORDS = new Set(['express', 'extra', 'metro', 'local', 'superstore', 'superstores', 'supermarket', 'supermarkets', 'store', 'stores', 'food', 'ltd', 'limited', 'plc', 'inc', 'llc', 'uk', 'gb'])

/** UK chains whose names on receipts differ by more than a branch word, their companies' included ("J Sainsbury plc",
 *  "Marks & Spencer", "Wm Morrison"): a name starting with any of these words is that chain. */
const CHAINS: [key: string, starts: string[][]][] = [
  ['sainsburys', [['sainsburys'], ['sainsbury'], ['j', 'sainsbury'], ['j', 'sainsburys'], ['js', 'sainsbury']]],
  ['m&s', [['m&s'], ['m', '&', 's'], ['marks', '&', 'spencer'], ['marks', 'and', 'spencer']]],
  ['coop', [['coop'], ['co', 'op'], ['cooperative']]],
  ['morrisons', [['morrisons'], ['morrison'], ['wm', 'morrison'], ['wm', 'morrisons']]],
  ...['tesco', 'asda', 'aldi', 'lidl', 'waitrose', 'iceland'].map((chain): [string, string[][]] => [chain, [[chain]]]),
]

/** A shop's name as one key: "TESCO EXPRESS", "Tesco" and "Tesco Stores Ltd" are all "tesco", and a chain's other
 *  names are the chain ("J Sainsbury plc" is "sainsburys"). Otherwise the first word always stays ("Local Butcher"), so
 *  different shops stay apart ("Pizza Express", "Pizza Hut"); '' when there's no name. */
export function shopKey(name: string): string {
  const all = name.toLowerCase().replace(/['’`.-]/g, '').match(/[\p{L}\p{N}&]+/gu) ?? []
  const named = all[0] === 'the' && all.length > 1 ? all.slice(1) : all
  const chain = CHAINS.find(([, starts]) => starts.some((start) => start.every((word, i) => named[i] === word)))
  return chain ? chain[0] : named.filter((word, i) => i === 0 || !BRANCH_WORDS.has(word)).join(' ')
}

/** Pence as money, "£3.55" or "-£0.50". */
export const money = (minor: number, currency: string) => `${minor < 0 ? '-' : ''}${currency}${(Math.abs(minor) / 100).toFixed(2)}`

/** What a receipt counts for: its printed total, the amount paid, else its items' sum. */
export const paid = (r: KnownReceipt) => r.total ?? r.items.reduce((s, item) => s + item.price, 0)

/** Receipts' total, one per currency (pounds and euros are never added together). */
export function totalOf(receipts: readonly KnownReceipt[]): string | string[] {
  const byCurrency = new Map<string, number>()
  for (const r of receipts) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + paid(r))
  const totals = [...byCurrency].map(([currency, minor]) => money(minor, currency))
  return totals.length === 1 ? totals[0]! : totals
}

/** Items grouped by a key, in the order each key first comes. */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return [...groups.values()]
}

/** A shop's receipts: named as most of them print it (the shortest, if as many), with its other names. */
export function shopSpend(receipts: readonly KnownReceipt[]) {
  const names = groupBy(
    receipts.map((r) => r.shop.trim()),
    (name) => name.toLowerCase(),
  )
  const [shop = '', ...others] = names.sort((a, b) => b.length - a.length || a[0]!.length - b[0]!.length).map((same) => same[0]!)
  const notAddingUp = receipts.filter((r) => !r.adds).map((r) => r.id)
  return {
    shop: shop || null,
    ...(others.length ? { also_named: others } : {}),
    total: totalOf(receipts),
    receipt_ids: receipts.map((r) => r.id),
    ...(notAddingUp.length ? { not_adding_up: notAddingUp } : {}),
  }
}

/** Spending in each month, by shop: grouped and added here, so which receipts count is never the AI's choice. */
export function spendByShop(receipts: readonly KnownReceipt[]) {
  const byDate = [...receipts].sort((a, b) => a.date.localeCompare(b.date))
  return {
    total: byDate.length ? totalOf(byDate) : null,
    months: groupBy(byDate, (r) => r.date.slice(0, 7)).map((month) => ({
      month: month[0]!.date.slice(0, 7),
      total: totalOf(month),
      shops: groupBy(month, (r) => shopKey(r.shop))
        .map(shopSpend)
        .sort((a, b) => (a.shop === null ? 1 : b.shop === null ? -1 : a.shop.localeCompare(b.shop, 'en', { sensitivity: 'base' }))),
    })),
  }
}
