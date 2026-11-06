// Shopping (v0.19, 2026-10-25): the receipts in your photos and what was spent, all worked out on the phone. Ask's
// spend_by_shop gives these totals as they are, so Ask and Money’s receipts can’t disagree. Money stays in pence (minor
// units), so sums are exact, and pounds and euros are never added together. Counts and amounts only: nothing averaged,
// rated or set as a limit (DECISIONS, "Never").
import { MIN_COUNT } from '../analysis/stats'
import type { Entry, ItemChange, PhotoRef } from '../db/types'
import { addMonths } from '../lib/dates'
import { type CardPaid, chainOf, isRefundSlip, ITEM_KINDS, type ItemKind, itemShown, paidFor, paymentOf, type ReceiptItem, readReceipt, type Receipt, receiptTime, shopWords } from './receipts'

/** A receipt in a photo of a finished entry. Its id is the photo's; its date is the receipt's, else the entry's. */
export interface KnownReceipt extends Omit<Receipt, 'date'> {
  id: string
  entryId: string
  /** Entry's own date, which can differ from the date printed on the receipt. */
  entryDate?: string
  date: string
  /** False when no date was read on it, so it counts on its entry's day. */
  dated: boolean
  /** The AI that read it ("Gemini · gemini-2.5-flash"); null when the phone read it. */
  readBy: string | null
}

/** A photo's receipt: as your AI read it when it did (v0.18), else as the phone read it. Whether its items add up is
 *  the phone's to say, from the numbers. */
function receiptOf(photo: PhotoRef, remembered: Remembered, itemFor: NamesFiled): Receipt | null {
  const read = readOf(photo)
  if (!read) return null
  const keys = itemKeys(read.items)
  const kept = withRemembered(read.items, read.shop, remembered, itemFor)
  const changed = (photo.items?.length ? withChanges(kept, photo.items) : kept).map((item, i) => ({ ...item, key: keys[i]! }))
  if (read.refund) return { ...asMoneyBack(read, changed), ...(backToGiftCard(photo.ai?.text || photo.text || '') ? { giftCard: true as const } : {}) }
  return { ...read, items: withSavings(changed, photo.ai?.text || photo.text || ''), ...cardIn(photo) }
}

/** The card a receipt was paid with (v0.24.0): as your AI wrote its text out, else as the phone read it. */
function cardIn(photo: PhotoRef): { card?: CardPaid } {
  const card = paymentOf(photo.ai?.text ?? '').card ?? paymentOf(photo.text ?? '').card
  return card ? { card } : {}
}

/** A refund slip's amounts as money back, plus figures whatever signs it was read with (the phone keeps its minus, an
 *  AI may not), so the two readings agree; never offers, and nothing on it is "returned" again. */
function asMoneyBack(read: Receipt, items: readonly ReceiptItem[]): Receipt {
  const back = items.map(({ returned: _, ...item }) => ({ ...item, price: Math.abs(item.price) }))
  const total = read.total === null ? null : Math.abs(read.total)
  const sum = back.reduce((s, item) => s + item.price, 0)
  return { ...read, items: back, total, adds: total === null || sum === total }
}

/** What a refund slip gave back: its printed total, else its items' sum (`asMoneyBack` made them plus figures). */
export const givenBack = (r: Pick<Receipt, 'total' | 'items'>) => r.total ?? r.items.reduce((s, item) => s + item.price, 0)

/** Whether a refund slip names a gift card after its total, where the money went back to. */
const backToGiftCard =(text: string) => /\btotal\b[\s\S]*\bgift\s*card\b/i.test(text)

/** "2 for £3.00", "2 FOR 3.00", "3 for €5": how many items, and what they cost together. "3 for 2" has no price in it
 *  (nor a currency sign or pence), so it isn't one. */
const MULTI_BUY = /(?<!\d)(\d+)\s*for\s*(?:[£$€]\s*(\d+(?:[.,]\d{1,2})?)|(\d+[.,]\d{2}))/i

/** What an offer row (a saving as its own row) says it is for (v0.20.40, owner 2026-11-01: a multi-buy offer showed only
 *  what it took off, and "the whole receipt"): "2 for £3.00" is for 2 items, and what they cost together; any other is
 *  for the whole receipt. */
