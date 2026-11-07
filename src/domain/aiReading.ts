// Photos read by your AI (step 6, v0.18): a photo the phone's own reading takes for a receipt goes to the AI you set
// up as you add it (owner's choice, 2026-10-24), and from v0.25.0 one whose text shows a total and another amount,
// a layout the phone's rules can't read (owner, 2026-11-07: "all kind of places and all types of purchases"), the AI
// saying whether it's a receipt; never a payslip or a statement; any other photo only on a tap ("Read with AI"). The AI gives what it
// reads; the phone turns its prices into pence, checks the items add up to the total, and still does every sum.
// Each item of a receipt comes with its kind from a fixed list (Shopping, v0.19) and what it most likely is in plain
// words, as printed when the AI isn't sure (v0.19.3). Any other photo comes back as
// Markdown, laid out as printed (code, a chart, a page), kept as written for search and Ask, and shown as plain text
// until the layout pass. A chart gives only its printed values (owner, 2026-10-24).
import type { AiReading, PhotoRef } from '../db/types'
import { ITEM_KINDS, type ItemKind, mightBeReceipt, readReceipt } from './receipts'

export const AI_READING_INSTRUCTIONS = [
  'Read this photo. Reply with JSON only.',
  'If it is a receipt, reply: {"receipt": true, "shop": "the shop", "date": "YYYY-MM-DD or null", "currency": "£, $, € or empty", "items": [{"name": "the item as printed, its codes left out", "plain": "what it is, in plain words", "price": "1.73", "quantity": 1, "kind": "Dairy and eggs"}], "total": "the total paid, or null", "text": "all the text you can read, line by line"}.',
  'The date is when it was bought: never a refund, exchange, expiry, collection or delivery date; null if the photo shows none.',
  'Each line bought is an item at the price it shows (for "2 @ 1.50 3.00", one item: quantity 2, price "3.00"). A saving or discount is an item with a negative price. Payment, change, gift card, balance and points lines are not items.',
  'If it was paid with loyalty points (a points redemption: prices and total printed in points, not money), add "points": the points used, as a number. Then each item\'s "price" is "0.00" unless a money price is printed for it, and "total" is the money paid, "0.00" if none. Never write points as money.',
  'Give each item a plain name too: what it most likely is, in plain words ("GRK YOG 4PK" is "Greek yoghurt, 4 pack"); if you are not sure, the name as printed, adding nothing.',
  `Give each item the kind it most likely is, written exactly as one of: ${ITEM_KINDS.join(', ')}. If you are not sure, Other.`,
  'Baby and toddler is for infant formula and baby milk, baby food, nappies, wipes and anything made for a baby or toddler, even when it is food or a toiletry.',
  'If it is not a receipt, reply: {"receipt": false, "description": "what the photo shows, in one sentence", "text": "what is printed on it, as Markdown"}.',
  'In that Markdown, keep the words as printed and laid out as they are: a heading as a # heading, a list as - items, a table as a Markdown table, and code in a ``` block named by its language, its lines and indents exactly as printed. Leave out what you cannot read.',
  'For a chart, the description says what it charts (its title, what is measured, the period, the kind of chart), and "text" gives only the values printed on it (axis labels, prices, dates, a legend), each as printed.',
  'Never estimate a value from where a line, bar, candle or point sits, between gridlines or between labels; never guess, round or work anything out; say nothing of trends, forecasts or advice.',
].join('\n')

