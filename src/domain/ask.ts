// Ask your journal (step 5, 2026-10-24): a question from Logs' search box, answered by the AI you set up (More → AI
// review), on a tap. The AI never sees the journal whole: it asks the phone for what the question needs (tools), and
// the phone answers from what's on it. Every sum is the phone's (owner: the AI must not do arithmetic): spending by
// shop and month is grouped and added by the phone alone; for kinds of items the AI groups, the phone adds. Everything
// sent is kept, for "What was sent", and an amount in the answer that none of it gave is pointed out.
import type { Entry, PhotoRef } from '../db/types'
import type { ChatMessage, ToolCall, ToolSpec } from '../lib/ai'
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

export interface FoundEntry {
  id: string
  date: string
  /** What it's called in lists (its areas, or what you did). */
  title: string
  text: string
}

/** What the tools read: the receipts, and a way to find entries about something (by meaning when it's on). */
export interface AskJournal {
  receipts: readonly KnownReceipt[]
  findEntries: (about: string, from?: string, to?: string) => Promise<FoundEntry[]>
}

/** Words that say which kind of branch, or that it's a company, not which shop: "Tesco Express" is Tesco. */
const BRANCH_WORDS = new Set(['express', 'extra', 'metro', 'local', 'superstore', 'superstores', 'supermarket', 'supermarkets', 'store', 'stores', 'food', 'ltd', 'limited', 'plc', 'inc', 'llc', 'uk', 'gb'])

/** A shop's name as one key: "TESCO EXPRESS", "Tesco" and "Tesco Stores Ltd" are all "tesco". The first word always
 *  stays ("Local Butcher"), so different shops stay apart ("Pizza Express", "Pizza Hut"); '' when there's no name. */
