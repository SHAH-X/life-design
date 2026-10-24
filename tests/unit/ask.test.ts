import { describe, expect, it } from 'vitest'
import type { Entry } from '../../src/db/types'
import { type AskJournal, AskError, type Chat, askInstructions, askJournal, cite, receiptsOf, runTool } from '../../src/domain/ask'
import { AiError, chatWithTools, type ToolCall } from '../../src/lib/ai'
import { areaEntry } from '../fixtures/areas'
import { RECEIPTS } from '../fixtures/receipts'

// Fictional example data: entries with photos of the fictional receipts, read already.

const withReceipt = (id: string, date: string, receiptId: string, photoId = `p-${id}`): Entry => ({
  ...areaEntry({ id, text: '', expect: [] }, date),
  photos: [{ id: photoId, text: RECEIPTS.find((r) => r.id === receiptId)!.text }],
})

const ENTRIES = [
  withReceipt('e1', '2026-10-12', 'greenleaf', 'p1'), // its receipt says 12 Oct
  withReceipt('e2', '2026-10-24', 'supermarket-vat', 'p2'), // 14/10/26 on the receipt
  withReceipt('e3', '2026-09-02', 'cafe', 'p3'), // 21 Oct 2026 on the receipt
  { ...withReceipt('e4', '2026-10-20', 'pharmacy', 'p4'), status: 'draft' as const },
  { ...areaEntry({ id: 'e5', text: 'A note', expect: [] }, '2026-10-05'), photos: [{ id: 'p5', text: RECEIPTS.find((r) => r.id === 'note')!.text }] },
]

const journal = (over: Partial<AskJournal> = {}): AskJournal => ({ receipts: receiptsOf(ENTRIES), findEntries: async () => [], ...over })
const call = (name: string, args: object, id = 'c1'): ToolCall => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })
const parsed = async (c: ToolCall, j = journal()) => JSON.parse((await runTool(c, j)).result) as Record<string, unknown>

describe('receiptsOf: the receipts in your photos', () => {
  it('finds each receipt in a finished entry, dated as the receipt says; not drafts, and not a photo of a note', () => {
    expect(receiptsOf(ENTRIES).map((r) => [r.id, r.date, r.shop])).toEqual([
      ['p1', '2026-10-12', 'Greenleaf Market'],
      ['p2', '2026-10-14', 'Tesco Express'],
      ['p3', '2026-10-21', 'The Daily Grind Cafe'],
    ])
  })
})

describe('the tools: what the phone answers', () => {
  it('find_receipts gives the receipts in a period, each item with an id and its price as written', async () => {
    const found = (await parsed(call('find_receipts', { from: '2026-10-01', to: '2026-10-15' }))) as { receipts: { id: string; items: { id: string; name: string; price: string }[]; total: string }[] }
    expect(found.receipts.map((r) => r.id)).toEqual(['p1', 'p2'])
    expect(found.receipts[1]!.items[0]).toEqual({ id: 'p2:0', name: 'Semi skimmed milk 2pt', price: '£1.65' })
    expect(found.receipts[0]!.total).toBe('14.20')
  })

  it('find_receipts can keep to a shop', async () => {
    const found = (await parsed(call('find_receipts', { shop: 'tesco' }))) as { receipts: { id: string }[] }
    expect(found.receipts.map((r) => r.id)).toEqual(['p2'])
  })

  it('sum adds exactly, items or whole receipts (by their printed totals), and says which ids it doesn’t know', async () => {
    expect(await parsed(call('sum', { item_ids: ['p2:0', 'p2:1', 'p2:3'] }))).toEqual({ total: '£7.75', items: 3, receipts: 0 })
    expect(await parsed(call('sum', { receipt_ids: ['p2'], item_ids: ['nope:1', 'p2:99'] }))).toEqual({ total: '£10.71', items: 0, receipts: 1, unknown_ids: ['nope:1', 'p2:99'] })
  })

  it('sum totals a receipt that doesn\u2019t add up by what it printed, the amount paid', async () => {
    const odd: Entry = { ...areaEntry({ id: 'odd', text: '', expect: [] }, '2026-10-10'), photos: [{ id: 'p9', text: 'SHOP\nBread 1.20\nMilk 0.90\nTOTAL 3.10' }] }
    const j = journal({ receipts: receiptsOf([odd]) })
    expect(j.receipts[0]!.adds).toBe(false)
    expect((await parsed(call('sum', { receipt_ids: ['p9'] }), j)).total).toBe('3.10')
  })

  it("sum never adds pounds to receipts with no currency: it gives each its own total", async () => {
    expect((await parsed(call('sum', { receipt_ids: ['p1', 'p2'] }))).total).toEqual(['14.20', '£10.71'])
  })

  it('find_entries asks the phone, and an unknown tool or bad arguments are said plainly', async () => {
    const asked: string[] = []
    const j = journal({ findEntries: async (about) => (asked.push(about), [{ id: 'e9', date: '2026-10-01', title: 'Money', text: 'Rent went up' }]) })
    expect(await parsed(call('find_entries', { about: 'rent' }), j)).toEqual({ entries: [{ id: 'e9', date: '2026-10-01', title: 'Money', text: 'Rent went up' }] })
    expect(asked).toEqual(['rent'])
    expect(await parsed(call('delete_everything', {}))).toEqual({ error: 'There is no tool called delete_everything.' })
    expect(await parsed({ id: 'x', type: 'function', function: { name: 'sum', arguments: '{oops' } })).toEqual({ error: 'The arguments were not JSON.' })
  })
})

