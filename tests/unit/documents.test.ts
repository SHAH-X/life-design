import { describe, expect, it } from 'vitest'
import type { DocumentRecord } from '../../src/db/types'
import { datesIn, docEvents, guessType, needsLook, searchDocuments, textFromPieces } from '../../src/domain/documents'
import { buildIcs } from '../../src/reminders/ics'

// Step 5 (owner-approved plan, 2026-11-23): your documents, kept on the phone, searched by their words, with the dates in them
// suggested and tracked only when you say so. Fictional text only.

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'd1',
  title: 'Home insurance policy',
  type: 'Insurance',
  kind: 'pdf',
  mime: 'application/pdf',
  size: 1000,
  pages: 2,
  text: 'Home insurance. Policy renewal date: 1 March 2027. You may cancel within 14 days. After that a notice period of 30 days applies.',
  tracked: [],
  dismissed: [],
  billId: null,
  notes: '',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

describe('guessType: what kind of document it is, from its title and its words', () => {
  it('reads the title and the first of the text, and says Other when nothing is clear', () => {
    expect(guessType('Tenancy agreement', '')).toBe('Tenancy')
    expect(guessType('scan 12', 'The Landlord lets to the Tenant the property on an assured shorthold tenancy')).toBe('Tenancy')
    expect(guessType('Policy', 'Your home insurance policy: premium and excess')).toBe('Insurance')
    expect(guessType('MOT certificate', 'MOT test certificate vehicle registration')).toBe('Vehicle')
    expect(guessType('Washer', 'Two year warranty. This guarantee does not cover')).toBe('Warranty')
    expect(guessType('Electricity bill', 'Your electricity usage 340 kWh, meter reading')).toBe('Utility bill')
    expect(guessType('scan', 'hello')).toBe('Other')
    expect(guessType('', '')).toBe('Other')
  })
})

describe('textFromPieces: the words of a PDF in reading order', () => {
  it('puts pieces on one line when they sit at the same height, left to right, top to bottom, a blank line between pages', () => {
    const piece = (str: string, x: number, y: number, page = 1) => ({ str, x, y, w: 10, size: 10, page })
    expect(textFromPieces([piece('World', 60, 700), piece('Hello', 10, 700), piece('Second line', 10, 680), piece('Page two', 10, 700, 2)])).toBe('Hello World\nSecond line\n\nPage two')
    expect(textFromPieces([])).toBe('')
  })
})

describe('datesIn: dates a document gives with a word that says what they are', () => {
  it('finds a renewal, an expiry, an end and a due date, with the words before them, in any UK way of writing a date', () => {
    const found = datesIn(
      'Policy renewal date: 1 March 2027\nMOT expires 03/08/2027\nValid until 12th January 2027.\nThe tenancy ends on 2027-06-30\nPayment due by 15 Dec 2026',
    )
    expect(found.map((d) => [d.date, d.kind, d.label])).toEqual([
      ['2026-12-15', 'due', 'Payment due by'],
      ['2027-01-12', 'expires', 'Valid until'],
      ['2027-03-01', 'renews', 'Policy renewal date'],
      ['2027-06-30', 'ends', 'The tenancy ends on'],
      ['2027-08-03', 'expires', 'MOT expires'],
    ])
  })
  it('leaves out a date with no such word, a date that is not on the calendar, and a year that cannot be right', () => {
    expect(datesIn('Signed on 4 January 2026. Born 31/02/1990. Dated 5 May 1850.')).toEqual([])
  })
  it('counts a start date apart, and says each once', () => {
    const found = datesIn('Start date: 1 March 2026. Renewal date: 1 March 2027. Renewal date 1 March 2027')
    expect(found.map((d) => [d.date, d.kind])).toEqual([['2026-03-01', 'starts'], ['2027-03-01', 'renews']])
  })
})

