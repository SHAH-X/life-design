import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureAiReadings, photoReaderSettings, readOnePhoto } from '../../src/db/aiReading'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import type { Entry, Photo } from '../../src/db/types'
import { AI_READING_INSTRUCTIONS, amount, looksLikeReceipt, parseAiReading } from '../../src/domain/aiReading'
import { photoTexts } from '../../src/domain/search'
import { receiptsOf } from '../../src/domain/shopping'
import { photoReader } from '../../src/features/photos/photoReader'
import { AiError, readPhotoWithAi } from '../../src/lib/ai'
import { toBase64 } from '../../src/lib/photo'
import { areaEntry } from '../fixtures/areas'
import { RECEIPTS } from '../fixtures/receipts'

// Fictional example data. A "photo" is a few made-up bytes; a stand-in AI says what it reads in each.

const BY = 'Gemini · gemini-test'
const receiptReply = JSON.stringify({
  receipt: true,
  shop: 'Greenleaf Market',
  date: '2026-10-12',
  currency: '£',
  items: [
    { name: 'Oat milk', price: '1.45', quantity: 1, kind: 'dairy and eggs' },
    { name: 'Eggs', price: '£2.10', quantity: 1, kind: 'Eggs' },
    { name: 'Promo saving', price: -0.5 },
    { name: '', price: '9.99' },
    { name: 'No price' },
  ],
  total: '3.05',
  text: 'GREENLEAF MARKET\nOat milk 1.45',
})

describe('AI_READING_INSTRUCTIONS: how the AI is asked to read a photo', () => {
  it('asks for a receipt, each item with its kind', () => {
    expect(AI_READING_INSTRUCTIONS).toContain(
      'If it is a receipt, reply: {"receipt": true, "shop": "the shop", "date": "YYYY-MM-DD or null", "currency": "£, $, € or empty", "items": [{"name": "the item as printed, its codes left out", "price": "1.73", "quantity": 1, "kind": "Dairy and eggs"}], "total": "the total paid, or null", "text": "all the text you can read, line by line"}.',
    )
  })

  it('gives every kind from the fixed list, and Other when unsure', () => {
    expect(AI_READING_INSTRUCTIONS).toContain(
      'Give each item the kind it most likely is, written exactly as one of: Fruit and veg, Meat and fish, Dairy and eggs, Bread and bakery, Cupboard, Frozen, Drinks, Snacks and sweets, Alcohol, Household, Toiletries and health, Other. If you are not sure, Other.',
    )
  })

  it('asks for anything else as Markdown, laid out as printed: headings, lists, tables, and code named by its language', () => {
    expect(AI_READING_INSTRUCTIONS).toContain('"text": "what is printed on it, as Markdown"')
    expect(AI_READING_INSTRUCTIONS).toMatch(/a heading as a # heading, a list as - items, a table as a Markdown table/)
    expect(AI_READING_INSTRUCTIONS).toMatch(/code in a ``` block named by its language, its lines and indents exactly as printed/)
  })

  it('holds a chart to the values printed on it: nothing read between gridlines, guessed, worked out or foretold', () => {
    expect(AI_READING_INSTRUCTIONS).toMatch(/"text" gives only the values printed on it/)
    expect(AI_READING_INSTRUCTIONS).toMatch(/Never estimate a value from where a line, bar, candle or point sits, between gridlines or between labels/)
    expect(AI_READING_INSTRUCTIONS).toMatch(/never guess, round or work anything out/)
    expect(AI_READING_INSTRUCTIONS).toMatch(/say nothing of trends, forecasts or advice/)
  })
})

describe('parseAiReading: what is kept of the AI’s reply', () => {
  it('keeps a Markdown reading as written: its lines, indents, blank lines, tables and code', () => {
    const markdown = '# Retry helper\n\n```ts\nfunction retry(n: number) {\n  return { tries: n }\n}\n```\n\n| Setting | Value |\n|---|---|\n| tries | 3 |'
    const reply = JSON.stringify({ receipt: false, description: 'A screenshot of TypeScript code', text: `\n${markdown}\n ` })
    expect(parseAiReading(reply, BY, 1)).toEqual({ by: BY, at: 1, text: markdown, description: 'A screenshot of TypeScript code', receipt: null })
    expect(parseAiReading(`\`\`\`json\n${reply}\n\`\`\``, BY, 1)?.text).toBe(markdown)
  })

  it('keeps a receipt’s items with a name and a price, in pence, and a kind from the list; a saving is negative', () => {
    expect(parseAiReading(receiptReply, BY, 7)).toEqual({
      by: BY,
      at: 7,
      text: 'GREENLEAF MARKET\nOat milk 1.45',
      description: '',
      receipt: {
        shop: 'Greenleaf Market',
        date: '2026-10-12',
        currency: '£',
        items: [
          // "dairy and eggs" is a kind on the list, as it's written there; "Eggs" isn't one, so it's dropped.
          { name: 'Oat milk', price: 145, quantity: 1, kind: 'Dairy and eggs' },
          { name: 'Eggs', price: 210, quantity: 1 },
          { name: 'Promo saving', price: -50, quantity: 1 },
        ],
        total: 305,
      },
    })
  })

  it('reads JSON wrapped in words or a code block, keeps a photo’s description, and gives up on nonsense', () => {
    expect(parseAiReading('Here it is:\n```json\n{"receipt": false, "description": "A whiteboard with goals", "text": "Q4 goals"}\n```', BY, 1)).toMatchObject({
      description: 'A whiteboard with goals',
      text: 'Q4 goals',
      receipt: null,
    })
    expect(parseAiReading('I cannot read this.', BY, 1)).toBeNull()
    expect(parseAiReading('{"receipt": true, "items": []}', BY, 1)).toBeNull()
    expect(parseAiReading('{"receipt": true, "date": "16th Aug", "items": [{"name": "Tea", "price": "1.00"}]}', BY, 1)?.receipt?.date).toBeNull()
  })

  it('reads amounts as the phone writes them', () => {
    expect([amount('£1.73'), amount('1,20'), amount(-0.5), amount('12'), amount('1.2'), amount('abc'), amount(null)]).toEqual([173, 120, -50, 1200, 120, null, null])
  })
})

