// Receipts (step 5, 2026-10-24): the text read from a photo (src/db/photoText.ts) turned, on the phone, into a shop,
// a date, its items with their prices, and its total, so questions about spending are answered with sums the phone
// works out, never an AI (owner's choice). Money is in minor units (pence, cents): sums are exact. A receipt whose
// items don't add up to its total says so (`adds`), and answers say it too. Tuned on tests/fixtures/receipts.ts; v0.17.1
// on the layout of a real receipt the owner tried (product codes, VAT marks, "Balance to Pay", a gift card after it);
// v0.19.2 on four more (M&S's "<" marks and Sparks savings, Asda's rows read price first, a banner or faint print from
// the back of the paper as the first line, an order's collection day).

/** What an item is, as your AI sorts it while it reads a receipt (Shopping, v0.19). Kinds change only by the owner's
 *  choice (v0.19.2 added Clothes and shoes), never renamed, so months stay comparable; the phone's reading gives none. */
export const ITEM_KINDS = ['Fruit and veg', 'Meat and fish', 'Dairy and eggs', 'Bread and bakery', 'Cupboard', 'Frozen', 'Drinks', 'Snacks and sweets', 'Alcohol', 'Household', 'Toiletries and health', 'Clothes and shoes', 'Other'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export interface ReceiptItem {
  /** As printed, its codes left out ("GRK YOG 4PK"): what price changes and repeats match on, as a shop prints the same
   *  name each time. */
  name: string
  /** What your AI took it for, in plain words ("Greek yoghurt, 4 pack"), when it read the receipt (v0.19.3). */
  plain?: string
  /** In minor units; a saving is negative. */
  price: number
  /** From a "2 x 0.89" line, or a "2 @ 1.50 3.00" one; 1 if none. */
  quantity: number
  /** From ITEM_KINDS, when your AI read the receipt. */
  kind?: ItemKind
}

/** An item as it's shown: what your AI took it for, else as printed (read by the phone, or before v0.19.3). */
export const itemShown = (item: ReceiptItem) => item.plain || item.name

export interface Receipt {
  shop: string
  /** YYYY-MM-DD, or null when the receipt shows none (the entry's date stands in). */
  date: string | null
  items: ReceiptItem[]
  /** The printed total, in minor units; null if none was read (then the items' sum is all there is). */
  total: number | null
  /** Whether the items add up to the printed total. */
  adds: boolean
  /** £, $, € or '' when the receipt shows none. */
  currency: string
}

/** An amount: pence or cents after a point or comma. */
const AMOUNT = String.raw`-?\d{1,5}[.,]\d{2}`
/** After a price, a VAT or offer mark: a letter (R read as F), * (read as x), ×, or M&S's <. */
const MARK = String.raw`[A-Za-z*×<]`
/** Before an amount: its currency (£ read as a lone E), or nothing stuck to it ("ne.auj9,28M" is faint print from the
 *  back of the paper, not a price). */
const BEFORE_AMOUNT = String.raw`(?:([£$€])|\bE|(?<![A-Za-z\d]))`
/** A price at the end of a line: perhaps a minus before its currency ("-£0.75"), its currency, and a mark. */
const PRICE = new RegExp(String.raw`(-\s*)?${BEFORE_AMOUNT}\s*(${AMOUNT})\s*(€|£|\$)?\s*${MARK}?$`)
/** A row a tilted photo read price first ("£1.10 BAGELS"). */
const PRICE_FIRST = new RegExp(String.raw`^([£$€]\s*${AMOUNT}${MARK}?)\s+([A-Za-z].*)$`)
/** "2 x 0.89" on a line of its own: how many of the item on the next line. */
const QUANTITY = new RegExp(String.raw`^(\d{1,3})\s*[^\s\d.,]?\s*[£$€]?\s*${AMOUNT}\s*[£$€]?$`)
/** "2 @ £1.50 £3.00*": how many, each, and their price, for the item named on the line above (@ read as 园). */
const QUANTITY_PRICED = new RegExp(String.raw`^(\d{1,3})\s*[^\s\d.,]?\s*[£$€]?\s*${AMOUNT}\s+[£$€]?\s*(${AMOUNT})\s*[£$€]?\s*${MARK}?$`)
/** The total, anywhere in its line ("Items:16 Balance to Pay"), but not a subtotal or a total of savings. */
const TOTAL = /\b(?:grand total|total|balance (?:to pay|due)|amount (?:due|to pay)|to pay|montant|summe)\b/i
const NOT_TOTAL = /\bsub[\s-]?total\b|\btotal\s+(?:saving|savings|discount|items|qty|quantity)\b/i
const NOT_ITEMS = /^(?:\d+\s+)?(?:sub ?total|tax|vat|tva|card|visa|mastercard|amex|debit|credit|cb|cash|change|paid|contactless|tendered|tip|rounding|balance)\b/i
/** "Balance before Saving": the priced lines after it, up to the total, are savings, even when the photo lost their minus. */
const BEFORE_SAVINGS = /\bbefore\s+sav/i
/** Before a name: a product code, then perhaps a department code ("11110000 T21 Hand Soap"). */
const CODES = /^\d{5,}\s+(?:[A-Z]\d{1,3}\s+)?/
/** Stars around a name ("**£4 off with Sparks**", read as "*×…×*x"). */
const STARS = /^[*×x]*[*×]\s*|\s*[*×][*×x]*$/g
/** A date on such a line, or right under one with no date of its own, is a deadline or a day to come, not when you
 *  bought it: a refund's last day, an expiry ("Exp. Date"), a day to collect or deliver ("collection in store … on").
 *  "Home delivery or collection in store" names no day. */
const DEADLINE = /refund|exchange|exohange|return|expir|\bexp\b|valid|until|best before|use by|\b(?:collect|deliver)\w*\b.*\b(?:on|by|date)\b/i
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const SMALL_WORDS = new Set(['du', 'de', 'la', 'le', 'des', 'of', 'and', 'the', 'di', 'da', 'del'])

const toMinor = (s: string) => {
  const negative = s.startsWith('-')
  const [whole = '0', part = '00'] = s.replace('-', '').split(/[.,]/)
  const value = Number(whole) * 100 + Number(part.padEnd(2, '0').slice(0, 2))
  return negative ? -value : value
}

/** OCR reads a capital O at the start of a word as a zero ("0at milk", "12 0ct"): put it back. */
const unslip = (s: string) => s.replace(/\b0(?=[a-z])/g, 'O')

const isCaps = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s)

