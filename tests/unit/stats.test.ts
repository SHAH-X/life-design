import { describe, expect, it } from 'vitest'
import {
  activityStats,
  balanceSummary,
  contextStats,
  drainers,
  energisers,
  energySeries,
  flowFinder,
  formatSigned,
  joyWords,
  overview,
} from '../../src/analysis/stats'
import type { Day, Entry, Review } from '../../src/db/types'

// Fictional two weeks with known answers. 2026-10-12 is a Monday.
let n = 0
const entry = (date: string, activity: string, energy: Entry['energy'], engagement: Entry['engagement'], over: Partial<Entry> = {}): Entry => {
  n += 1
  return {
    id: `e${n}`,
    date,
    part: 'morning',
    activity,
    engagement,
    energy,
    flow: false,
    where: [],
    people: [],
    objects: [],
    note: '',
    source: 'evening',
    createdAt: n,
    updatedAt: n,
    ...over,
  }
}

const entries: Entry[] = [
  entry('2026-10-12', 'Deep work on the report', 2, 5, { flow: true, where: ['Home'] }),
  entry('2026-10-13', 'Deep work on the report', 2, 5, { flow: true, where: ['Home'] }),
  entry('2026-10-14', 'deep work on the report', 1, 4, { where: ['Home'] }),
  entry('2026-10-12', 'Team meeting', -1, 2, { where: ['Office'], people: ['Alex'], part: 'afternoon' }),
  entry('2026-10-13', 'Team meeting', -1, 3, { where: ['Office'], people: ['Alex'], part: 'afternoon' }),
  entry('2026-10-15', 'Team meeting', -2, 2, { where: ['Office'], people: ['Alex'], part: 'afternoon' }),
  entry('2026-10-12', 'Commute', -2, 1, { part: 'evening' }),
  entry('2026-10-13', 'Commute', -2, 1, { part: 'evening' }),
  entry('2026-10-14', 'Commute', -1, 1, { part: 'evening' }),
  entry('2026-10-15', 'Commute', -2, 1, { part: 'evening' }),
  entry('2026-10-16', 'Evening run', 1, 4, { flow: true, part: 'evening' }),
  entry('2026-10-17', 'Evening run', 2, 4, { part: 'evening' }),
  entry('2026-10-18', 'Evening run', 1, 3, { part: 'evening' }),
  entry('2026-10-18', 'Cooking dinner', 2, 4), // only twice: never ranked
  entry('2026-10-19', 'Cooking dinner', 2, 4),
]

const week = { start: '2026-10-12', end: '2026-10-18' }

describe('overview', () => {
  it('counts activities, logged days, averages and flow within the period only', () => {
    const o = overview(entries, week)
    expect(o.entries).toBe(14)
    expect(o.daysLogged).toBe(7)
    expect(o.days).toBe(7)
    expect(o.flow).toBe(3)
    expect(o.avgEnergy).toBeCloseTo(0, 5) // +5 (deep work) −4 (meetings) −7 (commutes) +4 (runs) +2 (cooking) = 0
    expect(o.avgEngagement).toBeCloseTo(40 / 14, 5)
  })

  it('handles an empty period', () => {
    expect(overview(entries, { start: '2026-11-01', end: '2026-11-07' })).toMatchObject({ entries: 0, avgEnergy: null, daysLogged: 0 })
  })
})

describe('what gives and drains energy', () => {
  it('groups activities ignoring case, keeping the latest spelling', () => {
    const deep = activityStats(entries).find((g) => g.label.toLowerCase() === 'deep work on the report')
    expect(deep).toMatchObject({ label: 'deep work on the report', count: 3, flow: 2 })
    expect(deep?.avgEnergy).toBeCloseTo(5 / 3, 5)
  })

  it('ranks energisers and drainers, skipping anything logged fewer than 3 times', () => {
    expect(energisers(entries).map((g) => g.label)).toEqual(['deep work on the report', 'Evening run'])
    expect(drainers(entries).map((g) => g.label)).toEqual(['Commute', 'Team meeting'])
    expect(energisers(entries).some((g) => g.label === 'Cooking dinner')).toBe(false)
  })

  it('finds where flow happens', () => {
    expect(flowFinder(entries).map((g) => [g.label, g.flow])).toEqual([
      ['deep work on the report', 2],
      ['Evening run', 1],
    ])
  })
})

