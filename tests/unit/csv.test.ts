import { describe, expect, it } from 'vitest'
import { entriesToCsv } from '../../src/db/csv'
import type { Entry } from '../../src/db/types'

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
  note: '',
  source: 'evening',
  createdAt: Date.UTC(2026, 9, 21, 19),
  updatedAt: Date.UTC(2026, 9, 21, 19),
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
      'date,part_of_day,activity,engagement_1_to_5,energy_minus2_to_plus2,flow,where,with_whom,using,note,source,created_at',
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
})