export function offerWords(item: Pick<ReceiptItem, 'name' | 'plain'>, currency: string): string {
  const said = [itemShown(item as ReceiptItem), item.name].map((words) => words.match(MULTI_BUY)).find(Boolean)
  const count = said ? Number(said[1]) : 0
  if (!said || count < 2) return 'Offer on the whole receipt'
  const together = Math.round(Number((said[2] ?? said[3]!).replace(',', '.')) * 100)
  return `Offer on ${count} items: ${money(together, currency)} for ${count === 2 ? 'the pair' : `the ${count}`}`
}

/** A saving for the whole basket, never for the item printed before it. */
const BASKET_SAVING = /multi[\s-]?buy|meal\s*deal|\b\d+\s*for\b|bundle|mix\s*(?:&|and)?\s*match|staff|colleague|coupon|voucher/i
/** M&S prints the Sparks savings for the whole receipt after this line. */
const BALANCE_BEFORE_SAVING = /balance\s+before\s+sav/i

/** Each saving joined to the item printed just before it (v0.20.19, owner 2026-11-01: "it is just amount saved on that
 *  product"), so the item counts at what was paid. A saving stays a row of its own, an offer on the whole receipt,
 *  when it's for the basket (`BASKET_SAVING`, or anything after "Balance before saving"), or would take off more than
 *  its item cost. */
function withSavings(items: readonly ReceiptItem[], text: string): ReceiptItem[] {
  const basket = BALANCE_BEFORE_SAVING.test(text)
  const out: ReceiptItem[] = []
  let last: ReceiptItem | null = null
  for (const item of items) {
    if (item.price >= 0) {
      last = { ...item }
      out.push(last)
      continue
    }
    const off = -item.price
    if (!basket && last && !BASKET_SAVING.test(item.name) && (last.saving ?? 0) + off <= last.price) {
      last.saving = (last.saving ?? 0) + off
      continue
    }
    last = null
    out.push(item)
  }
  return out
}

function readOf(photo: PhotoRef): Receipt | null {
  const ai = photo.ai?.receipt
  if (ai) {
    const sum = ai.items.reduce((s, item) => s + item.price, 0)
    const phone = photo.text ? readReceipt(photo.text) : null
    const refund = isRefundSlip(`${photo.ai?.text ?? ''}\n${photo.text ?? ''}`, ai.items) || Boolean(phone?.refund)
    return { shop: ai.shop || phone?.shop || '', date: ai.date ?? phone?.date ?? null, items: ai.items, total: ai.total, adds: ai.total === null || sum === ai.total, currency: ai.currency, ...(refund ? { refund: true as const } : {}) }
  }
  return photo.text ? readReceipt(photo.text) : null
}

/** Each item's key for your changes (v0.20.18): its printed name and which time that name comes ("Oat milk#2"), so
 *  two alike are told apart, and a new reading of the same receipt finds them again. */
export function itemKeys(items: readonly Pick<ReceiptItem, 'name'>[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const n = (seen.get(item.name) ?? 0) + 1
    seen.set(item.name, n)
    return `${item.name}#${n}`
  })
}

/** The kinds you chose for an item at a shop (v0.20.37), by `rememberedKey`: they follow it on every receipt. */
export type Remembered = Readonly<Record<string, ItemKind>>

/** An item at a shop, for the kind you chose for it: the chain's name and the item's words, whatever the capitals and
 *  spaces ("Tesco Express" and "TESCO" are one shop; a shop prints an item the same way each time). */
export const rememberedKey = (shop: string, name: string): string => `${shopKey(shop)}|${itemKey(name)}`

/** What a stored setting says is remembered: only kinds from the list. */
export function rememberedKindsOf(value: unknown): Remembered {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, ItemKind] => (ITEM_KINDS as readonly string[]).includes(entry[1] as string)))
}

/** Who you filed items under (v0.20.39): the name, by `rememberedKey`; it follows an item at a shop on every receipt. */
export type NamesFiled = Readonly<Record<string, string>>

/** What a stored setting says is filed: only names, none blank. */
export function rememberedNamesOf(value: unknown): NamesFiled {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== ''))
}