/** "11110000 SEMI SKIM MILK" → "Semi skim milk"; mixed case is kept as written. */
const itemName = (s: string) => {
  const t = unslip(s).replace(CODES, '').replace(STARS, '').replace(/\s+[E£]$/, '').replace(/\s+/g, ' ').trim()
  return isCaps(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t
}

/** "TRADER JOE'S" → "Trader Joe's", "BOULANGERIE DU COIN" → "Boulangerie du Coin"; "M&S" and "BP" stay as they are. */
const shopName = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!isCaps(t)) return t
  return t
    .split(' ')
    .map((word, i) => {
      const w = word.toLowerCase()
      if (i > 0 && SMALL_WORDS.has(w)) return w
      if (word.includes('&') || word.length <= 2) return word
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100

/** A date in one line: "12 Oct 2026", "25-Oct-2026", "28th October 2026", "2026-10-09", "03.10.2026", "14/10/26" (US
 *  order only when it must be, or with a $), or null. */
function dateIn(line: string, us: boolean): string | null {
  const t = unslip(line)
  const named = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3})[a-z]*\.?[\s-]+(\d{4})\b/)
  if (named) {
    const m = MONTHS.indexOf(named[2]!.toLowerCase()) + 1
    const [y, d] = [Number(named[3]), Number(named[1])]
    if (m && valid(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`
  }
  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso && valid(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const numeric = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/)
  if (numeric) {
    const [a, b] = [Number(numeric[1]), Number(numeric[2])]
    const y = numeric[3]!.length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3])
    const monthFirst = b > 12 || (a <= 12 && us)
    const [m, d] = monthFirst ? [a, b] : [b, a]
    if (valid(y, m, d)) return `${y}-${pad(m)}-${pad(d)}`
  }
  return null
}

/** The first date on the receipt that isn't a deadline or a day to come (a refund's last day, an expiry, a collection
 *  day), or null. */
export function receiptDate(text: string, us: boolean): string | null {
  const lines = text.split('\n')
  for (const [i, line] of lines.entries()) {
    const above = lines[i - 1] ?? ''
    if (DEADLINE.test(line) || (DEADLINE.test(above) && !dateIn(above, us))) continue
    const date = dateIn(line, us)
    if (date) return date
  }
  return null
}

/** A tilted photo can read rows as one line ("Ibuprofen 200mg 3.49 Plasters 2.25", "… £1.15F 11110000 SEMI …"): a
 *  price followed by more words or a product code starts a new row. "32.41L £48.29" stays as it is. */
const splitRows = (line: string) => line.split(new RegExp(String.raw`(?<=(?:[£$€]\s?|\bE|(?<![A-Za-z\d]))${AMOUNT}${MARK}?\s?[£$€]?)\s+(?=[A-Za-z][A-Za-z]|\d{5,}\s)`))

/** "£1.10 BAGELS" → "BAGELS £1.10", unless more prices follow (rows read as one, split by splitRows). */
const priceLast = (line: string) => {
  const m = line.match(PRICE_FIRST)
  return m && !new RegExp(AMOUNT).test(m[2]!) ? `${m[2]} ${m[1]}` : line
}

/** UK chains whose names on receipts differ by more than a branch word, their companies' included ("J Sainsbury plc",
 *  "Marks & Spencer", "Wm Morrison"): a name starting with any of these words is that chain. Shopping joins a chain's
 *  names as one (`shopKey`). */
const CHAINS: { key: string; name: string; starts: string[][] }[] = [
  { key: 'sainsburys', name: "Sainsbury's", starts: [['sainsburys'], ['sainsbury'], ['j', 'sainsbury'], ['j', 'sainsburys'], ['js', 'sainsbury']] },
  { key: 'm&s', name: 'M&S', starts: [['m&s'], ['m', '&', 's'], ['marks', '&', 'spencer'], ['marks', 'and', 'spencer']] },
  { key: 'coop', name: 'Co-op', starts: [['coop'], ['co', 'op'], ['cooperative']] },
  { key: 'morrisons', name: 'Morrisons', starts: [['morrisons'], ['morrison'], ['wm', 'morrison'], ['wm', 'morrisons']] },
  ...['Tesco', 'Asda', 'Aldi', 'Lidl', 'Waitrose', 'Iceland'].map((name) => ({ key: name.toLowerCase(), name, starts: [[name.toLowerCase()]] })),
]

/** A shop's name as words, "The" left off: "The Co-operative Food" → cooperative, food. */
export function shopWords(name: string): string[] {
  const all = name.toLowerCase().replace(/['’`.-]/g, '').match(/[\p{L}\p{N}&]+/gu) ?? []
  return all[0] === 'the' && all.length > 1 ? all.slice(1) : all
}