describe('askJournal: a question answered, the phone doing the sums', () => {
  it('lets the AI ask the phone, then answers with the phone’s total, naming what it used; and keeps all that was sent', async () => {
    const seen: number[] = []
    const script: Chat = async (messages) => {
      seen.push(messages.length)
      const last = messages.at(-1)!
      if (last.role === 'user') return { content: '', toolCalls: [call('find_receipts', { from: '2026-10-01', to: '2026-10-31' }, 'a')] }
      // Milk, eggs and cheddar from the Tesco receipt: the AI groups them, the phone adds them.
      if (last.role === 'tool' && last.tool_call_id === 'a') return { content: '', toolCalls: [call('sum', { item_ids: ['p2:0', 'p2:1', 'p2:3'] }, 'b')] }
      const total = JSON.parse((last as { content: string }).content).total as string
      return { content: `Dairy and eggs came to ${total} this month [r:p2].`, toolCalls: [] }
    }
    const result = await askJournal('How much did I spend on dairy this month?', journal(), script, '2026-10-24')
    expect(result.answer).toBe('Dairy and eggs came to £7.75 this month.')
    expect(result.cited).toEqual({ receipts: ['p2'], entries: [] })
    expect(result.sent.map((s) => s.label)).toEqual(['How to answer', 'Your question', '3 receipts from 2026-10-01 to 2026-10-31', 'A total of 3 items'])
    expect(seen).toEqual([2, 4, 6])
  })

  it('stops an AI that keeps asking without answering, after six turns', async () => {
    let turns = 0
    const endless: Chat = async () => (turns++, { content: '', toolCalls: [call('find_receipts', {})] })
    await expect(askJournal('Groceries?', journal(), endless, '2026-10-24')).rejects.toThrow(AskError)
    expect(turns).toBe(6)
  })

  it('tells the AI never to do the sums itself, and what today is', () => {
    expect(askInstructions('2026-10-24')).toMatch(/Today is 2026-10-24/)
    expect(askInstructions('2026-10-24')).toMatch(/Never add, multiply or total numbers yourself/)
    expect(askInstructions('2026-10-24')).toMatch(/give what each most likely is in plain words/)
  })

  it('takes the [r:…] and [e:…] marks out of the answer, keeping what they named once each', () => {
    expect(cite('Milk [r:p1] and eggs [r:p1], see [e:e9].')).toEqual({ answer: 'Milk and eggs, see.', cited: { receipts: ['p1'], entries: ['e9'] } })
  })
})

describe('chatWithTools: one turn with the AI service', () => {
  const reply = (body: object, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('sends the tools, and gives back what the AI asks the phone', async () => {
    let sent: { tools?: unknown[]; tool_choice?: string } = {}
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return reply({ choices: [{ message: { content: null, tool_calls: [call('sum', { item_ids: ['p1:0'] })] } }] })()
    }) as typeof fetch
    const turn = await chatWithTools({ provider: 'groq', key: 'gsk_test_abcd', model: 'm', messages: [{ role: 'user', content: 'Hi' }], tools: [] }, fetchImpl)
    expect(sent.tool_choice).toBe('auto')
    expect(turn).toEqual({ content: '', toolCalls: [call('sum', { item_ids: ['p1:0'] })] })
  })

  it('says a refused key in its own words, never the service’s (which can repeat the key)', async () => {
    const refused = reply({ error: { message: 'Invalid API key gsk_test_abcd' } }, 401) as unknown as typeof fetch
    const error = await chatWithTools({ provider: 'groq', key: 'gsk_test_abcd', model: 'm', messages: [], tools: [] }, refused).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiError)
    expect(String((error as Error).message)).not.toContain('gsk_test_abcd')
  })
})
