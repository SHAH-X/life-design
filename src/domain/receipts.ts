// Receipts (step 5, 2026-10-24): the text read from a photo (src/db/photoText.ts) turned, on the phone, into a shop,
// a date, its items with their prices, and its total, so questions about spending are answered with sums the phone
// works out, never an AI (owner's choice). Money is in minor units (pence, cents): sums are exact. A receipt whose
// items don't add up to its total says so (`adds`), and answers say it too. Tuned on tests/fixtures/receipts.ts.

export interface ReceiptItem {
  name: string
  /** In minor units; a saving is negative. */
  price: number
  /** From a "2 x 0.89" line above it; 1 if none. */
  quantity: number
}

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

const PRICE = /(?:([£$€])\s*)?(-?\d{1,5}[.,]\d{2})\s*(€|£|\$)?\s*[A-Z]?$/
const TOTAL = /^(?:\d+\s+)?(?:total|balance due|amount due|to pay|grand total|montant|summe)\b/i
const NOT_ITEMS = /^(?:\d+\s+)?(?:sub ?total|tax|vat|tva|card|visa|mastercard|amex|debit|credit|cb|cash|change|paid|contactless|tendered|tip|rounding|balance)\b/i
const QUANTITY = /^(\d{1,3})\s*[x×@]\s*[£$€]?\s*\d{1,5}[.,]\d{2}\s*[£$€]?$/i
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

/** "SEMI SKIMMED MILK 2PT" → "Semi skimmed milk 2pt"; mixed case is kept as written. */
const itemName = (s: string) => {
  const t = unslip(s).replace(/\s+/g, ' ').trim()
  return isCaps(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t
}

/** "TRADER JOE'S" → "Trader Joe's", "BOULANGERIE DU COIN" → "Boulangerie du Coin". */
const shopName = (s: string) => {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!isCaps(t)) return t
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100

/** The first date on the receipt: "12 Oct 2026", "2026-10-09", "03.10.2026", "14/10/26" (US order only when it
 *  must be, or with a $). */
export function receiptDate(text: string, us: boolean): string | null {
  const t = unslip(text)
  const named = t.match(/\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\b/)
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

/** A tilted photo can read two rows as one ("Ibuprofen 200mg 3.49 Plasters 2.25"): a price followed by more words
 *  starts a new row. "32.41L" (a price-like amount joined to a word) stays as it is. */
const splitRows = (line: string) => line.split(/(?<=[£$€]?\s?-?\d{1,5}[.,]\d{2}\s?[£$€]?)\s+(?=[A-Za-z][A-Za-z])/)

/** A receipt in a photo's text, or null when it isn't one (a note, a page, a list without prices). */
export function readReceipt(text: string): Receipt | null {
  const lines = text
    .split('\n')
    .flatMap(splitRows)
    .map((l) => l.trim())
    .filter(Boolean)
  const items: ReceiptItem[] = []
  let total: number | null = null
  let quantity = 1
  let currency = ''
  let firstPriced = -1
  for (const [i, line] of lines.entries()) {
    const q = line.match(QUANTITY)
    if (q) {
      quantity = Number(q[1])
      continue
    }
    const price = line.match(PRICE)
    if (!price) continue
    currency ||= price[1] ?? price[3] ?? ''
    if (firstPriced < 0) firstPriced = i
    const label = line.slice(0, price.index).trim()
    if (TOTAL.test(label)) {
      total ??= toMinor(price[2]!)
      continue
    }
    if (total !== null || NOT_ITEMS.test(label) || !/[A-Za-z]/.test(label) || /\b(no|number|tel|phone)\b/i.test(label)) continue
    items.push({ name: itemName(label), price: toMinor(price[2]!), quantity })
    quantity = 1
  }
  if (items.length === 0 || (total === null && items.length < 2)) return null
  // The shop: the first line, with a short capitals line under it ("SAINSBURY'S" / "LOCAL"); never a priced line.
  const head = lines.slice(0, firstPriced < 0 ? lines.length : firstPriced)
  let shop = head[0] ?? ''
  const second = head[1]
  if (second && isCaps(shop) && isCaps(second) && !/\d/.test(second) && second.split(' ').length <= 2) shop = `${shop} ${second}`
  const sum = items.reduce((s, item) => s + item.price, 0)
  return {
    shop: shopName(shop),
    date: receiptDate(text, currency === '$'),
    items,
    total,
    adds: total === null || sum === total,
    currency,
  }
}