/** The chain a name starts with ("TESCO EXPRESS", "J Sainsbury plc"), if any. */
export function chainOf(name: string) {
  const words = shopWords(name)
  return CHAINS.find(({ starts }) => starts.some((start) => start.every((word, i) => words[i] === word)))
}

/** The chain a line above the items names: its company ("ASDA STORES LTD") or its web address ("WWW.ASDA.COM",
 *  "www.marksandspencer.com"; a survey's, "www.tellasda.com", isn't). */
function chainIn(line: string) {
  for (const [, domain] of line.toLowerCase().matchAll(/\b(?:www\.)?([a-z0-9-]+)\.(?:com|co\.uk)\b/g)) {
    const chain = CHAINS.find(({ starts }) => starts.some((start) => start.join('') === domain!.replace(/-/g, '')))
    if (chain) return chain
  }
  return chainOf(line)
}

/** A receipt in a photo's text, or null when it isn't one (a note, a page, a list without prices). */
export function readReceipt(text: string): Receipt | null {
  const lines = text
    .split('\n')
    .map((l) => priceLast(l.trim()))
    .flatMap(splitRows)
    .map((l) => l.trim())
    .filter(Boolean)
  const items: ReceiptItem[] = []
  let total: number | null = null
  let quantity = 1
  let currency = ''
  let firstPriced = -1
  /** After "Balance before Saving": each priced line up to the total is a saving. */
  let savings = false
  /** The last line with words and no price: the name of an item priced on the next line ("2 @ 1.50 3.00"). */
  let unpriced: string | null = null
  for (const [i, line] of lines.entries()) {
    if (total !== null) break // after the total: payment, change, gift cards, savings, points
    const priced = line.match(QUANTITY_PRICED)
    if (priced && unpriced) {
      items.push({ name: itemName(unpriced), price: toMinor(priced[2]!), quantity: Number(priced[1]) })
      unpriced = null
      if (firstPriced < 0) firstPriced = i
      continue
    }
    const q = line.match(QUANTITY)
    if (q) {
      quantity = Number(q[1])
      continue
    }
    const price = line.match(PRICE)
    if (!price) {
      unpriced = /[A-Za-z]{2}/.test(line) ? line : unpriced
      continue
    }
    unpriced = null
    currency ||= price[2] ?? price[4] ?? ''
    if (firstPriced < 0) firstPriced = i
    const label = line.slice(0, price.index).trim()
    const value = price[1] ? -Math.abs(toMinor(price[3]!)) : toMinor(price[3]!)
    if (TOTAL.test(label) && !NOT_TOTAL.test(label)) {
      total = value
      continue
    }
    if (BEFORE_SAVINGS.test(label)) {
      savings = true
      continue
    }
    if (NOT_ITEMS.test(label) || !/[A-Za-z]/.test(label) || /\b(no|number|tel|phone)\b/i.test(label)) continue
    items.push({ name: itemName(label), price: savings ? -Math.abs(value) : value, quantity })
    quantity = 1
  }
  if (items.length === 0 || (total === null && items.length < 2)) return null
  // The shop: the first line, with a short capitals line under it ("SAINSBURY'S" / "LOCAL"); never a priced line. When
  // the first line names no chain and a line above the items does (its company or web address), that chain: the first
  // line can be a prize draw's banner, or faint print from the back of the paper.
  const head = lines.slice(0, firstPriced < 0 ? lines.length : firstPriced)
  let shop = head[0] ?? ''
  const second = head[1]
  if (second && isCaps(shop) && isCaps(second) && !/\d/.test(second) && second.split(' ').length <= 2) shop = `${shop} ${second}`
  const chain = chainOf(shop) ? undefined : head.map(chainIn).find(Boolean)
  const sum = items.reduce((s, item) => s + item.price, 0)
  return {
    shop: chain ? chain.name : shopName(shop),
    date: receiptDate(text, currency === '$'),
    items,
    total,
    adds: total === null || sum === total,
    currency,
  }
}