describe('what the AI read, used', () => {
  const photoEntry = (id: string, photo: Entry['photos'][number]): Entry => ({ ...areaEntry({ id, text: '', expect: [] }, '2026-10-20'), photos: [photo] })

  it('a receipt is as the AI read it, but whether it adds up is the phone’s to say', () => {
    const reading = parseAiReading(receiptReply, BY, 7)!
    const [receipt] = receiptsOf([photoEntry('e1', { id: 'p1', text: 'GREENLEAF MARKET\nTOTAL 3.05', ai: reading })])
    expect(receipt).toMatchObject({ id: 'p1', shop: 'Greenleaf Market', date: '2026-10-12', total: 305, adds: true, currency: '£' })
    const claimsTooMuch = { ...reading, receipt: { ...reading.receipt!, total: 999 } }
    expect(receiptsOf([photoEntry('e1', { id: 'p1', text: null, ai: claimsTooMuch })])[0]?.adds).toBe(false)
  })

  it('search and meaning read the AI’s text and description, else the phone’s text', () => {
    const ai = parseAiReading('{"receipt": false, "description": "A whiteboard with goals", "text": "Q4 goals"}', BY, 1)!
    expect(photoTexts(photoEntry('e1', { id: 'p1', text: 'Q4 g0als', ai }))).toEqual(['A whiteboard with goals\nQ4 goals'])
    expect(photoTexts(photoEntry('e2', { id: 'p2', text: 'Q4 g0als' }))).toEqual(['Q4 g0als'])
  })

  it('a photo goes by itself only when the phone takes it for a receipt', () => {
    expect(looksLikeReceipt(RECEIPTS.find((r) => r.id === 'greenleaf')!.text)).toBe(true)
    expect(looksLikeReceipt(RECEIPTS.find((r) => r.id === 'note')!.text)).toBe(false)
    expect(looksLikeReceipt(null)).toBe(false)
  })
})

