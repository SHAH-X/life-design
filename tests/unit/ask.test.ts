import { describe, expect, it } from 'vitest'
import type { Entry } from '../../src/db/types'
import {
  amountsNotFromPhone,
  ASK_TOOLS,
  type AskJournal,
  AskError,
  type Chat,
  askInstructions,
  askJournal,
  cite,
  type KnownReceipt,
  notFromPhoneLine,
  receiptsOf,
  runTool,
  shopKey,
} from '../../src/domain/ask'
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

describe('shopKey: one name for one shop', () => {
  it('reads a branch kind, a company word, "the", capitals and apostrophes as the same shop', () => {
    expect(new Set(['TESCO EXPRESS', 'Tesco', 'Tesco Stores Ltd', 'tesco extra', 'Tesco Metro'].map(shopKey))).toEqual(new Set(['tesco']))
    expect(shopKey("Sainsbury's Local")).toBe(shopKey('SAINSBURYS'))
    expect(shopKey('Co-op Food')).toBe(shopKey('CO-OP'))
    expect(shopKey('The Daily Grind Cafe')).toBe(shopKey('Daily Grind Cafe'))
  })

  it('keeps different shops apart, and keeps such a word when it starts the name', () => {
    expect(shopKey('Pizza Express')).not.toBe(shopKey('Pizza Hut'))
    expect(shopKey('M&S')).not.toBe(shopKey('Aldi'))
    expect(shopKey('Express')).toBe('express')
    expect(shopKey('Local Butcher')).toBe('local butcher')
  })
})

// Receipts as the phone knows them, for spending by shop: fictional, prices in pence, not in date order.
const known = (id: string, shop: string, date: string, total: number | null, over: Partial<KnownReceipt> = {}): KnownReceipt => ({
  id,
  entryId: `e-${id}`,
  shop,
  date,
  currency: '£',
  total,
  adds: true,
  items: [{ name: 'Item', price: total ?? 0, quantity: 1 }],
  ...over,
})

const SPENDING = [
  known('t1', 'TESCO EXPRESS', '2026-09-28', 1071),
  known('t2', 'Tesco', '2026-10-03', 10),
  known('t3', 'Tesco Stores Ltd', '2026-10-14', 20),
  known('s1', "Sainsbury's Local", '2026-10-09', 455),
  known('s2', 'SAINSBURYS', '2026-10-20', null, { items: [{ name: 'Bread', price: 120, quantity: 1 }, { name: 'Milk', price: 95, quantity: 1 }] }),
  known('l1', 'Lidl', '2026-10-21', 897, { adds: false }),
  known('c1', 'Café de Flore', '2026-10-22', 730, { currency: '€' }),
]

describe('spend_by_shop: spending by month and shop, all worked out on the phone', () => {
  const j = journal({ receipts: SPENDING })
  type Shop = { shop: string | null; also_named?: string[]; total: string | string[]; receipt_ids: string[]; not_adding_up?: string[] }
  type Spend = { total: string | string[] | null; months: { month: string; total: string | string[]; shops: Shop[] }[] }

  it('groups each month by shop, TESCO EXPRESS and Tesco as one, and totals exactly in pence', async () => {
    const spend = (await parsed(call('spend_by_shop', {}), j)) as Spend
    expect(spend.months.map((m) => m.month)).toEqual(['2026-09', '2026-10'])
    expect(spend.months[0]).toEqual({ month: '2026-09', total: '£10.71', shops: [{ shop: 'TESCO EXPRESS', total: '£10.71', receipt_ids: ['t1'] }] })
    const october = spend.months[1]!
    expect(october.shops.map((s) => s.shop)).toEqual(['Café de Flore', 'Lidl', 'SAINSBURYS', 'Tesco'])
    // 10p + 20p is 30p exactly (0.1 + 0.2 in pounds would not be).
    expect(october.shops[3]).toEqual({ shop: 'Tesco', also_named: ['Tesco Stores Ltd'], total: '£0.30', receipt_ids: ['t2', 't3'] })
    // A receipt with no printed total counts its items.
    expect(october.shops[2]).toEqual({ shop: 'SAINSBURYS', also_named: ["Sainsbury's Local"], total: '£6.70', receipt_ids: ['s1', 's2'] })
    // One that doesn't add up counts what it printed, and says so.
    expect(october.shops[1]).toEqual({ shop: 'Lidl', total: '£8.97', receipt_ids: ['l1'], not_adding_up: ['l1'] })
    // Pounds and euros are never added together.
    expect(october.total).toEqual(['£15.97', '€7.30'])
    expect(spend.total).toEqual(['£26.68', '€7.30'])
  })

  it('keeps to a period, and to one shop by any of its names', async () => {
    const tesco = (await parsed(call('spend_by_shop', { from: '2026-10-01', to: '2026-10-31', shop: 'Tesco Express' }), j)) as Spend
    expect(tesco).toEqual({ total: '£0.30', months: [{ month: '2026-10', total: '£0.30', shops: [{ shop: 'Tesco', also_named: ['Tesco Stores Ltd'], total: '£0.30', receipt_ids: ['t2', 't3'] }] }] })
    expect(await parsed(call('spend_by_shop', { shop: 'Sainsbury' }), j)).toMatchObject({ total: '£6.70' })
    expect(await parsed(call('spend_by_shop', { from: '2027-01-01' }), j)).toEqual({ total: null, months: [] })
  })

  it('gives the AI no say in which receipts are added: ids it sends are ignored', async () => {
    const october = { from: '2026-10-01', to: '2026-10-31' }
    const asked = await parsed(call('spend_by_shop', { ...october, receipt_ids: ['t2'], item_ids: ['l1:0'] }), j)
    expect(asked).toMatchObject({ total: ['£15.97', '€7.30'] })
    expect(asked).toEqual(await parsed(call('spend_by_shop', october), j))
  })

  it('says in a few words what it gave, for What was sent', async () => {
    expect((await runTool(call('spend_by_shop', { from: '2026-10-01', to: '2026-10-31' }), j)).about).toBe('Spending by shop and month: 6 receipts from 2026-10-01 to 2026-10-31')
  })

  it('is offered to the AI, which is told to give its totals as they are', () => {
    expect(ASK_TOOLS.map((t) => t.function.name)).toEqual(['spend_by_shop', 'find_receipts', 'sum', 'find_entries'])
    expect(askInstructions('2026-10-24')).toMatch(/spending by shop or by month, call spend_by_shop and give its totals as they are/)
  })
})

