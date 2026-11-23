// What you paid for a product, at each shop (step 3, 2026-11-23, owner-approved plan): worked out on the phone from your
// receipts, never an AI. A product at a shop is what that shop prints for it (a chain's names as one shop); two shops' items are
// one product only when you said so ("Same product"), never because their names look alike. A price per litre or kilogram
// exists only where the receipt prints a size. What you paid is what you paid on that day: nothing here says what a shop
// charges now.

import type { Product } from '../db/types'
import { itemShown, type ReceiptItem } from './receipts'
import { type KnownReceipt, rememberedKey, shopKey, shopSpend } from './shopping'

export type UnitKind = 'kg' | 'litre' | 'each'

/** A size the receipt prints: grams, millilitres or a count, and what it is priced by. */
export interface Size {
  base: number
  kind: UnitKind
}

const NUM = String.raw`\d+(?:[.,]\d+)?`
/** "4 x 125g". */
const MULTI = new RegExp(String.raw`\b(\d{1,3})\s?x\s?(${NUM})\s?(kg|g|ml|cl|ltr|litres?|l)\b`, 'i')
/** "2.27L", "400g", "2PT", "33cl". "200mg" is not one: the unit must follow the number. */
const SIZE = new RegExp(String.raw`\b(${NUM})\s?(kg|g|ml|cl|ltr|litres?|pints?|pt|l)\b`, 'i')
/** "6PK", "4 pack", "4ct", "x6". */
const PACK = /\b(\d{1,3})\s?(?:pk|pack|ct)\b|\bx\s?(\d{1,3})\b/i
/** Priced by weight on the shelf ("0.65kg @ 7.00/kg"): its line is not a size to divide by. */
const BY_WEIGHT = /\/\s*kg\b|\bper\s+kg\b|\bkg\s*@|@\s*[£$€]?\d+(?:[.,]\d+)?\s*\/?\s*kg\b/i

const UNITS: Record<string, [kind: UnitKind, perUnit: number]> = {
  kg: ['kg', 1000],
  g: ['kg', 1],
  ml: ['litre', 1],
  cl: ['litre', 10],
  l: ['litre', 1000],
  ltr: ['litre', 1000],
  litre: ['litre', 1000],
  litres: ['litre', 1000],
  pt: ['litre', 568],
  pint: ['litre', 568],
  pints: ['litre', 568],
}

const amountOf = (s: string) => Number(s.replace(',', '.'))

/** The size an item's name prints, if it prints one: weight and volume first, then a count. */
export function sizeOf(name: string): Size | null {
  const multi = name.match(MULTI)
  if (multi) {
    const [kind, factor] = UNITS[multi[3]!.toLowerCase()]!
    return { kind, base: Number(multi[1]) * amountOf(multi[2]!) * factor }
  }
  const single = name.match(SIZE)
  if (single) {
    const [kind, factor] = UNITS[single[2]!.toLowerCase()]!
    return { kind, base: amountOf(single[1]!) * factor }
  }
  const pack = name.match(PACK)
  const count = Number(pack?.[1] ?? pack?.[2])
  return pack && count > 0 ? { kind: 'each', base: count } : null
}

/** What one kilogram, litre or item cost, in pence (not rounded): the line's price over its quantity, over its size. */
export interface UnitPrice {
  kind: UnitKind
  perUnit: number
}

export function unitPriceOf(item: ReceiptItem): UnitPrice | null {
  if (item.price <= 0 || BY_WEIGHT.test(item.name)) return null
  const size = sizeOf(item.name) ?? sizeOf(item.plain ?? '')
  if (!size) return null
  const each = item.price / Math.max(1, item.quantity)
  return { kind: size.kind, perUnit: size.kind === 'each' ? each / size.base : (each / size.base) * 1000 }
}

/** One time an item was bought: the shelf price (an offer is told apart, never taken off it). */
export interface Sighting {
  date: string
  receiptId: string
  entryId: string
  currency: string
  name: string
  /** The line's price and how many; `each` is one item's shelf price, in pence. */
  price: number
  quantity: number
  each: number
  /** What an offer took off the line, 0 for none. */
  saving: number
  unit: UnitPrice | null
}

/** One product as one shop prints it. */
export interface ShopLine {
  /** `rememberedKey`: the chain, and the item's printed name. */
  key: string
  shop: string
  title: string
  /** Oldest first. */
  sightings: Sighting[]
  last: Sighting
}

