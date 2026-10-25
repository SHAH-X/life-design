// Photos read by your AI (step 6, v0.18): a photo the phone's own reading takes for a receipt goes to the AI you set
// up as you add it (owner's choice, 2026-10-24); any other photo only on a tap ("Read with AI"). The AI gives what it
// reads; the phone turns its prices into pence, checks the items add up to the total, and still does every sum.
// Each item of a receipt comes with its kind from a fixed list (Shopping, v0.19). Any other photo comes back as
// Markdown, laid out as printed (code, a chart, a page), kept as written for search and Ask, and shown as plain text
// until the layout pass. A chart gives only its printed values (owner, 2026-10-24).
import type { AiReading } from '../db/types'
import { ITEM_KINDS, type ItemKind, readReceipt } from './receipts'

export const AI_READING_INSTRUCTIONS = [
  'Read this photo. Reply with JSON only.',
  'If it is a receipt, reply: {"receipt": true, "shop": "the shop", "date": "YYYY-MM-DD or null", "currency": "£, $, € or empty", "items": [{"name": "the item as printed, its codes left out", "price": "1.73", "quantity": 1, "kind": "Dairy and eggs"}], "total": "the total paid, or null", "text": "all the text you can read, line by line"}.',
  'The date is when it was bought: never a refund, exchange, expiry, collection or delivery date; null if the photo shows none.',
  'Each line bought is an item at the price it shows (for "2 @ 1.50 3.00", one item: quantity 2, price "3.00"). A saving or discount is an item with a negative price. Payment, change, gift card, balance and points lines are not items.',
  `Give each item the kind it most likely is, written exactly as one of: ${ITEM_KINDS.join(', ')}. If you are not sure, Other.`,
  'If it is not a receipt, reply: {"receipt": false, "description": "what the photo shows, in one sentence", "text": "what is printed on it, as Markdown"}.',
  'In that Markdown, keep the words as printed and laid out as they are: a heading as a # heading, a list as - items, a table as a Markdown table, and code in a ``` block named by its language, its lines and indents exactly as printed. Leave out what you cannot read.',
  'For a chart, the description says what it charts (its title, what is measured, the period, the kind of chart), and "text" gives only the values printed on it (axis labels, prices, dates, a legend), each as printed.',
  'Never estimate a value from where a line, bar, candle or point sits, between gridlines or between labels; never guess, round or work anything out; say nothing of trends, forecasts or advice.',
].join('\n')

/** "£1.73", "1,73", -0.50 or 1.73 → minor units; null if it isn't an amount. */
export function amount(value: unknown): number | null {
  const s = typeof value === 'number' ? value.toFixed(2) : typeof value === 'string' ? value.replace(/[£$€\s]/g, '') : ''
  const m = s.match(/^(-)?(\d{1,6})(?:[.,](\d{1,2}))?$/)
  if (!m) return null
  const minor = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'))
  return m[1] ? -minor : minor
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A kind from the list, whatever its capitals; anything else is dropped, never guessed. */
function kindOf(value: unknown): ItemKind | undefined {
  const said = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return ITEM_KINDS.find((kind) => kind.toLowerCase() === said)
}

/** The first {...} in a reply (some services wrap JSON in words or ```). */
function jsonIn(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf('{')
  const end = reply.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const value = JSON.parse(reply.slice(start, end + 1)) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * What's kept of the AI's reply, or null when it can't be used. A receipt keeps only items with a name and a price
 * (in pence); whether they add up is the phone's to say, from the numbers, never the AI's.
 */
export function parseAiReading(reply: string, by: string, at: number): AiReading | null {
  const json = jsonIn(reply)
  if (!json) return null
  const text = typeof json.text === 'string' ? json.text.trim() : ''
  if (json.receipt !== true) {
    const description = typeof json.description === 'string' ? json.description.trim() : ''
    return description || text ? { by, at, text, description, receipt: null } : null
  }
  const items = (Array.isArray(json.items) ? json.items : []).flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const price = amount(item?.price)
    const quantity = typeof item?.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1
    const kind = kindOf(item?.kind)
    return name && price !== null ? [{ name, price, quantity, ...(kind ? { kind } : {}) }] : []
  })
  if (items.length === 0) return null
  const date = typeof json.date === 'string' && DATE.test(json.date) ? json.date : null
  const currency = typeof json.currency === 'string' && ['£', '$', '€'].includes(json.currency) ? json.currency : ''
  return {
    by,
    at,
    text,
    description: '',
    receipt: { shop: typeof json.shop === 'string' ? json.shop.trim() : '', date, currency, items, total: amount(json.total) },
  }
}

/** Whether the phone's own reading takes a photo for a receipt (so it goes to the AI by itself). */
export const looksLikeReceipt = (text: string | null) => Boolean(text && readReceipt(text))