describe('amountsNotFromPhone: amounts in an answer that the phone never gave', () => {
  const sent = [
    { label: 'Your question', text: 'Did I spend more than £100 this month?' },
    { label: '1 receipt', text: JSON.stringify({ receipts: [{ id: 'p1', total: '14.20', items: [{ price: '£1,234.56' }, { price: '-£0.50' }] }] }) },
    { label: 'A total', text: JSON.stringify({ total: '£7.75' }) },
  ]

  it('passes amounts the phone gave, or that were in the question, however they are written', () => {
    expect(amountsNotFromPhone('Dairy came to £7.75, and 14.20 at Greenleaf; 1234.56 and a £0.50 saving. Under £100.', sent)).toEqual([])
  })

  it('names the amounts the AI wrote itself, once each, as written', () => {
    expect(amountsNotFromPhone('In all £21.95 (£7.75 + £14.20), so £21.95; $3 and 3,50 € and 12.40.', sent)).toEqual(['£21.95', '$3', '3,50 €', '12.40'])
  })

  it('leaves alone numbers that aren’t money: counts, dates, sizes and times', () => {
    expect(amountsNotFromPhone('3 receipts on 2026-10-14 and 12.10.2026: 6 eggs, 2pt of milk, 2.50kg of rice, at 18:42.', sent)).toEqual([])
    expect(amountsNotFromPhone('2 £7.75 cheeses and a -0.50 saving', [{ label: 'A receipt', text: '{"price":"-0.50","total":"£7.75"}' }])).toEqual([])
  })

  it('says it in one line under the answer', () => {
    expect(notFromPhoneLine([])).toBeNull()
    expect(notFromPhoneLine(['£21.95'])).toBe('£21.95 came from the AI, not from the phone: check it.')
    expect(notFromPhoneLine(['£21.95', '$3', '12.40'])).toBe('£21.95, $3 and 12.40 came from the AI, not from the phone: check them.')
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
    expect(amountsNotFromPhone(result.answer, result.sent)).toEqual([])
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

  // The AI wrote a receipt's id as [aaca…] without its r: (owner, 2026-10-25), and it stayed in the answer.
  it('takes out an id written without its r: or e: too, when the phone gave it; other brackets stay', () => {
    const known = { receipts: new Set(['3f2a9c1e-77b0-4d1a-9e55-0c6b2d8f4a10']), entries: new Set(['e9']) }
    expect(cite('M&S receipt [3f2a9c1e-77b0-4d1a-9e55-0c6b2d8f4a10] – 24 Oct, see [e9]; [sic] and [p404] stay.', known)).toEqual({
      answer: 'M&S receipt – 24 Oct, see; [sic] and [p404] stay.',
      cited: { receipts: ['3f2a9c1e-77b0-4d1a-9e55-0c6b2d8f4a10'], entries: ['e9'] },
    })
  })

  it('knows the ids the phone sent: an answer naming a receipt or an entry by its bare id still names it', async () => {
    const script: Chat = async (messages) => {
      const last = messages.at(-1)!
      if (last.role === 'user') return { content: '', toolCalls: [call('find_receipts', {}, 'a'), call('find_entries', { about: 'rent' }, 'b')] }
      return { content: 'Tesco [p2] and rent [e9].', toolCalls: [] }
    }
    const j = journal({ findEntries: async () => [{ id: 'e9', date: '2026-10-01', title: 'Money', text: 'Rent went up' }] })
    const result = await askJournal('What about Tesco and rent?', j, script, '2026-10-24')
    expect(result.answer).toBe('Tesco and rent.')
    expect(result.cited).toEqual({ receipts: ['p2'], entries: ['e9'] })
  })

  it('tells the AI the r: or e: is needed, and to add nothing to a name it isn’t sure of', () => {
    expect(askInstructions('2026-10-24')).toMatch(/the r: or e: is needed/)
    expect(askInstructions('2026-10-24')).toMatch(/if you are not sure, give it only as printed, adding nothing/)
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