/** A look-alike at another shop, never joined unless you say so. */
export interface Similar {
  title: string
  shop: string
  /** The keys that would join: the look-alike's own, and any you already joined to it. */
  members: string[]
}

export interface ProductView {
  /** Your record's id when you joined or listed it, else its one key. */
  id: string
  /** What it's called: how it's printed where you buy it most. */
  title: string
  record: Product | null
  regular: boolean
  members: string[]
  shops: ShopLine[]
  /** How many receipts it's on. */
  times: number
  last: Sighting
  /** The shop it was last bought at. */
  lastShop: string
  /** The shelf price last changed at the shop it was last bought at, with the days. */
  change: { shop: string; from: number; to: number; fromDate: string; toDate: string } | null
  similar: Similar[]
}

const STOP = new Set(['the', 'of', 'and', 'with', 'pack', 'pk', 'ct', 'x'])
const tokens = (name: string): Set<string> =>
  new Set(
    name
      .toLowerCase()
      .replace(MULTI, ' ')
      .replace(SIZE, ' ')
      .match(/[\p{L}]{2,}/gu)
      ?.filter((w) => !STOP.has(w)) ?? [],
  )

/** How much two names share: the words in both over the words in either. */
function alike(a: string, b: string): number {
  const [x, y] = [tokens(a), tokens(b)]
  const both = [...x].filter((w) => y.has(w)).length
  return x.size + y.size - both === 0 ? 0 : both / (x.size + y.size - both)
}

/** Names this close are offered as "Same product?". */
const SIMILAR_AT = 0.6
const MAX_SIMILAR = 3

function sightingsByKey(receipts: readonly KnownReceipt[]): Map<string, { shop: string; sightings: Sighting[]; receipts: KnownReceipt[]; title: string }> {
  const found = new Map<string, { shop: string; sightings: Sighting[]; receipts: KnownReceipt[]; title: string }>()
  for (const receipt of receipts) {
    if (!shopKey(receipt.shop)) continue
    for (const item of receipt.items) {
      if (item.price <= 0 || item.returned) continue
      const key = rememberedKey(receipt.shop, item.name)
      const line = found.get(key) ?? { shop: '', sightings: [], receipts: [], title: '' }
      const quantity = Math.max(1, item.quantity)
      line.sightings.push({
        date: receipt.date,
        receiptId: receipt.id,
        entryId: receipt.entryId,
        currency: receipt.currency,
        name: itemShown(item),
        price: item.price,
        quantity,
        each: item.price / quantity,
        saving: item.saving ?? 0,
        unit: unitPriceOf(item),
      })
      if (!line.receipts.includes(receipt)) line.receipts.push(receipt)
      found.set(key, line)
    }
  }
  return found
}

function lineOf(key: string, found: ReturnType<typeof sightingsByKey> extends Map<string, infer V> ? V : never): ShopLine {
  const sightings = [...found.sightings].sort((a, b) => a.date.localeCompare(b.date))
  const last = sightings.at(-1)!
  return { key, shop: shopSpend(found.receipts).shop ?? found.receipts.at(-1)!.shop, title: last.name, sightings, last }
}

/** The shelf price at the shop it was last bought at: what it was, until when, and what it is. None when it never changed, or
 *  one receipt shows the name at two prices (two things printed alike). */
function changeOf(line: ShopLine): ProductView['change'] {
  const prices = new Map<string, Set<number>>()
  for (const s of line.sightings) prices.set(s.receiptId, new Set([...(prices.get(s.receiptId) ?? []), s.each]))
  if ([...prices.values()].some((set) => set.size > 1)) return null
  const before = line.sightings.findLast((s) => s.each !== line.last.each)
  return before ? { shop: line.shop, from: before.each, to: line.last.each, fromDate: before.date, toDate: line.last.date } : null
}

/** Your products, newest bought first: each one product at each shop it's joined to, built from `receipts` (the ones that count)
 *  and the records you made (regular, same, not the same). A member whose receipts are gone is dropped. */
