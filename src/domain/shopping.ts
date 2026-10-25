// Shopping (v0.19, 2026-10-25): the receipts in your photos and what was spent, all worked out on the phone. Ask's
// spend_by_shop gives these totals as they are, so Ask and the Shopping tab can't disagree. Money stays in pence (minor
// units), so sums are exact, and pounds and euros are never added together. Counts and amounts only: nothing averaged,
// rated or set as a limit (DECISIONS, "Never").
import { MIN_COUNT } from '../analysis/stats'
import type { Entry, PhotoRef } from '../db/types'
import { addMonths } from '../lib/dates'
import { chainOf, ITEM_KINDS, type ItemKind, type ReceiptItem, readReceipt, type Receipt, shopWords } from './receipts'

/** A receipt in a photo of a finished entry. Its id is the photo's; its date is the receipt's, else the entry's. */
export interface KnownReceipt extends Omit<Receipt, 'date'> {
  id: string
  entryId: string
  date: string
  /** False when no date was read on it, so it counts on its entry's day. */
  dated: boolean
  /** The AI that read it ("Gemini · gemini-2.5-flash"); null when the phone read it. */
  readBy: string | null
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
        const readBy = photo.ai?.receipt ? photo.ai.by : null
        return receipt ? [{ ...receipt, id: photo.id, entryId: entry.id, date: receipt.date ?? entry.date, dated: receipt.date !== null, readBy }] : []
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Words that say which kind of branch, or that it's a company, not which shop: "Tesco Express" is Tesco. */
const BRANCH_WORDS = new Set(['express', 'extra', 'metro', 'local', 'superstore', 'superstores', 'supermarket', 'supermarkets', 'store', 'stores', 'food', 'ltd', 'limited', 'plc', 'inc', 'llc', 'uk', 'gb'])

/** A shop's name as one key: "TESCO EXPRESS", "Tesco" and "Tesco Stores Ltd" are all "tesco", and a chain's other
 *  names are the chain ("J Sainsbury plc" is "sainsburys", `chainOf`). Otherwise the first word always stays ("Local
 *  Butcher"), so different shops stay apart ("Pizza Express", "Pizza Hut"); '' when there's no name. */
export function shopKey(name: string): string {
  return chainOf(name)?.key ?? shopWords(name).filter((word, i) => i === 0 || !BRANCH_WORDS.has(word)).join(' ')
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

// ---------- The Shopping tab: a month at a time ----------

/** Money in each currency, in pence, in the order each first comes. */
export type Amounts = { currency: string; minor: number }[]

function addTo(amounts: Amounts, currency: string, minor: number): void {
  const found = amounts.find((a) => a.currency === currency)
  if (found) found.minor += minor
  else amounts.push({ currency, minor })
}

/** What some receipts came to, one amount per currency. */
export function amountsOf(receipts: readonly KnownReceipt[]): Amounts {
  const amounts: Amounts = []
  for (const r of receipts) addTo(amounts, r.currency, paid(r))
  return amounts
}

/** "£15.97", "£15.97 and €7.30"; "nothing" when there's none. */
export function inWords(amounts: Amounts): string {
  return amounts.length ? amounts.map((a) => money(a.minor, a.currency)).join(' and ') : 'nothing'
}

/** The currency most receipts are in, for the chart's one scale; "£" when there are none. */
export function mainCurrency(receipts: readonly KnownReceipt[]): string {
  const counts = groupBy(receipts, (r) => r.currency).sort((a, b) => b.length - a.length)
  return counts[0]?.[0]?.currency ?? '£'
}

/** Pence in one currency. */
const inCurrency = (amounts: Amounts, currency: string) => amounts.find((a) => a.currency === currency)?.minor ?? 0

/** "2026-09" for "2026-10" and -1. */
export const shiftMonth = (month: string, by: number) => addMonths(`${month}-01`, by).slice(0, 7)

const inMonths = (r: KnownReceipt, first: string, last: string) => r.date.slice(0, 7) >= first && r.date.slice(0, 7) <= last

/** A shop's receipts in the month. */
export interface ShopLine {
  key: string
  /** As most of its receipts print it; null when none has a shop's name read. */
  name: string | null
  receipts: KnownReceipt[]
  spent: Amounts
}

/** The same thing at the same shop, at its price before and now. */
export interface PriceChange {
  name: string
  shop: string
  before: { price: number; receipt: KnownReceipt }
  now: { price: number; receipt: KnownReceipt }
}

/** Something on 3 or more receipts. */
export interface Repeat {
  name: string
  receipts: KnownReceipt[]
  spent: Amounts
}

export interface ToCheck {
  receipt: KnownReceipt
  why: string[]
}

/** The month's items of one kind, at their prices: before offers, which have a line of their own. */
export interface KindLine {
  kind: ItemKind
  items: { item: ReceiptItem; receipt: KnownReceipt }[]
  spent: Amounts
}

export interface Kinds {
  /** Kinds with MIN_COUNT items or more, most spent first; the rest in the list's own order, never ranked. */
  ranked: KindLine[]
  others: KindLine[]
  /** Items with no kind: the phone read their receipt, or your AI did before kinds (v0.19). */
  notSorted: { items: number; receipts: KnownReceipt[]; spent: Amounts } | null
}

export interface ShoppingMonth {
  month: string
  receipts: KnownReceipt[]
  spent: Amounts
  /** The month before, up to the same day: only for the month you're in, when that month has receipts. */
  before: { until: string; receipts: KnownReceipt[]; spent: Amounts } | null
  /** Shops with MIN_COUNT receipts or more, most spent first; the rest by name, never ranked. */
  shops: { ranked: ShopLine[]; others: ShopLine[] }
  /** Savings printed on the receipts (negative items), as amounts off. */
  offers: { saved: Amounts; receipts: KnownReceipt[] }
  /** Receipts under £10, when there are MIN_COUNT or more. */
  small: { receipts: KnownReceipt[]; spent: Amounts } | null
  priceChanges: PriceChange[]
  repeats: Repeat[]
  toCheck: ToCheck[]
  /** Null when no item in the month has a kind. */
  kinds: Kinds | null
}

/** Below this a receipt is a small shop: £10, in pence. */
export const SMALL_SHOP = 1000
/** Price changes look back over this many months, the month itself included. */
const PRICE_MONTHS = 6
/** Bought again and again looks back over this many months. */
const REPEAT_MONTHS = 3
/** Sold by weight: a different weight isn't a different price, so these are left out of price changes. */
const WEIGHED = /\d\s*kg\b|\/\s*kg\b|\bper\s+kg\b|\bkg\s*@/i

const itemKey = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim()

/** Price changes whose latest purchase is in the month: the same printed name, at the same shop, in the same
 *  quantity, against the last time it cost something else. A name seen at two prices on one receipt is two things
 *  (two sizes printed alike), so it's left out. */
function priceChanges(receipts: readonly KnownReceipt[], month: string): PriceChange[] {
  type Bought = { name: string; price: number; receipt: KnownReceipt }
  const bought = new Map<string, Bought[]>()
  for (const receipt of receipts) {
    const shop = shopKey(receipt.shop)
    if (!shop) continue
    for (const item of receipt.items) {
      if (item.price <= 0 || WEIGHED.test(item.name)) continue
      const key = [shop, itemKey(item.name), item.quantity, receipt.currency].join('|')
      bought.set(key, [...(bought.get(key) ?? []), { name: item.name, price: item.price, receipt }])
    }
  }
  const changes: PriceChange[] = []
  for (const all of bought.values()) {
    const ambiguous = groupBy(all, (b) => b.receipt.id).some((same) => new Set(same.map((b) => b.price)).size > 1)
    if (ambiguous) continue
    const byDate = [...all].sort((a, b) => a.receipt.date.localeCompare(b.receipt.date))
    const now = byDate.at(-1)!
    if (now.receipt.date.slice(0, 7) !== month) continue
    const before = byDate.findLast((b) => b.price !== now.price)
    if (!before) continue
    const shop = shopSpend(all.map((b) => b.receipt)).shop ?? now.receipt.shop
    changes.push({ name: now.name, shop, before: { price: before.price, receipt: before.receipt }, now: { price: now.price, receipt: now.receipt } })
  }
  return changes.sort((a, b) => b.now.receipt.date.localeCompare(a.now.receipt.date) || a.name.localeCompare(b.name))
}

/** What's on MIN_COUNT or more receipts, by its printed name, most receipts first. */
function repeats(receipts: readonly KnownReceipt[], currency: string): Repeat[] {
  const on = new Map<string, { name: string; receipts: KnownReceipt[]; spent: Amounts }>()
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      if (item.price <= 0) continue
      const key = itemKey(item.name)
      const found = on.get(key) ?? { name: item.name, receipts: [], spent: [] }
      if (!found.receipts.includes(receipt)) found.receipts.push(receipt)
      found.name = item.name
      addTo(found.spent, receipt.currency, item.price)
      on.set(key, found)
    }
  }
  return [...on.values()]
    .filter((r) => r.receipts.length >= MIN_COUNT)
    .sort((a, b) => b.receipts.length - a.receipts.length || inCurrency(b.spent, currency) - inCurrency(a.spent, currency) || a.name.localeCompare(b.name))
}