/** Added to the instructions for a long receipt sent in parts (v0.27.0). */
export const PARTS_INSTRUCTION = 'These photos are parts of one long receipt, top to bottom, each a little over the last: read them as one receipt, each line once.'

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
export function jsonIn(reply: string): Record<string, unknown> | null {
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
  // The loyalty points it was paid with (v0.25.1). Points are never money: an amount that is just the points, written
  // as pounds ("450") or as pence ("4.50"), is nothing paid, whatever the AI was told.
  const said = typeof json.points === 'string' && /^\d+$/.test(json.points.trim()) ? Number(json.points) : json.points
  const points = typeof said === 'number' && Number.isInteger(said) && said > 0 ? said : undefined
  const money = (value: unknown) => {
    const minor = amount(value)
    return points && (minor === points * 100 || minor === points) ? 0 : minor
  }
  const items = (Array.isArray(json.items) ? json.items : []).flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const name = typeof item?.name === 'string' ? item.name.trim() : ''
    const plain = typeof item?.plain === 'string' ? item.plain.trim() : ''
    const price = money(item?.price)
    const quantity = typeof item?.quantity === 'number' && Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 1
    const kind = kindOf(item?.kind)
    return name && price !== null ? [{ name, ...(plain ? { plain } : {}), price, quantity, ...(kind ? { kind } : {}) }] : []
  })
  if (items.length === 0) return null
  const date = typeof json.date === 'string' && DATE.test(json.date) ? json.date : null
  const currency = typeof json.currency === 'string' && ['£', '$', '€'].includes(json.currency) ? json.currency : ''
  return {
    by,
    at,
    text,
    description: '',
    receipt: { shop: typeof json.shop === 'string' ? json.shop.trim() : '', date, currency, items, total: money(json.total), ...(points ? { points } : {}) },
  }
}

/** A payslip's or a bank or card statement's words: such a photo never goes by itself, even one the phone takes for a
 *  receipt (v0.24.4); a tap on "Read with AI" still sends it. */
const PRIVATE_PAPERS =
  /\b(?:pay\s?slip|net pay|gross pay|tax code|national insurance|ni (?:number|no)|employer|p60|p45|salary|sort code|account (?:number|no)|iban|statement (?:date|period)|balance (?:brought|carried) forward|(?:opening|closing) balance|money (?:in|out)|minimum payment|credit limit)\b/i

/** Whether a photo goes to the AI by itself: the phone's own reading takes it for a receipt, or its text has a
 *  receipt's signs (a total and another amount, `mightBeReceipt`, v0.25.0), and it's no payslip or statement (v0.24.4:
 *  the phone's rules took a payslip's "Net pay" and "Total deductions" for a receipt). */
export const looksLikeReceipt = (text: string | null) => Boolean(text && !PRIVATE_PAPERS.test(text) && (readReceipt(text) || mightBeReceipt(text)))

/** Which instructions a reading was made with: 2 asks for each item's kind and plain name (v0.19.3). A receipt read
 *  before (none kept) whose items have no kinds or no plain names is read again by itself, once. */
export const READING_VERSION = 2

/** A receipt whose replies can't be used goes by itself this many times in all; after that, only on a tap. */
export const MAX_TRIES = 3

/**
 * Why a photo goes to your AI by itself (owner, 2026-10-25: "keeps trying … such that no one is left out"): a receipt
 * not read yet ('new'), one whose reply couldn't be used ('retry', MAX_TRIES in all), or one read before items had
 * kinds or plain names ('again'); null for any other photo, which goes only on a tap. A photo you added as a receipt
 * (v0.26.0, Money's "Add a receipt") is one, however the phone reads it, payslip words and all: you said so.
 */
export function dueForAi(photo: Pick<PhotoRef, 'text' | 'ai' | 'receipt' | 'partOf'>): 'new' | 'retry' | 'again' | null {
  if (photo.partOf) return null // read with its first photo (v0.27.0)
  const ai = photo.ai
  const receipt = photo.receipt === true || looksLikeReceipt(photo.text)
  if (!ai) return receipt ? 'new' : null
  if ((ai.tries ?? 0) >= MAX_TRIES) return null
  if (!ai.text && !ai.description) return receipt ? 'retry' : null
  const items = ai.receipt?.items ?? []
  return ai.receipt && !ai.version && (items.every((item) => !item.kind) || items.every((item) => !item.plain)) ? 'again' : null
}

/** A photo you added as a receipt (v0.26.0) not read as one yet: neither your AI nor the phone has, and your AI hasn't
 *  said it's something else or given up on it. Money says it's waiting, so a receipt never vanishes until it's read. */
export function notReadYet(photo: Pick<PhotoRef, 'text' | 'ai' | 'receipt' | 'partOf'>): boolean {
  if (!photo.receipt || photo.ai?.receipt || (photo.text && readReceipt(photo.text))) return false
  const due = dueForAi(photo)
  return due === 'new' || due === 'retry'
}