export function shopKey(name: string): string {
  const all = name.toLowerCase().replace(/['’`.-]/g, '').match(/[\p{L}\p{N}&]+/gu) ?? []
  const named = all[0] === 'the' && all.length > 1 ? all.slice(1) : all
  return named.filter((word, i) => i === 0 || !BRANCH_WORDS.has(word)).join(' ')
}

export const ASK_TOOLS: ToolSpec[] = [
  {
    type: 'function',
    function: {
      name: 'spend_by_shop',
      description:
        'How much was spent, worked out on the phone: for each month, each shop (its names on different receipts joined, "TESCO EXPRESS" and "Tesco" as one) with its total and its receipt ids, the month\'s total, and the total for the whole period. Optionally only between two dates (YYYY-MM-DD, both included) and only one shop.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'First date, YYYY-MM-DD' },
          to: { type: 'string', description: 'Last date, YYYY-MM-DD' },
          shop: { type: 'string', description: 'The shop, by any of its names' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_receipts',
      description:
        'Receipts from photos in the journal: shop, date, each item with its id and price, the printed total, and whether the items add up to it. Optionally only between two dates (YYYY-MM-DD, both included) and only from a shop whose name contains some words.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'First date, YYYY-MM-DD' },
          to: { type: 'string', description: 'Last date, YYYY-MM-DD' },
          shop: { type: 'string', description: 'Words in the shop name' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sum',
      description:
        'Adds up prices exactly. Give item ids (to total some items, for example one kind) or receipt ids (to total whole receipts, using each printed total). Use it for every total, however simple.',
      parameters: {
        type: 'object',
        properties: {
          item_ids: { type: 'array', items: { type: 'string' } },
          receipt_ids: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_entries',
      description: 'Journal entries about something (found by what they mean, not only their words), optionally between two dates (YYYY-MM-DD).',
      parameters: {
        type: 'object',
        properties: {
          about: { type: 'string', description: 'What the entries should be about' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
        required: ['about'],
      },
    },
  },
]

export function askInstructions(today: string): string {
  return [
    `You answer questions about the user's own journal, which is on their phone. Today is ${today}.`,
    'Look things up with the tools: spend_by_shop for how much was spent; find_receipts for items and what was bought; find_entries for anything written.',
    'Never add, multiply or total numbers yourself. For spending by shop or by month, call spend_by_shop and give its totals as they are. For any other total, call sum with the item or receipt ids and use the total it gives.',
    'To split items into kinds (for example dairy, fruit and veg, bakery, household), group them yourself by their names, then call sum once for each group.',
    "If a receipt has adds: false, its items don't add up to its printed total: say so, and use its printed total for what was spent.",
    'Item names are as the receipt prints them, often shortened or misread ("Cln balckberr", "Sbp cshws 15"): when you list items, give what each most likely is in plain words (blackberries, cashews); if you are not sure, give it only as printed, adding nothing.',
    "Say only what the journal shows; if it doesn't show something, say that. Never guess. No scores or ratings.",
    'Name the receipts and entries you used by their ids in square brackets, like [r:ID] for a receipt or [e:ID] for an entry (the r: or e: is needed), where you mention them.',
    'Answer briefly, in plain words; a short list helps for items and totals.',
  ].join('\n')
}

const money = (minor: number, currency: string) => `${minor < 0 ? '-' : ''}${currency}${(Math.abs(minor) / 100).toFixed(2)}`

const inPeriod = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to)

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []

/** What a receipt counts for: its printed total, the amount paid, else its items' sum. */
const paid = (r: KnownReceipt) => r.total ?? r.items.reduce((s, item) => s + item.price, 0)

/** Receipts' total, one per currency (pounds and euros are never added together). */
function totalOf(receipts: readonly KnownReceipt[]): string | string[] {
  const byCurrency = new Map<string, number>()
  for (const r of receipts) byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0) + paid(r))
  const totals = [...byCurrency].map(([currency, minor]) => money(minor, currency))
  return totals.length === 1 ? totals[0]! : totals
}

/** Items grouped by a key, in the order each key first comes. */
function groupBy<T>(items: readonly T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return [...groups.values()]
}

/** A shop's receipts: named as most of them print it (the shortest, if as many), with its other names. */
function shopSpend(receipts: readonly KnownReceipt[]) {
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
function spendByShop(receipts: readonly KnownReceipt[]) {
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

/** Amounts of money in some text, as written and in minor units: "£3.55", "-£0.50", "3,50 €", "$1,234", and a bare
 *  "14.20" (two decimals: never a count, a date like 12.10.2026, or a size like 2.50kg). */
const AMOUNTS = /(?<![\p{L}\p{N}.,])(?:-\s?)?[£$€]\s?-?\d(?:[\d,.]*\d)?|(?<![\p{L}\p{N}.,])\d(?:[\d,.]*\d)?\s?[£$€](?!\s?\d)|(?<![\p{L}\p{N}.,£$€-])-?\d{1,6}[.,]\d{2}(?![\p{L}\p{N}£$€]|[.,]\d)/gu

function amountsIn(text: string): { written: string; minor: number }[] {
  return [...text.matchAll(AMOUNTS)].flatMap(([written]) => {
    // A comma or point before three digits groups thousands; before one or two, it's the pence.
    const m = written.replace(/[^\d.,]/g, '').match(/^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/)
    return m ? [{ written: written.trim(), minor: Number(m[1]!.replace(/[.,]/g, '')) * 100 + Number((m[2] ?? '0').padEnd(2, '0')) }] : []
  })
}

/**
 * The amounts in an answer that nothing sent for it gave (no tool's answer, nor the question): the AI's own, which may
 * be a sum it worked out itself. Each once, as written. A saving given as -£0.50 may be written £0.50.
 */
export function amountsNotFromPhone(answer: string, sent: readonly Sent[]): string[] {
  const given = new Set(sent.flatMap((s) => amountsIn(s.text).map((a) => a.minor)))
  return [...new Set(amountsIn(answer).filter((a) => !given.has(a.minor)).map((a) => a.written))]
}

/** The line under an answer naming those amounts; null when there are none. */
export function notFromPhoneLine(amounts: readonly string[]): string | null {
  if (amounts.length === 0) return null
  const named = amounts.length === 1 ? amounts[0] : `${amounts.slice(0, -1).join(', ')} and ${amounts.at(-1)}`
  return `${named} came from the AI, not from the phone: check ${amounts.length === 1 ? 'it' : 'them'}.`
}

/** What a tool gives back, as JSON for the AI; `about` says in a few words what it was (for "What was sent");
 *  `entries`, the ids of the entries it gave. */
export async function runTool(call: ToolCall, journal: AskJournal): Promise<{ result: string; about: string; entries?: string[] }> {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
  } catch {
    return { result: JSON.stringify({ error: 'The arguments were not JSON.' }), about: 'A request it could not read' }
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

  if (call.function.name === 'spend_by_shop') {
    const [from, to, shop] = [str(args.from), str(args.to), str(args.shop)]
    const wanted = shop ? shopKey(shop).split(' ') : []
    const found = journal.receipts.filter((r) => {
      const name = shopKey(r.shop).split(' ')
      return inPeriod(r.date, from, to) && wanted.every((w) => name.some((n) => n.startsWith(w)))
    })
    const span = from || to ? ` from ${from ?? 'the start'} to ${to ?? 'today'}` : ''
    return {
      result: JSON.stringify(spendByShop(found)),
      about: `Spending by shop and month: ${found.length} receipt${found.length === 1 ? '' : 's'}${span}${shop ? ` at "${shop}"` : ''}`,
    }
  }

  if (call.function.name === 'find_receipts') {
    const [from, to, shop] = [str(args.from), str(args.to), str(args.shop)]
    const shopWords = shop ? words(shop) : []
    const found = journal.receipts.filter((r) => inPeriod(r.date, from, to) && shopWords.every((w) => words(r.shop).includes(w)))
    const result = found.map((r) => ({
      id: r.id,
      shop: r.shop,
      date: r.date,
      items: r.items.map((item, n) => ({ id: `${r.id}:${n}`, name: item.name, price: money(item.price, r.currency), ...(item.quantity > 1 ? { quantity: item.quantity } : {}) })),
      total: r.total === null ? null : money(r.total, r.currency),
      adds: r.adds,
    }))
    const span = from || to ? ` from ${from ?? 'the start'} to ${to ?? 'today'}` : ''
    return { result: JSON.stringify({ receipts: result }), about: `${found.length} receipt${found.length === 1 ? '' : 's'}${span}${shop ? ` from "${shop}"` : ''}` }
  }

  if (call.function.name === 'sum') {
    const byCurrency = new Map<string, number>()
    const add = (currency: string, minor: number) => byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + minor)
    const unknown: string[] = []
    let items = 0
    let receipts = 0
    for (const id of list(args.item_ids)) {
      const match = id.match(/^(.+):(\d+)$/)
      const receipt = match ? journal.receipts.find((r) => r.id === match[1]) : undefined
      const item = match && receipt ? receipt.items[Number(match[2])] : undefined
      if (!receipt || !item) unknown.push(id)
      else {
        add(receipt.currency, item.price)
        items++
      }
    }
    for (const id of list(args.receipt_ids)) {
      const receipt = journal.receipts.find((r) => r.id === id)
      if (!receipt) unknown.push(id)
      else {
        add(receipt.currency, paid(receipt))
        receipts++
      }
    }
    const totals = [...byCurrency].map(([currency, minor]) => money(minor, currency))
    return {
      result: JSON.stringify({ total: totals.length === 1 ? totals[0] : totals, items, receipts, ...(unknown.length ? { unknown_ids: unknown } : {}) }),
      about: `A total of ${items ? `${items} item${items === 1 ? '' : 's'}` : ''}${items && receipts ? ' and ' : ''}${receipts ? `${receipts} receipt${receipts === 1 ? '' : 's'}` : ''}`.trim(),
    }
  }

  if (call.function.name === 'find_entries') {
    const about = str(args.about) ?? ''
    const found = await journal.findEntries(about, str(args.from), str(args.to))
    return {
      result: JSON.stringify({ entries: found.map((e) => ({ id: e.id, date: e.date, title: e.title, text: e.text })) }),
      about: `${found.length} entr${found.length === 1 ? 'y' : 'ies'} about "${about}"`,
      entries: found.map((e) => e.id),
    }
  }

  return { result: JSON.stringify({ error: `There is no tool called ${call.function.name}.` }), about: 'A request for a tool that does not exist' }
}

export interface Sent {
  /** In a few words: "Your question", "4 receipts from 2026-10-01 to 2026-10-24". */
  label: string
  text: string
}

export interface AskResult {
  /** The answer, the [r:…] and [e:…] marks taken out. */
  answer: string
  /** What it named, in order: receipts (by photo id) and entries. */
  cited: { receipts: string[]; entries: string[] }
  sent: Sent[]
}

/** The AI's turn: its reply to the conversation so far (lib/ai.ts chatWithTools, with the key and model bound). */
export type Chat = (messages: readonly ChatMessage[]) => Promise<{ content: string; toolCalls: ToolCall[] }>

/** How many times the AI may ask the phone before it must answer. */
const MAX_ROUNDS = 6

export class AskError extends Error {}

/** A question answered: the AI asks the phone (tools) until it has what it needs, then answers. */
export async function askJournal(question: string, journal: AskJournal, chat: Chat, today: string): Promise<AskResult> {
  const instructions = askInstructions(today)
  const messages: ChatMessage[] = [
    { role: 'system', content: instructions },
    { role: 'user', content: question },
  ]
  const sent: Sent[] = [
    { label: 'How to answer', text: instructions },
    { label: 'Your question', text: question },
  ]
  const known = { receipts: new Set(journal.receipts.map((r) => r.id)), entries: new Set<string>() }
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await chat(messages)
    if (reply.toolCalls.length === 0) return { ...cite(reply.content, known), sent }
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls })
    for (const call of reply.toolCalls) {
      const { result, about, entries } = await runTool(call, journal)
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      sent.push({ label: about, text: result })
      for (const id of entries ?? []) known.entries.add(id)
    }
  }
  throw new AskError("The AI kept asking for more without answering. Try a narrower question, such as a single month.")
}

/** Ids the phone gave for an answer, so one the AI writes bare ([p1], without its r: or e:) is still known. */
export interface KnownIds {
  receipts: ReadonlySet<string>
  entries: ReadonlySet<string>
}

/** The answer without its [r:ID] and [e:ID] marks (or a bare [ID] the phone gave), and what they named. Other
 *  brackets stay. */
export function cite(text: string, known: KnownIds = { receipts: new Set(), entries: new Set() }): Pick<AskResult, 'answer' | 'cited'> {
  const receipts: string[] = []
  const entries: string[] = []
  const answer = text
    .replace(/\s*\[(?:([re]):)?([\w-]+)\]/g, (whole: string, kind: string | undefined, id: string) => {
      const into = kind === 'r' || (!kind && known.receipts.has(id)) ? receipts : kind === 'e' || (!kind && known.entries.has(id)) ? entries : null
      if (!into) return whole
      if (!into.includes(id)) into.push(id)
      return ''
    })
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return { answer, cited: { receipts, entries } }
}