describe('context', () => {
  it('averages energy by place, person and time of day (3+ entries only)', () => {
    expect(contextStats(entries, 'where').map((g) => [g.label, g.count])).toEqual([
      ['Home', 3],
      ['Office', 3],
    ])
    expect(contextStats(entries, 'people').map((g) => g.label)).toEqual(['Alex'])
    expect(contextStats(entries, 'part').map((g) => g.label)).toEqual(['Morning', 'Evening', 'Afternoon'])
  })

  it('averages energy by weekday', () => {
    // Mondays: 12 Oct (deep work +2, meeting −1, commute −2) and 19 Oct (cooking +2).
    const mondays = contextStats(entries, 'weekday', 'en-GB').find((g) => g.label === 'Monday')
    expect(mondays).toMatchObject({ count: 4 })
    expect(mondays?.avgEnergy).toBeCloseTo(0.25, 5)
  })
})

describe('energySeries', () => {
  it('gives one point per day, with null on days with nothing logged', () => {
    const series = energySeries(entries, { start: '2026-10-11', end: '2026-10-13' })
    expect(series.map((p) => [p.start, p.count])).toEqual([
      ['2026-10-11', 0],
      ['2026-10-12', 3],
      ['2026-10-13', 3],
    ])
    expect(series[0]?.avgEnergy).toBeNull()
    expect(series[1]?.avgEnergy).toBeCloseTo(-1 / 3, 5)
  })

  it('switches to weeks (Monday to Sunday) for long periods', () => {
    const series = energySeries(entries, { start: '2026-08-01', end: '2026-10-19' })
    expect(series.at(-2)).toMatchObject({ start: '2026-10-12', end: '2026-10-18', count: 14 })
    expect(series.at(-1)).toMatchObject({ start: '2026-10-19', end: '2026-10-19', count: 1 })
  })
})

describe('momentGroups', () => {
  it('lists each activity once, most extreme first, with how many times it happened', async () => {
    const { momentGroups } = await import('../../src/analysis/stats')
    // Ranked by each activity's strongest moment (energy, then engagement), then by how often it happened:
    // run and cooking both peak at +2 with engagement 4, but the run happened 3 times and cooking twice.
    const high = momentGroups(entries, 'high')
    expect(high.map((g) => [g.entry.activity, g.count, g.entry.energy])).toEqual([
      ['Deep work on the report', 3, 2],
      ['Evening run', 3, 2],
      ['Cooking dinner', 2, 2],
    ])
    const low = momentGroups(entries, 'low')
    expect(low.map((g) => [g.entry.activity, g.count, g.entry.energy])).toEqual([
      ['Commute', 4, -2],
      ['Team meeting', 3, -2],
    ])
  })
})

describe('small joys', () => {
  const day = (date: string, smallJoy: string): Day => ({ date, smallJoy, createdAt: 1, updatedAt: 1 })
  it('finds words that keep coming back, ignoring common words', () => {
    const words = joyWords([
      day('2026-10-12', 'Coffee in the sun'),
      day('2026-10-13', 'Sun on the balcony, sun everywhere'),
      day('2026-10-14', 'Coffee with Alex'),
      day('2026-10-15', 'A good book'),
    ])
    expect(words).toEqual([
      { word: 'coffee', count: 2 },
      { word: 'sun', count: 2 },
    ])
  })
})

describe('balance', () => {
  const review = (periodEnd: string, health: number, work: number, play: number, love: number, done = true): Review => ({
    id: periodEnd,
    periodStart: periodEnd,
    periodEnd,
    balance: { health, work, play, love },
    best: { entryId: null, activities: '', environments: '', interactions: '', objects: '', users: '', why: '' },
    worst: { entryId: null, activities: '', environments: '', interactions: '', objects: '', users: '', why: '' },
    reflection: '',
    takeaway: '',
    completedAt: done ? 1 : null,
    createdAt: 1,
    updatedAt: 1,
  })

  it('shows the latest and previous balance and the lowest area lately, ignoring drafts', () => {
    const s = balanceSummary([review('2026-10-11', 6, 7, 2, 8), review('2026-10-18', 7, 6, 4, 8), review('2026-10-25', 1, 1, 1, 1, false)])
    expect(s.latest?.periodEnd).toBe('2026-10-18')
    expect(s.previous?.periodEnd).toBe('2026-10-11')
    expect(s.lowest).toEqual({ area: 'play', avg: 3 })
  })
})

describe('formatSigned', () => {
  it('uses a true minus sign and one decimal', () => {
    expect(formatSigned(1.44)).toBe('+1.4')
    expect(formatSigned(-0.46)).toBe('−0.5')
    expect(formatSigned(0.04)).toBe('0.0')
  })
})
