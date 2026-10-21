import { describe, expect, it } from 'vitest'
import { convertV1, parseV1DayLabel, V1_TIMESTAMP } from '../../src/db/importV1'

// Fictional example data.
const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).getTime()
const now = new Date(2026, 9, 21, 12)

const v1 = {
  gtj: [
    { a: 'Repotted the balcony plants', e: 4, g: 9, f: true, ts: at(2026, 9, 14, 10), d: '14 Oct' },
    { a: '  Commute   in traffic ', e: -3, g: 2, f: false, ts: at(2026, 9, 14, 18), d: '14 Oct' },
    { a: 'Cello practice', e: 5, g: 7, f: false, d: 'Oct 3' },
    { a: '', e: 1, g: 5, ts: at(2026, 9, 1, 9) },
    { a: 'Mystery', e: 'x', g: 5, ts: at(2026, 9, 1, 9) },
    { a: 'Old label', e: 0, g: 5, d: 'gibberish' },
  ],
  iki: [
    { n: 'Teaching beginners', f: [1, 1, 0, 0] },
    { n: '   ', f: [] },
  ],
  ody: [
    { h: 'Open a small bakery', d: 'Early mornings, a busy counter', q: 'Would I enjoy early starts?', r: 7, l: 6, c: 8, co: 7 },
    { h: '', d: '', q: '', r: 5, l: 5, c: 5, co: 5 },
    { h: 'Sail around the coast', d: '', q: '', r: 4, l: 9, c: 5, co: 8 },
  ],
}

describe('convertV1', () => {
  const { data, skipped } = convertV1(v1, now)

  it('converts journal entries to the new scales', () => {
    expect(data.entries).toHaveLength(3)
    const [plants, commute, cello] = data.entries
    expect(plants).toMatchObject({
      activity: 'Repotted the balcony plants',
      date: '2026-10-14',
      part: 'morning',
      energy: 2,
      engagement: 5,
      flow: true,
      source: 'import',
    })
    expect(commute).toMatchObject({ activity: 'Commute in traffic', part: 'evening', energy: -1, engagement: 2, flow: false })
    // No timestamp: the date comes from the label, as the most recent 3 October.
    expect(cello).toMatchObject({ date: '2026-10-03', part: 'evening', energy: 2, engagement: 4 })
  })

  it('skips records it cannot read and says how many', () => {
    expect(skipped).toBe(4)
  })

  it('converts Ikigai items with their four circles', () => {
    expect(data.ikigaiItems).toEqual([
      expect.objectContaining({ text: 'Teaching beginners', love: true, goodAt: true, worldNeeds: false, paidFor: false, updatedAt: V1_TIMESTAMP }),
    ])
  })

  it('keeps filled Odyssey Plans in their slots and drops blank ones', () => {
    expect(data.odysseyPlans.map((p) => [p.id, p.slot, p.title])).toEqual([
      ['plan-1', 1, 'Open a small bakery'],
      ['plan-3', 3, 'Sail around the coast'],
    ])
    expect(data.odysseyPlans[0]).toMatchObject({
      questions: ['Would I enjoy early starts?'],
      gauges: { resources: 7, likability: 6, confidence: 8, coherence: 7 },
    })
  })

  it('gives the same ids every time, so importing a file twice adds nothing', () => {
    expect(convertV1(v1, now).data.entries.map((e) => e.id)).toEqual(data.entries.map((e) => e.id))
  })
})

describe('parseV1DayLabel', () => {
  it('reads "21 Oct" and "Oct 21" as the most recent such date', () => {
    expect(parseV1DayLabel('21 Oct', now)).toBe('2026-10-21')
    expect(parseV1DayLabel('Oct 3', now)).toBe('2026-10-03')
    expect(parseV1DayLabel('25 Dec', now)).toBe('2025-12-25')
  })

  it('rejects impossible or unreadable labels', () => {
    expect(parseV1DayLabel('31 Feb', now)).toBeNull()
    expect(parseV1DayLabel('yesterday', now)).toBeNull()
  })
})