/** The month's items by kind; null when none has one. */
function kindsOf(receipts: readonly KnownReceipt[], currency: string): Kinds | null {
  const bought = receipts.flatMap((receipt) => receipt.items.filter((item) => item.price > 0).map((item) => ({ item, receipt })))
  const lines = ITEM_KINDS.map((kind): KindLine => {
    const items = bought.filter((b) => b.item.kind === kind)
    const spent: Amounts = []
    for (const b of items) addTo(spent, b.receipt.currency, b.item.price)
    return { kind, items, spent }
  }).filter((line) => line.items.length > 0)
  if (lines.length === 0) return null
  const ranked = lines.filter((line) => line.items.length >= MIN_COUNT).sort((a, b) => inCurrency(b.spent, currency) - inCurrency(a.spent, currency))
  const unsorted = bought.filter((b) => !b.item.kind)
  const spent: Amounts = []
  for (const b of unsorted) addTo(spent, b.receipt.currency, b.item.price)
  return {
    ranked,
    others: lines.filter((line) => !ranked.includes(line)),
    notSorted: unsorted.length ? { items: unsorted.length, receipts: [...new Set(unsorted.map((b) => b.receipt))], spent } : null,
  }
}

/** Everything the Shopping tab says about one month ("2026-10"), on `today`. */
export function shoppingMonth(all: readonly KnownReceipt[], month: string, today: string): ShoppingMonth {
  const receipts = all.filter((r) => r.date.slice(0, 7) === month)
  const currency = mainCurrency(receipts)
  const lastMonth = shiftMonth(month, -1)
  const until = addMonths(today, -1)
  const lastMonths = all.filter((r) => r.date.slice(0, 7) === lastMonth)
  const before = today.slice(0, 7) === month && lastMonths.length ? lastMonths.filter((r) => r.date <= until) : null

  const shopLines = groupBy(receipts, (r) => shopKey(r.shop)).map((same): ShopLine => ({ key: shopKey(same[0]!.shop), name: shopSpend(same).shop, receipts: same, spent: amountsOf(same) }))
  const ranked = shopLines.filter((s) => s.name !== null && s.receipts.length >= MIN_COUNT).sort((a, b) => inCurrency(b.spent, currency) - inCurrency(a.spent, currency))
  const others = shopLines.filter((s) => !ranked.includes(s)).sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })))

  const saved: Amounts = []
  for (const r of receipts) for (const item of r.items) if (item.price < 0) addTo(saved, r.currency, -item.price)
  const small = receipts.filter((r) => r.currency === '£' && paid(r) > 0 && paid(r) < SMALL_SHOP)

  return {
    month,
    receipts,
    spent: amountsOf(receipts),
    before: before ? { until, receipts: before, spent: amountsOf(before) } : null,
    shops: { ranked, others },
    offers: { saved, receipts: receipts.filter((r) => r.items.some((item) => item.price < 0)) },
    small: small.length >= MIN_COUNT ? { receipts: small, spent: amountsOf(small) } : null,
    priceChanges: priceChanges(
      all.filter((r) => inMonths(r, shiftMonth(month, -(PRICE_MONTHS - 1)), month)),
      month,
    ),
    repeats: repeats(
      all.filter((r) => inMonths(r, shiftMonth(month, -(REPEAT_MONTHS - 1)), month)),
      currency,
    ),
    toCheck: receipts
      .map((receipt) => ({
        receipt,
        why: [
          receipt.adds ? '' : "its items don't add up to its total",
          shopKey(receipt.shop) ? '' : 'no shop read',
          receipt.dated ? '' : 'no date read, so it counts on the day you added it',
        ].filter(Boolean),
      }))
      .filter((c) => c.why.length > 0),
    kinds: kindsOf(receipts, currency),
  }
}

/** A month on the chart: pence in the chart's one currency, and every amount for the table. */
export interface MonthTotal {
  month: string
  receipts: number
  minor: number
  spent: Amounts
}

/** The `count` months up to `last`, oldest first, in the currency most receipts are in. */
export function monthTotals(all: readonly KnownReceipt[], last: string, count: number): { currency: string; months: MonthTotal[] } {
  const currency = mainCurrency(all)
  const months = Array.from({ length: count }, (_, i) => shiftMonth(last, i - count + 1)).map((month) => {
    const receipts = all.filter((r) => r.date.slice(0, 7) === month)
    const spent = amountsOf(receipts)
    return { month, receipts: receipts.length, minor: inCurrency(spent, currency), spent }
  })
  return { currency, months }
}

/** The months with receipts, newest first. */
export function shoppingMonths(all: readonly KnownReceipt[]): string[] {
  return [...new Set(all.map((r) => r.date.slice(0, 7)))].sort().reverse()
}
