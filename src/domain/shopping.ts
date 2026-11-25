// Shopping (v0.19, 2026-10-25): the receipts in your photos and what was spent, all worked out on the phone. Ask's
// spend_by_shop gives these totals as they are, so Ask and Money’s receipts can’t disagree. Money stays in pence (minor
// units), so sums are exact, and pounds and euros are never added together. Counts and amounts only: nothing averaged,
// rated or set as a limit (DECISIONS, "Never").
import { money } from '../lib/money'
import { MIN_COUNT } from '../analysis/stats'
import type { Entry, ItemChange, PhotoRef } from '../db/types'
import { addMonths } from '../lib/dates'
import { notReadYet } from './aiReading'
import { type CardPaid, chainOf, dateIn, isRefundSlip, ITEM_KINDS, type ItemKind, itemShown, joinParts, paidFor, paymentOf, type ReceiptItem, readReceipt, type Receipt, receiptTime, shopWords } from './receipts'

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
  /** Its items don't add up to its printed total and you haven't said to count it (step 1, 2026-11-23): it is in `held`,
   *  counted nowhere, until you approve it. */
  held?: true
  /** Its items don't add up, and you said to count it for these figures. */
  approved?: true
}

/** A long receipt's later part (v0.27.0), read with its first photo, while that's still in the entry. */
export const readWithFirst = (photo: PhotoRef, photos: readonly PhotoRef[]) => Boolean(photo.partOf && photos.some((p) => p.id === photo.partOf))

/** A receipt taken in parts (v0.27.0): its first photo, with its parts' text joined to its own, as the phone read them. */
function withParts(photo: PhotoRef, photos: readonly PhotoRef[]): PhotoRef {
  const parts = photos.filter((p) => p.partOf === photo.id)
  return parts.length ? { ...photo, text: joinParts([photo.text ?? '', ...parts.map((p) => p.text ?? '')]) } : photo
}

/** A photo's receipt: as your AI read it when it did (v0.18), else as the phone read it. Whether its items add up is
 *  the phone's to say, from the numbers. */
function receiptOf(photo: PhotoRef, remembered: Remembered, itemFor: NamesFiled): Receipt | null {
  const reading = readOf(photo)
  if (!reading) return null
  // Your corrections lie over the reading (step 2): its shop, day and total, each item's name, price and quantity, items
  // taken off, and items added. The reading itself is never changed; with none of these, the receipt is as it was.
  const fix = photo.fix
  const corrected = Boolean(fix || photo.extra?.length || photo.items?.some((c) => c.name !== undefined || c.price !== undefined || c.quantity !== undefined || c.removed))
  const read: Receipt = { ...reading, shop: fix?.shop?.trim() || reading.shop, date: fix?.date ?? reading.date, total: fix?.total !== undefined ? fix.total : reading.total }
  const keys = itemKeys(reading.items)
  const kept = withRemembered(reading.items, read.shop, remembered, itemFor)
  const gone = new Set((photo.items ?? []).filter((c) => c.removed).map((c) => c.key))
  const added = (photo.extra ?? []).map((e, i) => ({ name: e.name, price: e.price, quantity: e.quantity, key: `added#${i + 1}` }))
  const edited = (photo.items?.length ? withChanges(kept, photo.items) : kept).map((item, i) => ({ ...item, key: keys[i]! }))
  const text = photo.ai?.text || photo.text || ''
  if (corrected) read.edited = true
  if (read.refund) {
    const changed = [...edited.filter((item) => !gone.has(item.key)), ...added]
    return { ...asMoneyBack(read, changed), ...(corrected ? { edited: true as const } : {}), ...(backToGiftCard(text) ? { giftCard: true as const } : {}) }
  }
  // Offers are joined to their items first and an item is taken off afterwards, so its offer goes with it (audit 2026-11-23: a saving row
  // was left behind, and a receipt that added up was held back after a correction).
  const items = [...withSavings(edited, text).filter((item) => !gone.has(item.key ?? '')), ...added]
  // Whether the items reach the total is the phone's to say, from the numbers: what was paid, again after a correction.
  if (corrected) read.adds = read.total === null || items.reduce((s, item) => s + paidFor(item), 0) === read.total
  return { ...read, items, ...paidIn(photo, read.total ?? items.reduce((s, item) => s + paidFor(item), 0)) }
}

