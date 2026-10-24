// Ask your journal (step 5, 2026-10-24): a question from Logs' search box, answered by the AI you set up (More → AI
// review), on a tap. The AI never sees the journal whole: it asks the phone for what the question needs (tools), and
// the phone answers from what's on it. Every sum is the phone's (owner: the AI must not do arithmetic): the AI groups
// items, the phone adds them. Everything sent is kept, for "What was sent".
import type { Entry } from '../db/types'
import type { ChatMessage, ToolCall, ToolSpec } from '../lib/ai'
import { readReceipt, type Receipt } from './receipts'

/** A receipt in a photo of a finished entry. Its id is the photo's; its date is the receipt's, else the entry's. */
export interface KnownReceipt extends Omit<Receipt, 'date'> {
  id: string
  entryId: string
  date: string
}

export function receiptsOf(entries: readonly Entry[]): KnownReceipt[] {
  return entries
    .filter((e) => e.status !== 'draft')
    .flatMap((entry) =>
      (entry.photos ?? []).flatMap((photo) => {
        const receipt = photo.text ? readReceipt(photo.text) : null
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

export const ASK_TOOLS: ToolSpec[] = [
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
    'Look things up with the tools: find_receipts for shopping, spending, items and shops; find_entries for anything written.',
    'Never add, multiply or total numbers yourself. For every total, call sum with the item or receipt ids and use the total it gives.',
    'To split items into kinds (for example dairy, fruit and veg, bakery, household), group them yourself by their names, then call sum once for each group.',
    "If a receipt has adds: false, its items don't add up to its printed total: say so, and use its printed total for what was spent.",
    "Say only what the journal shows; if it doesn't show something, say that. Never guess. No scores or ratings.",
    'Name the receipts and entries you used by their ids in square brackets, like [r:ID] or [e:ID], where you mention them.',
    'Answer briefly, in plain words; a short list helps for items and totals.',
  ].join('\n')
}

const money = (minor: number, currency: string) => `${minor < 0 ? '-' : ''}${currency}${(Math.abs(minor) / 100).toFixed(2)}`

const inPeriod = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to)

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []

/** What a tool gives back, as JSON for the AI; `about` says in a few words what it was (for "What was sent"). */
export async function runTool(call: ToolCall, journal: AskJournal): Promise<{ result: string; about: string }> {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
  } catch {
    return { result: JSON.stringify({ error: 'The arguments were not JSON.' }), about: 'A request it could not read' }
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

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
        add(receipt.currency, receipt.total ?? receipt.items.reduce((s, i) => s + i.price, 0))
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
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await chat(messages)
    if (reply.toolCalls.length === 0) return { ...cite(reply.content), sent }
    messages.push({ role: 'assistant', content: reply.content || null, tool_calls: reply.toolCalls })
    for (const call of reply.toolCalls) {
      const { result, about } = await runTool(call, journal)
      messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      sent.push({ label: about, text: result })
    }
  }
  throw new AskError("The AI kept asking for more without answering. Try a narrower question, such as a single month.")
}

/** The answer without its [r:ID] and [e:ID] marks, and what they named. */
export function cite(text: string): Pick<AskResult, 'answer' | 'cited'> {
  const receipts: string[] = []
  const entries: string[] = []
  const answer = text
    .replace(/\s*\[([re]):([\w-]+)\]/g, (_, kind: string, id: string) => {
      const into = kind === 'r' ? receipts : entries
      if (!into.includes(id)) into.push(id)
      return ''
    })
    .replace(/[ \t]+\n/g, '\n')
    .trim()
  return { answer, cited: { receipts, entries } }
}