describe('readPhotoWithAi: one photo to the AI', () => {
  it('sends how to read it and the photo as a JPEG, asking for JSON back', async () => {
    let body: { response_format?: unknown; messages?: { content: { type: string; text?: string; image_url?: { url: string } }[] }[] } = {}
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      body = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"receipt": false}' } }] }), { status: 200 })
    }) as typeof fetch
    expect(await readPhotoWithAi({ provider: 'gemini', key: 'AIza_test_abcd', model: 'm', instructions: 'Read it', jpeg: 'AAAA' }, fetchImpl)).toBe('{"receipt": false}')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages![0]!.content).toEqual([
      { type: 'text', text: 'Read it' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
    ])
  })

  it('asks Gemini to think little (reading is copying out, not reasoning); OpenAI, whose older models refuse it, gets nothing new', async () => {
    const sent: Record<string, unknown>[] = []
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"receipt": false}' } }] }), { status: 200 })
    }) as typeof fetch
    await readPhotoWithAi({ provider: 'gemini', key: 'AIza_test_abcd', model: 'gemini-3.5-flash', instructions: 'Read it', jpeg: 'AAAA' }, fetchImpl)
    await readPhotoWithAi({ provider: 'openai', key: 'sk-test_abcd', model: 'gpt-4o', instructions: 'Read it', jpeg: 'AAAA' }, fetchImpl)
    expect(sent[0]!.reasoning_effort).toBe('low')
    expect(sent[1]).not.toHaveProperty('reasoning_effort')
  })

  it('waits two minutes for a photo, and a timeout or limit is said in words about a photo, never "a shorter period"', async () => {
    vi.useFakeTimers()
    try {
      // A service that never answers, until the app gives up.
      const silent = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch
      let failed: unknown = null
      const reading = readPhotoWithAi({ provider: 'gemini', key: 'AIza_test_abcd', model: 'm', instructions: 'Read it', jpeg: 'AAAA' }, silent).catch((error: unknown) => {
        failed = error
      })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(failed).toBeNull() // a minute isn't enough for a long receipt
      await vi.advanceTimersByTimeAsync(60_000)
      await reading
      expect(failed).toEqual(new AiError('timeout', 'No answer within two minutes. Try again in a moment.'))
    } finally {
      vi.useRealTimers()
    }
    const limited = (async () => new Response('{}', { status: 429 })) as typeof fetch
    await expect(readPhotoWithAi({ provider: 'gemini', key: 'AIza_test_abcd', model: 'm', instructions: 'Read it', jpeg: 'AAAA' }, limited)).rejects.toThrow(
      "That's more than the service allows just now. Wait a minute and try again.",
    )
  })
})

describe('photoReaderSettings: which AI reads photos', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const set = (settings: Record<string, unknown>, updatedAt = 5) => phone.settings.bulkPut(Object.entries(settings).map(([key, value]) => ({ key, value, updatedAt })))
  const GROQ = { aiProvider: 'groq', aiKey: 'gsk_test_abcd', aiModel: 'openai/gpt-oss-120b' }
  const GEMINI = { aiProvider: 'gemini', aiKey: 'AIza_test_abcd', aiModel: 'gemini-2.5-flash' }

  it('a key of its own for photos: Groq for Ask and reviews, Gemini for photos', async () => {
    await set(GROQ)
    expect(await photoReaderSettings(phone)).toBeNull() // Groq's models don't read images
    await set({ photoAiProvider: 'gemini', photoAiKey: 'AIza_test_wxyz', photoAiModel: 'gemini-2.5-flash' }, 9)
    expect(await photoReaderSettings(phone)).toEqual({ provider: 'gemini', key: 'AIza_test_wxyz', model: 'gemini-2.5-flash', auto: true, keyAt: 9, own: true })
  })

  it('without one, the AI for Ask and reviews, when it reads photos', async () => {
    await set({ ...GEMINI, aiReceipts: false })
    expect(await photoReaderSettings(phone)).toEqual({ provider: 'gemini', key: 'AIza_test_abcd', model: 'gemini-2.5-flash', auto: false, keyAt: 5, own: false })
  })

  it('a refused key is said where it’s kept: Reading photos for the photo key, AI review for the other', async () => {
    const refused = (async () => new Response(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), { status: 400 })) as unknown as typeof fetch
    const settings = { provider: 'gemini' as const, key: 'AIza_test_wxyz', model: 'gemini-2.5-flash' }
    const problem = (own: boolean) => photoReader({ ...settings, own }, refused).send('AAAA', 'Read it').catch((e: unknown) => e)
    expect(await problem(true)).toMatchObject({ problem: 'key', message: "The key wasn't accepted. Check it in More → Reading photos." })
    expect(await problem(false)).toMatchObject({ problem: 'key', message: "The key wasn't accepted. Check it in More → AI review." })
    expect(await problem(true)).toBeInstanceOf(AiError)
  })

  it('never a photo key for a service that can’t read photos, nor one without its model', async () => {
    await set({ ...GEMINI, photoAiProvider: 'groq', photoAiKey: 'gsk_test_abcd', photoAiModel: 'openai/gpt-oss-120b' })
    expect((await photoReaderSettings(phone))?.key).toBe('AIza_test_abcd')
    await set({ photoAiProvider: 'openai', photoAiKey: 'openai_test_efgh', photoAiModel: '' })
    expect((await photoReaderSettings(phone))?.key).toBe('AIza_test_abcd')
  })
})