/** How a receipt was paid: the card (v0.24.0) and what went on a gift card (v0.24.1, never more than its total), each as
 *  your AI wrote its text out, else as the phone read it. */
function paidIn(photo: PhotoRef, total: number): { card?: CardPaid; byGiftCard?: number } {
  const [ai, phone] = [paymentOf(photo.ai?.text ?? ''), paymentOf(photo.text ?? '')]
  const card = ai.card ?? phone.card
  const gift = Math.min(ai.byGiftCard ?? phone.byGiftCard ?? 0, Math.max(total, 0))
  return { ...(card ? { card } : {}), ...(gift > 0 ? { byGiftCard: gift } : {}) }
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

/** The date your AI gave, checked against the dates printed on the receipt (owner, 2026-11-25: "24.11.26" was read as 26 Nov 2024, so two
 *  receipts sat two years back, in a month nothing listed). Printed dates are read day first (`dateIn`). Only the fault seen is mended: an AI
 *  date that is a printed date with its day and year swapped becomes the printed one (AI's own text first, then the phone's). Any other date
 *  stands, even one that is not printed: the AI may have good reason, and a guess here would count a receipt on the wrong day. */
function checkedDate(date: string | null, texts: readonly string[], us: boolean): string | null {
  if (!date) return date
  const swapped = (d: string) => `20${d.slice(8)}-${d.slice(5, 7)}-${d.slice(2, 4)}`
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const printed = dateIn(line, us)
      if (printed && swapped(printed) === date) return printed
    }
  }
  return date
}

function readOf(photo: PhotoRef): Receipt | null {
  const ai = photo.ai?.receipt
  if (ai) {
    const sum = ai.items.reduce((s, item) => s + item.price, 0)
    const phone = photo.text ? readReceipt(photo.text) : null
    const refund = isRefundSlip(`${photo.ai?.text ?? ''}\n${photo.text ?? ''}`, ai.items) || Boolean(phone?.refund)
    return { shop: ai.shop || phone?.shop || '', date: checkedDate(ai.date, [photo.ai?.text ?? '', photo.text ?? ''], ai.currency === '$') ?? phone?.date ?? null, items: ai.items, total: ai.total, adds: ai.total === null || sum === ai.total, currency: ai.currency, ...(refund ? { refund: true as const } : {}), ...(ai.points ? { points: ai.points } : {}) }
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
    return {
      ...item,
      ...(change.kind ? { kind: change.kind } : {}),
      ...(change.name ? { name: change.name, plain: change.name } : {}),
      ...(change.price !== undefined ? { price: change.price } : {}),
      ...(change.quantity ? { quantity: change.quantity } : {}),
      ...(change.returned && item.price > 0 ? { returned: true as const } : {}),
    }
  })
}

/** What a receipt shows, for noting what a correction changed (step 2). */
export interface ReceiptSnapshot {
  shop: string
  date: string
  total: number | null
  items: { name: string; price: number; quantity: number }[]
}

/** What changed between two snapshots of a receipt, one line each, for the note kept of a correction: the shop, the day, the
 *  total, then each item taken off, changed or added. Items are paired by name, in order. Nothing changed: no lines. */
export function receiptChanges(before: ReceiptSnapshot, after: ReceiptSnapshot, currency: string): string[] {
  const lines: string[] = []
  if (before.shop !== after.shop) lines.push(`Shop ${before.shop || 'none'} → ${after.shop || 'none'}`)
  if (before.date !== after.date) lines.push(`Day ${before.date} → ${after.date}`)
  if (before.total !== after.total) lines.push(`Total ${before.total === null ? 'none' : money(before.total, currency)} → ${after.total === null ? 'none' : money(after.total, currency)}`)
  const later = [...after.items]
  for (const item of before.items) {
    const at = later.findIndex((other) => other.name === item.name)
    if (at < 0) {
      lines.push(`Removed ${item.name} ${money(item.price, currency)}`)
      continue
    }
    const [other] = later.splice(at, 1)
    if (other!.price !== item.price || other!.quantity !== item.quantity) lines.push(`${item.name} ${money(item.price, currency)} → ${money(other!.price, currency)}${other!.quantity > 1 ? ` × ${other!.quantity}` : ''}`)
  }
  for (const item of later) lines.push(`Added ${item.name} ${money(item.price, currency)}`)
  return lines
}