/** Items with the kind you remembered for them at this shop laid over your AI's, and who you filed them under. A saving
 *  has neither to give. */
function withRemembered(items: readonly ReceiptItem[], shop: string, remembered: Remembered, itemFor: NamesFiled): ReceiptItem[] {
  if (!shop.trim() || (!Object.keys(remembered).length && !Object.keys(itemFor).length)) return [...items]
  return items.map((item) => {
    if (item.price <= 0) return item
    const key = rememberedKey(shop, item.name)
    const kind = remembered[key]
    const who = itemFor[key]
    return kind || who ? { ...item, ...(kind ? { kind } : {}), ...(who ? { forWho: who } : {}) } : item
  })
}

/** Items with your changes laid over: the kind you chose for this receipt wins over the one you remembered, and that
 *  over your AI's; a saving is never returned. */
function withChanges(items: readonly ReceiptItem[], changes: readonly ItemChange[]): ReceiptItem[] {
  const keys = itemKeys(items)
  return items.map((item, i) => {
    const change = changes.find((c) => c.key === keys[i])
    if (!change) return item
    return { ...item, ...(change.kind ? { kind: change.kind } : {}), ...(change.returned && item.price > 0 ? { returned: true as const } : {}) }
  })
}

/** A receipt added again, left out of every total (v0.19.5): a second upload of the same photo, or a new photo of the
 *  same receipt. `of` is the one counted, the first added. */
export interface ReceiptCopy {
  copy: KnownReceipt
  of: KnownReceipt
}

/** The receipts in finished entries, oldest first, each counted once (`sameReceipt`), and the copies left out. Refund
 *  slips (v0.20.20) are kept apart in `refunds`, each listed once and counted nowhere: every sum, payment match, Ask and
 *  the spreadsheet read `receipts`. */
export function receiptsAndCopies(entries: readonly Entry[], remembered: Remembered = {}, itemFor: NamesFiled = {}): { receipts: KnownReceipt[]; copies: ReceiptCopy[]; refunds: KnownReceipt[] } {
  const added = entries
    .filter((e) => e.status !== 'draft')
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((entry) =>
      (entry.photos ?? []).flatMap((photo) => {
        const receipt = receiptOf(photo, remembered, itemFor)
        if (!receipt) return []
        const readBy = photo.ai?.receipt ? photo.ai.by : null
        const time = receiptTime(photo.ai?.text || photo.text || '', receipt.currency === '$')
        return [{ receipt: { ...receipt, id: photo.id, entryId: entry.id, entryDate: entry.date, date: receipt.date ?? entry.date, dated: receipt.date !== null, readBy }, time }]
      }),
    )
  const counted: typeof added = []
  const copies: ReceiptCopy[] = []
  for (const one of added) {
    const of = counted.find((first) => Boolean(first.receipt.refund) === Boolean(one.receipt.refund) && sameReceipt(first, one))
    if (of && !one.receipt.refund) copies.push({ copy: one.receipt, of: of.receipt })
    else if (!of) counted.push(one)
  }
  const byDate = counted.map((c) => c.receipt).sort((a, b) => a.date.localeCompare(b.date))
  return { receipts: byDate.filter((r) => !r.refund), copies, refunds: byDate.filter((r) => r.refund) }
}

/** The receipts in finished entries, oldest first, each counted once: what Shopping and Ask add up. */
export const receiptsOf = (entries: readonly Entry[], remembered: Remembered = {}): KnownReceipt[] => receiptsAndCopies(entries, remembered).receipts

/** One receipt read twice: the same shop, date, total and item prices (whatever their names, as the phone and your AI
 *  write them differently), the same currency and till time when both show one, so two alike bought an hour apart stay
 *  two. */