describe('searchDocuments: your documents by their words', () => {
  const tenancy = doc({ id: 't', title: 'Tenancy agreement', type: 'Tenancy', text: 'The Tenant must give not less than two months’ written notice. The notice period for the Landlord is longer.' })
  const insurance = doc()
  const scan = doc({ id: 's', title: 'Car handbook', text: '' })
  const docs = [insurance, scan, tenancy]

  it('finds documents that have every word, anywhere in them, whatever the capitals', () => {
    expect(searchDocuments(docs, 'NOTICE period').map((r) => r.doc.id)).toEqual(['t', 'd1'])
    expect(searchDocuments(docs, 'handbook').map((r) => r.doc.id)).toEqual(['s'])
    expect(searchDocuments(docs, 'notice banana')).toEqual([])
  })
  it('gives the words around the match, each match marked, at most two places', () => {
    const [first] = searchDocuments(docs, 'notice period')
    expect(first!.snippets.length).toBeGreaterThan(0)
    expect(first!.snippets.length).toBeLessThanOrEqual(2)
    const hits = first!.snippets.flat().filter((s) => s.hit).map((s) => s.text.toLowerCase())
    expect(hits).toContain('notice')
    expect(hits).toContain('period')
    expect(first!.snippets[0]!.map((s) => s.text).join('')).toContain('notice')
  })
  it('asks for at least two letters, and finds nothing for nothing', () => {
    expect(searchDocuments(docs, 'a')).toEqual([])
    expect(searchDocuments(docs, '   ')).toEqual([])
  })
  it('puts a title match first', () => {
    const titled = doc({ id: 'x', title: 'Notice board photo', text: '' })
    expect(searchDocuments([tenancy, titled], 'notice').map((r) => r.doc.id)).toEqual(['x', 't'])
  })
})

describe('needsLook: dates you tracked that are coming up', () => {
  const tracked = (date: string, kind: 'renews' | 'expires' = 'renews') => ({ date, kind, label: 'x' })
  it('lists tracked dates within the days given, the last day included, soonest first, with how many days', () => {
    const docs = [doc({ id: 'a', title: 'A', tracked: [tracked('2027-01-12', 'expires')] }), doc({ id: 'b', title: 'B', tracked: [tracked('2026-12-01')] }), doc({ id: 'c', title: 'C', tracked: [tracked('2027-01-22')] }), doc({ id: 'd', title: 'D', tracked: [tracked('2026-11-01')] })]
    expect(needsLook(docs, '2026-11-23', 60).map((n) => [n.doc.id, n.date, n.days])).toEqual([['b', '2026-12-01', 8], ['a', '2027-01-12', 50], ['c', '2027-01-22', 60]])
    expect(needsLook(docs, '2026-11-23', 8).map((n) => n.doc.id)).toEqual(['b'])
  })
  it('does not list a date you never tracked, nor one that has passed', () => {
    expect(needsLook([doc({ dismissed: ['2027-03-01|renews'] })], '2026-11-23', 365)).toEqual([])
  })
})

describe('calendar events for tracked dates', () => {
  it('make a one-off event for each date still to come, with alerts 30 and 2 days before, and say what it is', () => {
    const docs = [
      doc({ tracked: [{ date: '2027-03-01', kind: 'renews', label: 'Policy renewal date' }], notes: 'Cancel online' }),
      doc({ id: 'd2', title: 'MOT certificate', tracked: [{ date: '2027-08-03', kind: 'expires', label: 'MOT expires' }, { date: '2026-01-01', kind: 'ends', label: 'old' }] }),
    ]
    const events = docEvents(docs, '2026-11-23')
    expect(events.map((e) => [e.summary, e.startDate, e.rrule])).toEqual([['Home insurance policy renews', '2027-03-01', undefined], ['MOT certificate expires', '2027-08-03', undefined]])
    const text = buildIcs(events, new Date('2026-11-23T10:00:00Z')).replace(/\r\n /g, '')
    expect(text.match(/BEGIN:VALARM/g)).toHaveLength(4)
    expect(text).toContain('TRIGGER:-P30D')
    expect(text).toContain('TRIGGER:-P2D')
    expect(text).toContain('Cancel online')
    expect(text).not.toContain('RRULE')
  })
})