/** A receipt added again, left out of every total (v0.19.5): a second upload of the same photo, or a new photo of the
 *  same receipt. `of` is the one counted, the first added. */
export interface ReceiptCopy {
  copy: KnownReceipt
  of: KnownReceipt
}

/** Whether you said to count this receipt for the figures it has now: a new reading with another total or other items
 *  isn't what you approved. */
const approvedNow = (photo: Pick<PhotoRef, 'approved'>, receipt: Pick<Receipt, 'total' | 'items'>): boolean =>
  photo.approved !== undefined && photo.approved.total === approvalOf(receipt).total && photo.approved.sum === approvalOf(receipt).sum

/** The figures an approval is for: the printed total and the items' sum, as the receipt shows them now. */
export const approvalOf = (receipt: Pick<Receipt, 'total' | 'items'>): { total: number | null; sum: number } => ({ total: receipt.total, sum: receipt.items.reduce((s, item) => s + item.price, 0) })

/** The receipts in finished entries, oldest first, each counted once (`sameReceipt`), and the copies left out. Refund
 *  slips (v0.20.20) are kept apart in `refunds`, each listed once and counted nowhere: every sum, payment match, Ask and
 *  the spreadsheet read `receipts`. A receipt whose items don't add up to its printed total (step 1, 2026-11-23: never
 *  silently accept uncertain figures) is in `held`, not `receipts`, until you approve it for those figures. */
export function receiptsAndCopies(entries: readonly Entry[], remembered: Remembered = {}, itemFor: NamesFiled = {}): { receipts: KnownReceipt[]; copies: ReceiptCopy[]; refunds: KnownReceipt[]; held: KnownReceipt[] } {
  const added = entries
    .filter((e) => e.status !== 'draft')
    .sort((a, b) => a.createdAt - b.createdAt)
    .flatMap((entry) =>
      (entry.photos ?? []).flatMap((ref) => {
        if (readWithFirst(ref, entry.photos ?? [])) return []
        const photo = withParts(ref, entry.photos ?? [])
        const receipt = receiptOf(photo, remembered, itemFor)
        if (!receipt) return []
        const readBy = photo.ai?.receipt ? photo.ai.by : null
        const time = receiptTime(photo.ai?.text || photo.text || '', receipt.currency === '$')
        // Items that contradict the printed total. A total with no items read isn't contradicted: it is flagged, as before.
        const odd = !receipt.adds && !receipt.refund && receipt.items.length > 0
        const flag = odd ? (approvedNow(photo, receipt) ? { approved: true as const } : { held: true as const }) : {}
        return [{ receipt: { ...receipt, ...flag, id: photo.id, entryId: entry.id, entryDate: entry.date, date: receipt.date ?? entry.date, dated: receipt.date !== null, readBy }, time }]
      }),
    )
  const counted: typeof added = []
  const copies: ReceiptCopy[] = []
  for (const one of added) {
    const of = counted.find((first) => Boolean(first.receipt.refund) === Boolean(one.receipt.refund) && sameReceipt(first, one))
    if (of && !one.receipt.refund) copies.push({ copy: one.receipt, of: of.receipt })
    else if (!of) counted.push(one)
  }
  // A receipt read with no currency sign is in pounds, the app's own currency (owner, 2026-11-22: "£267.73 and 5.00 spent"). It is
  // done after the copies are found, since `sameReceipt` takes a missing sign as "could be either".
  const byDate = counted.map((c) => (c.receipt.currency ? c.receipt : { ...c.receipt, currency: '£' })).sort((a, b) => a.date.localeCompare(b.date))
  return { receipts: byDate.filter((r) => !r.refund && !r.held), copies, refunds: byDate.filter((r) => r.refund), held: byDate.filter((r) => !r.refund && r.held) }
}