function sameReceipt(a: { receipt: KnownReceipt; time: string | null }, b: { receipt: KnownReceipt; time: string | null }): boolean {
  const key = ({ receipt: r }: typeof a) => [shopKey(r.shop), r.date, paid(r), r.items.map((item) => item.price).sort((x, y) => x - y).join(',')].join('|')
  const alike = (x: string | null, y: string | null) => !x || !y || x === y
  return shopKey(a.receipt.shop) !== '' && key(a) === key(b) && alike(a.receipt.currency, b.receipt.currency) && alike(a.time, b.time)
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
export const paid = (r: KnownReceipt) => r.total ?? r.items.reduce((s, item) => s + paidFor(item), 0)

/** What its returned items came to (v0.20.18): what was paid for them, after offers (v0.20.19). */
export const returnedOn = (r: Pick<Receipt, 'items'>) => r.items.reduce((s, item) => s + (item.returned ? paidFor(item) : 0), 0)

/** What a receipt counts as spent: what was paid, less what was returned, never below nothing. Matching it to a card
 *  payment uses `paid`, which is what the bank was charged. */
export const spentOn = (r: KnownReceipt) => Math.max(0, paid(r) - returnedOn(r))

/** Receipts' total, one per currency (pounds and euros are never added together). */
export function totalOf(receipts: readonly KnownReceipt[]): string | string[] {
  const byCurrency = new Map<string, number>()
  for (const r of receipts) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + spentOn(r))
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

// ---------- Money’s receipts (the Shopping tab until v0.20): a month at a time ----------

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
  for (const r of receipts) addTo(amounts, r.currency, spentOn(r))
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
  /** The earlier receipt retained in totals when this receipt is a duplicate. */
  copyOf?: KnownReceipt
  possiblePayment?: boolean
}

/** The month's items of one kind, at what was paid for them: after the offers joined to them (v0.20.19). */
export interface KindLine {
  kind: ItemKind
  items: { item: ReceiptItem; receipt: KnownReceipt }[]
  spent: Amounts
}

/** Money in one name's items (v0.20.39), at what was paid. */
export interface ForLine {
  who: string
  items: { item: ReceiptItem; receipt: KnownReceipt }[]
  spent: Amounts
}
/** What was bought by who it was for: names with MIN_COUNT items or more, most spent first; the rest by name; what no
 *  name was given to apart, last. */
