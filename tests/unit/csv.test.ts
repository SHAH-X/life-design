import { describe, expect, it } from 'vitest'
import { entriesToCsv, receiptsToCsv, shoppingCsvFileName } from '../../src/db/csv'
import { type Entry, entryDefaults, type Step } from '../../src/db/types'
import type { KnownReceipt } from '../../src/domain/shopping'

const entry = (over: Partial<Entry>): Entry => ({
  id: 'e',
  date: '2026-10-21',
  part: 'evening',
  activity: 'Read a novel',
  engagement: 4,
  energy: 1,
  flow: false,
  where: [],
  people: [],
  objects: [],
  during: [],
  after: [],
  note: '',
  source: 'evening',
  createdAt: Date.UTC(2026, 9, 21, 19),
  updatedAt: Date.UTC(2026, 9, 21, 19),
  ...entryDefaults(),
  ...over,
})

const rows = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n')

describe('entriesToCsv', () => {
  it('writes a header, then one row per entry sorted by day and part of day', () => {
    const csv = entriesToCsv([
      entry({ id: '3', date: '2026-10-21', part: 'evening', activity: 'C' }),
      entry({ id: '1', date: '2026-10-20', part: 'evening', activity: 'A' }),
      entry({ id: '2', date: '2026-10-21', part: 'morning', activity: 'B' }),
    ])
    const lines = rows(csv)
    expect(lines[0]).toBe(
      'date,part_of_day,activity,what_it_was_like,how_it_left_you,engagement_1_to_5,energy_minus2_to_plus2,flow,where,with_whom,using,note,source,created_at,kind,purpose,energy,how_long,reflections,next_step',
    )
    expect(lines.slice(1).map((l) => l.split(',')[2])).toEqual(['A', 'B', 'C'])
  })

  it('quotes commas, quotes and line breaks, and joins lists with semicolons', () => {
    const [, line] = rows(
      entriesToCsv([entry({ note: 'Said "hi", then left', where: ['Park', 'Café'], people: ['Alex'], energy: -2, flow: true })]),
    )
    expect(line).toContain('"Said ""hi"", then left"')
    expect(line).toContain(',Park; Café,Alex,')
    expect(line).toContain(',4,-2,yes,')
  })

  it('writes the feeling words as chosen', () => {
    const [, line] = rows(entriesToCsv([entry({ during: ['Absorbed', 'Time flew'], after: ['Energised'] })]))
    expect(line).toContain(',Read a novel,Absorbed; Time flew,Energised,')
  })

  it('stops free text from running as a spreadsheet formula', () => {
    const [, line] = rows(entriesToCsv([entry({ activity: '=HYPERLINK("http://example.com")' })]))
    expect(line).toContain(`"'=HYPERLINK(""http://example.com"")"`)
  })

  it('starts with a UTF-8 byte-order mark and uses CRLF line endings', () => {
    const csv = entriesToCsv([entry({})])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('adds the purpose, the energy answer, how long, reflections, and its next steps and things to remember in words', () => {
    const e = entry({
      purpose: 'grow',
      energyEffect: 'used',
      duration: 'hour',
      reflections: [
        { question: 'What went well?', text: 'The demo' },
        { question: 'What would you like to try next time?', text: 'A shorter agenda' },
      ],
      intention: { kind: 'remember', text: 'Small steps beat big plans', status: 'open', updatedAt: 1 },
    })
    const step: Step = {
      id: 's1',
      text: 'Ask for an agenda',
      when: 'before meetings',
      kind: 'once',
      status: 'done',
      entryIds: [e.id],
      activity: 'team meeting',
      createdAt: 1,
      updatedAt: 1,
      finishedAt: 1,
    }
    const [, line] = rows(entriesToCsv([e], [step]))
    expect(line).toContain(
      ',activity,Improve myself,It used up my energy,About an hour,What went well? The demo | What would you like to try next time? A shorter agenda,Before meetings: Ask for an agenda (done) | To remember: Small steps beat big plans',
    )
  })

  it('leaves out drafts', () => {
    expect(rows(entriesToCsv([entry({ id: 'd', status: 'draft' })]))).toHaveLength(1)
  })
})

describe('receiptsToCsv: every item on your receipts, a row each (fictional receipts)', () => {
  const receipt = (over: Partial<KnownReceipt>): KnownReceipt => ({
    id: 'p1',
    entryId: 'e1',
    shop: 'Tesco',
    date: '2026-10-17',
    currency: '£',
    total: 115,
    adds: true,
    items: [
      { name: 'Semi Skimmed Milk 2.27L', price: 165, quantity: 1 },
      { name: 'Clubcard saving', price: -50, quantity: 1 },
    ],
    dated: true,
    readBy: null,
    ...over,
  })

  it('gives each item its receipt’s date, shop, printed total and who read it, prices as plain numbers', () => {
    const csv = receiptsToCsv([receipt({}), receipt({ id: 'p2', shop: 'Greenleaf, Market', date: '2026-10-03', total: 999, adds: false, dated: false, readBy: 'Gemini · gemini-2.5-flash', items: [{ name: '=Oat milk', price: 145, quantity: 2 }] })])
    const lines = csv.replace(/^\ufeff/, '').trimEnd().split('\r\n')
    expect(csv.startsWith('\ufeff')).toBe(true)
    expect(lines).toEqual([
      'date,shop,item,quantity,price,currency,receipt_total,adds_up,date_read,read_by',
      // Oldest first; a comma is quoted, and a name that starts like a formula can't run as one.
      `2026-10-03,"Greenleaf, Market",'=Oat milk,2,1.45,£,9.99,no,no,Gemini · gemini-2.5-flash`,
      '2026-10-17,Tesco,Semi Skimmed Milk 2.27L,1,1.65,£,1.15,yes,yes,the phone',
      '2026-10-17,Tesco,Clubcard saving,1,-0.50,£,1.15,yes,yes,the phone',
    ])
    expect(shoppingCsvFileName(new Date(2026, 9, 24, 20))).toBe('life-design-shopping-2026-10-24.csv')
  })
})