describe('ensureAiReadings and readOnePhoto: sending photos, one at a time', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })

  const photo = (id: string, entryId: string): Photo => ({ id, entryId, type: 'image/jpeg', width: 10, height: 10, data: toBase64(new TextEncoder().encode(id)), createdAt: 1, updatedAt: 1 })
  const withPhotos = (id: string, photos: Entry['photos']): Entry => ({ ...areaEntry({ id, text: '', expect: [] }, '2026-10-20'), photos, updatedAt: 3 })

  it('sends receipts the AI hasn’t read, never other photos, and keeps what it read without making it an edit', async () => {
    await phone.entries.put(
      withPhotos('e1', [
        { id: 'receipt', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text },
        { id: 'note', text: RECEIPTS.find((r) => r.id === 'note')!.text },
        { id: 'read', text: RECEIPTS.find((r) => r.id === 'cafe')!.text, ai: parseAiReading(receiptReply, BY, 1)! },
      ]),
    )
    await phone.photos.bulkPut([photo('receipt', 'e1'), photo('note', 'e1'), photo('read', 'e1')])
    const sent: string[] = []
    await ensureAiReadings({ by: BY, send: async (jpeg) => (sent.push(atob(jpeg)), receiptReply) }, phone)
    expect(sent).toEqual(['receipt'])
    const entry = await phone.entries.get('e1')
    expect(entry?.updatedAt).toBe(3)
    expect(entry?.photos.find((p) => p.id === 'receipt')?.ai?.receipt?.total).toBe(305)
    expect(entry?.photos.find((p) => p.id === 'note')?.ai).toBeUndefined()
  })

  it('keeps a reply it can’t use as tried, so it isn’t sent again by itself; a tap can try again', async () => {
    await phone.entries.put(withPhotos('e1', [{ id: 'receipt', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text }]))
    await phone.photos.put(photo('receipt', 'e1'))
    let sends = 0
    const reader = { by: BY, send: async () => (sends++, 'Sorry, too blurry.') }
    await ensureAiReadings(reader, phone)
    await ensureAiReadings(reader, phone)
    expect(sends).toBe(1)
    expect((await phone.entries.get('e1'))?.photos[0]?.ai).toMatchObject({ text: '', description: '', receipt: null })
    await readOnePhoto('receipt', { by: BY, send: async () => receiptReply }, phone)
    expect((await phone.entries.get('e1'))?.photos[0]?.ai?.receipt?.items).toHaveLength(3)
  })

  it('passes over a receipt whose picture isn’t on the phone (not written yet, or a damaged restore) and sends the rest', async () => {
    const greenleaf = RECEIPTS.find((r) => r.id === 'greenleaf')!.text
    await phone.entries.put(withPhotos('e1', [{ id: 'missing', text: greenleaf }, { id: 'receipt', text: greenleaf }]))
    await phone.photos.put(photo('receipt', 'e1'))
    const sent: string[] = []
    await ensureAiReadings({ by: BY, send: async (jpeg) => (sent.push(atob(jpeg)), receiptReply) }, phone)
    expect(sent).toEqual(['receipt'])
  })

  it('stops at a refused key, to try again next time, keeping nothing for that photo', async () => {
    await phone.entries.put(withPhotos('e1', [{ id: 'receipt', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text }]))
    await phone.photos.put(photo('receipt', 'e1'))
    await expect(
      ensureAiReadings(
        {
          by: BY,
          send: async () => {
            throw new AiError('key')
          },
        },
        phone,
      ),
    ).rejects.toThrow(AiError)
    expect((await phone.entries.get('e1'))?.photos[0]?.ai).toBeUndefined()
  })
})