export function productViews(receipts: readonly KnownReceipt[], records: readonly Product[]): ProductView[] {
  const found = sightingsByKey(receipts)
  const lines = new Map([...found].map(([key, f]) => [key, lineOf(key, f)]))
  const recordOf = new Map<string, Product>()
  for (const record of records) for (const key of record.members) if (!recordOf.has(key)) recordOf.set(key, record)

  const groups: { id: string; record: Product | null; keys: string[] }[] = []
  const done = new Set<string>()
  for (const record of records) {
    const keys = record.members.filter((k) => lines.has(k) && recordOf.get(k) === record)
    if (keys.length === 0) continue
    groups.push({ id: record.id, record, keys })
    for (const k of keys) done.add(k)
  }
  for (const key of lines.keys()) if (!done.has(key)) groups.push({ id: key, record: null, keys: [key] })

  const views = groups.map(({ id, record, keys }): ProductView => {
    const shops = keys.map((k) => lines.get(k)!).sort((a, b) => b.sightings.length - a.sightings.length || b.last.date.localeCompare(a.last.date))
    const lastLine = [...shops].sort((a, b) => b.last.date.localeCompare(a.last.date))[0]!
    return {
      id,
      title: shops[0]!.title,
      record,
      regular: Boolean(record?.regular),
      members: keys,
      shops,
      times: new Set(shops.flatMap((s) => s.sightings.map((x) => x.receiptId))).size,
      last: lastLine.last,
      lastShop: lastLine.shop,
      change: changeOf(lastLine),
      similar: [],
    }
  })

  // Look-alikes at other shops: the same kind of unit price to compare, a name that shares most of its words, and never one you
  // said is not the same.
  for (const view of views) {
    const chains = new Set(view.shops.map((s) => shopKey(s.shop)))
    const kind = view.last.unit?.kind
    if (!kind) continue
    const apart = new Set(view.record?.notSame ?? [])
    view.similar = views
      .filter((other) => other !== view && other.last.unit?.kind === kind && !other.shops.some((s) => chains.has(shopKey(s.shop))))
      .filter((other) => !other.members.some((k) => apart.has(k)) && !view.members.some((k) => other.record?.notSame.includes(k)))
      .map((other) => ({ other, score: alike(view.title, other.title) }))
      .filter(({ score }) => score >= SIMILAR_AT)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SIMILAR)
      .map(({ other }) => ({ title: other.title, shop: other.lastShop, members: other.members }))
  }
  return views.sort((a, b) => b.last.date.localeCompare(a.last.date) || a.title.localeCompare(b.title))
}

export interface ShopPrice {
  key: string
  shop: string
  /** Pence per kilogram, litre or item, as it last was paid. */
  perUnit: number
  date: string
  onOffer: boolean
}

export interface Comparison {
  kind: UnitKind
  /** Cheapest first. */
  rows: ShopPrice[]
  /** Another shop that was cheaper than the one last bought at: by how much, in whole pence of the unit, as shown. */
  cheaper: { shop: string; lessBy: number } | null
}

/** Shops compared by what one unit last cost, only for a product you joined across shops and only where each prints a size in
 *  the same kind of unit. Null for fewer than two shops. */
export function compareShops(view: ProductView): Comparison | null {
  const kind = view.last.unit?.kind
  if (!kind) return null
  const rows = view.shops
    .filter((s) => s.last.unit?.kind === kind)
    .map((s) => ({ key: s.key, shop: s.shop, perUnit: s.last.unit!.perUnit, date: s.last.date, onOffer: s.last.saving > 0 }))
    .sort((a, b) => a.perUnit - b.perUnit)
  if (new Set(rows.map((r) => shopKey(r.shop))).size < 2) return null
  const mine = rows.find((r) => shopKey(r.shop) === shopKey(view.lastShop))
  const cheapest = rows[0]!
  const cheaper = mine && cheapest !== mine && Math.round(mine.perUnit) > Math.round(cheapest.perUnit) ? { shop: cheapest.shop, lessBy: Math.round(mine.perUnit) - Math.round(cheapest.perUnit) } : null
  return { kind, rows, cheaper }
}

/** What the Prices list shows: products you listed as regular, bought more than once, or at more than one shop. Regular first,
 *  then the most bought. */
export function listedProducts(views: readonly ProductView[]): ProductView[] {
  return views
    .filter((v) => v.regular || v.times >= 2 || v.shops.length >= 2)
    .sort((a, b) => Number(b.regular) - Number(a.regular) || b.times - a.times || b.last.date.localeCompare(a.last.date) || a.title.localeCompare(b.title))
}