export interface ForItems {
  ranked: ForLine[]
  others: ForLine[]
  nobody: { items: { item: ReceiptItem; receipt: KnownReceipt }[]; spent: Amounts } | null
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
  /** Null until an item in the month is filed under a name (v0.20.39). */
  forWho: ForItems | null
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
 *  (two sizes printed alike), so it's left out. Each is named as your AI last took it (`itemShown`). */
function priceChanges(receipts: readonly KnownReceipt[], month: string): PriceChange[] {
  type Bought = { name: string; price: number; receipt: KnownReceipt }
  const bought = new Map<string, Bought[]>()
  for (const receipt of receipts) {
    const shop = shopKey(receipt.shop)
    if (!shop) continue
    for (const item of receipt.items) {
      if (item.price <= 0 || WEIGHED.test(item.name)) continue
      const key = [shop, itemKey(item.name), item.quantity, receipt.currency].join('|')
      bought.set(key, [...(bought.get(key) ?? []), { name: itemShown(item), price: item.price, receipt }])
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

/** What's on MIN_COUNT or more receipts, by its printed name (named as your AI last took it), most receipts first. */
function repeats(receipts: readonly KnownReceipt[], currency: string): Repeat[] {
  const on = new Map<string, { name: string; receipts: KnownReceipt[]; spent: Amounts }>()
  for (const receipt of receipts) {
    for (const item of receipt.items) {
      if (item.price <= 0) continue
      const key = itemKey(item.name)
      const found = on.get(key) ?? { name: itemShown(item), receipts: [], spent: [] }
      if (!found.receipts.includes(receipt)) found.receipts.push(receipt)
      found.name = itemShown(item)
      addTo(found.spent, receipt.currency, paidFor(item))
      on.set(key, found)
    }
  }
  return [...on.values()]
    .filter((r) => r.receipts.length >= MIN_COUNT)
    .sort((a, b) => b.receipts.length - a.receipts.length || inCurrency(b.spent, currency) - inCurrency(a.spent, currency) || a.name.localeCompare(b.name))
}

/** The month's items by who they were for, at what was paid; null until one is filed under a name. Returned items, and
 *  offers, are no more here than in By kind. */
function forWhoOf(receipts: readonly KnownReceipt[], currency: string): ForItems | null {
  const bought = receipts.flatMap((receipt) => receipt.items.filter((item) => item.price > 0 && !item.returned).map((item) => ({ item, receipt })))
  if (!bought.some((b) => b.item.forWho)) return null
  const spentOn = (these: typeof bought) => {
    const spent: Amounts = []
    for (const b of these) addTo(spent, b.receipt.currency, paidFor(b.item))
    return spent
  }
  const lines = [...new Set(bought.flatMap((b) => (b.item.forWho ? [b.item.forWho] : [])))].map((who): ForLine => {
    const items = bought.filter((b) => b.item.forWho === who)
    return { who, items, spent: spentOn(items) }
  })
  const rest = bought.filter((b) => !b.item.forWho)
  return {
    ranked: lines.filter((line) => line.items.length >= MIN_COUNT).sort((a, b) => inCurrency(b.spent, currency) - inCurrency(a.spent, currency)),
    others: lines.filter((line) => line.items.length < MIN_COUNT).sort((a, b) => a.who.localeCompare(b.who, 'en', { sensitivity: 'base' })),
    nobody: rest.length ? { items: rest, spent: spentOn(rest) } : null,
  }
}

/** The month's items by kind; null when none has one. */
function kindsOf(receipts: readonly KnownReceipt[], currency: string): Kinds | null {
  const bought = receipts.flatMap((receipt) => receipt.items.filter((item) => item.price > 0 && !item.returned).map((item) => ({ item, receipt })))
  const lines = ITEM_KINDS.map((kind): KindLine => {
    const items = bought.filter((b) => b.item.kind === kind)
    const spent: Amounts = []
    for (const b of items) addTo(spent, b.receipt.currency, paidFor(b.item))
    return { kind, items, spent }
  }).filter((line) => line.items.length > 0)
  if (lines.length === 0) return null
  const ranked = lines.filter((line) => line.items.length >= MIN_COUNT).sort((a, b) => inCurrency(b.spent, currency) - inCurrency(a.spent, currency))
  const unsorted = bought.filter((b) => !b.item.kind)
  const spent: Amounts = []
  for (const b of unsorted) addTo(spent, b.receipt.currency, paidFor(b.item))
  return {
    ranked,
    others: lines.filter((line) => !ranked.includes(line)),
    notSorted: unsorted.length ? { items: unsorted.length, receipts: [...new Set(unsorted.map((b) => b.receipt))], spent } : null,
  }
}

/** Everything Money’s receipts say about one month ("2026-10"), on `today`. */
export function shoppingMonth(
  all: readonly KnownReceipt[],
  month: string,
  today: string,
  copies: readonly ReceiptCopy[] = [],
  reviewedDates: ReadonlySet<string> = new Set(),
  possiblePaymentIds: ReadonlySet<string> = new Set(),
): ShoppingMonth {
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
  for (const r of receipts) for (const item of r.items) if (item.price < 0 || item.saving) addTo(saved, r.currency, item.saving ?? -item.price)
  const small = receipts.filter((r) => r.currency === '£' && spentOn(r) > 0 && spentOn(r) < SMALL_SHOP)

  return {
    month,
    receipts,
    spent: amountsOf(receipts),
    before: before ? { until, receipts: before, spent: amountsOf(before) } : null,
    shops: { ranked, others },
    offers: { saved, receipts: receipts.filter((r) => r.items.some((item) => item.price < 0 || item.saving)) },
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
          receipt.dated || reviewedDates.has(receipt.id) ? '' : 'no date read',
        ].filter(Boolean),
      }))
      .filter((c) => c.why.length > 0 || possiblePaymentIds.has(c.receipt.id))
      .map((c) => (possiblePaymentIds.has(c.receipt.id) ? { ...c, possiblePayment: true } : c))
      .concat(
        copies
          .filter((c) => c.copy.date.slice(0, 7) === month && c.copy.entryId !== c.of.entryId)
          .map((c) => ({ receipt: c.copy, why: ['duplicate'], copyOf: c.of })),
      ),
    kinds: kindsOf(receipts, currency),
    forWho: forWhoOf(receipts, currency),
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