/** The receipts in finished entries, oldest first, each counted once: what Shopping and Ask add up. */
export const receiptsOf = (entries: readonly Entry[], remembered: Remembered = {}): KnownReceipt[] => receiptsAndCopies(entries, remembered).receipts

/** How an entry of a receipt is listed in Today and Logs (v0.32.0): the shop and what it came to, and no text read from the
 *  photo. Null for anything else: words of your own, a draft, or photos that aren't receipts. */
export function entryReceipt(entry: Entry): { title: string; words: string } | null {
  const photos = entry.photos ?? []
  if (entry.status === 'draft' || entry.note.trim() || !photos.length) return null
  const { receipts, refunds, held } = receiptsAndCopies([entry])
  const all = [...receipts, ...held, ...refunds]
  if (all.length === 1) {
    const r = all[0]!
    const items = r.items.filter((item) => item.price >= 0).length
    const total = money(Math.abs(paid(r)), r.currency || '£')
    return { title: r.shop || 'Receipt', words: r.refund ? `Refund slip · ${total} back` : ['Receipt', total, items ? `${items} ${items === 1 ? 'item' : 'items'}` : '', r.held ? 'not counted yet' : ''].filter(Boolean).join(' · ') }
  }
  if (all.length > 1) {
    const currencies = new Set(all.map((r) => r.currency || '£'))
    const shops = [...new Set(all.map((r) => r.shop).filter(Boolean))]
    // What was spent, as Money counts it: a refund slip is shown and counted nowhere, so it is not taken off (audit 2026-11-20).
    const total = currencies.size === 1 && receipts.length ? money(receipts.reduce((sum, r) => sum + spentOn(r), 0), [...currencies][0]!) : ''
    return { title: `${all.length} receipts`, words: [...shops, total, refunds.length ? `${refunds.length} ${refunds.length === 1 ? 'refund' : 'refunds'}` : ''].filter(Boolean).join(' · ') }
  }
  // Added as a receipt and not read as one: waiting for a reading, or read and found to be no receipt (the foot of a long one).
  const flagged = photos.filter((p) => p.receipt && !readWithFirst(p, photos))
  if (!flagged.length) return null
  return { title: 'Receipt photo', words: flagged.some((p) => notReadYet(p)) ? 'Waiting to be read' : 'No items or total found' }
}

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

export { money }

/** What a receipt counts for: its printed total, the amount paid, else its items' sum. */
export const paid = (r: KnownReceipt) => r.total ?? r.items.reduce((s, item) => s + paidFor(item), 0)

/** What a bank shows for a receipt (v0.24.1): what was paid, less what went on a gift card. For matching a payment
 *  only: what was spent is still the whole receipt. */
export const onCard = (r: KnownReceipt) => Math.max(0, paid(r) - (r.byGiftCard ?? 0))

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
  // A currency that came to nothing is not an amount: a receipt read with no sign and no prices was "£260.23 and 0.00 spent"
  // (owner, 2026-11-20). When everything came to nothing, the first stays, so "£0.00" is still said.
  const some = amounts.filter((a) => a.minor !== 0)
  return some.length ? some : amounts.slice(0, 1)
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
  /** Held back from every sum until you approve it (step 1). */
  held?: boolean
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
  held: readonly KnownReceipt[] = [],
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
    toCheck: [...receipts, ...held.filter((r) => r.date.slice(0, 7) === month)]
      .map((receipt) => ({
        receipt,
        why: [
          receipt.adds || receipt.approved ? '' : "its items don't add up to its total",
          receipt.held ? 'not counted until you approve it' : '',
          shopKey(receipt.shop) ? '' : 'no shop read',
          receipt.dated || reviewedDates.has(receipt.id) ? '' : 'no date read',
        ].filter(Boolean),
        ...(receipt.held ? { held: true } : {}),
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
