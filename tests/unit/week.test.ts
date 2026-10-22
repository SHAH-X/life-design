import { describe, expect, it } from 'vitest'
import { aloneOrWithOthers, activityStats } from '../../src/analysis/stats'
import { weekStart, weeksWithEntries, weekSummary } from '../../src/analysis/week'
import { type Entry, entryDefaults } from '../../src/db/types'

// Fictional week: Monday 19 to Sunday 25 October 2026.
let n = 0
const entry = (date: string, activity: string, over: Partial<Entry> = {}): Entry => {
  n += 1
  return {
    id: `w${n}`,
    date,
    part: 'afternoon',
    activity,
    engagement: 3,
    energy: 0,
    flow: false,
    where: [],
    people: [],
    objects: [],
    during: [],
    after: [],
    note: '',
    source: 'evening',
    createdAt: n,
    updatedAt: n,
    ...entryDefaults(),
    ...over,
  }
}
const gave = { energyEffect: 'gave' as const, energy: 2 as const }
const used = { energyEffect: 'used' as const, energy: -2 as const }

describe('weekStart: weeks run Monday to Sunday', () => {
  it('finds the Monday of any day', () => {
    expect(weekStart('2026-10-19')).toBe('2026-10-19')
    expect(weekStart('2026-10-22')).toBe('2026-10-19')
    expect(weekStart('2026-10-25')).toBe('2026-10-19')
    expect(weekStart('2026-10-26')).toBe('2026-10-26')
  })

  it('lists the weeks that have finished entries, newest first', () => {
    const entries = [entry('2026-10-13', 'A'), entry('2026-10-20', 'B'), entry('2026-10-21', 'C'), entry('2026-10-27', 'D', { status: 'draft' })]
    expect(weeksWithEntries(entries)).toEqual(['2026-10-19', '2026-10-12'])
  })
})

describe('weekSummary: the week, put together from finished entries, with the entries behind every line', () => {
  const week = [
    entry('2026-10-19', 'Deep work', { ...gave, after: ['Inspired'] }),
    entry('2026-10-20', 'deep work', { ...gave, after: ['Inspired', 'Calm'], during: ['Time flew'], flow: true }),
    entry('2026-10-21', 'Team meeting', { ...used, after: ['Frustrated'] }),
    entry('2026-10-22', 'Team meeting', { ...used, after: ['Frustrated', 'Tired'], intention: { kind: 'differently', text: 'Ask for an agenda', status: 'open', updatedAt: 1 } }),
    entry('2026-10-22', 'Run', { ...gave, note: 'Felt strong on the hills, and the rain stopped halfway round' }),
    entry('2026-10-23', 'Reading', { intention: { kind: 'remember', text: 'Small steps beat big plans', status: 'open', updatedAt: 1 } }),
    entry('2026-10-24', 'Gym', { ...gave, status: 'draft' }),
    entry('2026-10-12', 'Old week', gave),
  ]
  const summary = weekSummary(week, '2026-10-19')

  it('counts finished entries and days, leaving out drafts and other weeks', () => {
    expect(summary).toMatchObject({ start: '2026-10-19', end: '2026-10-25', entries: 6, days: 5 })
  })

  it('names activities that went one way 2+ times this week, with their entries', () => {
    expect(summary.gave).toEqual([{ label: 'deep work', count: 2, of: 2, entryIds: ['w1', 'w2'] }])
    expect(summary.used).toEqual([{ label: 'Team meeting', count: 2, of: 2, entryIds: ['w3', 'w4'] }])
  })

  it('lists the feelings that came up 2+ times, most first', () => {
    expect(summary.feelings).toEqual([
      { word: 'Inspired', count: 2, entryIds: ['w1', 'w2'] },
      { word: 'Frustrated', count: 2, entryIds: ['w3', 'w4'] },
    ])
  })

  it('picks up to three entries that stood out: kept to remember, with a next step, time flew, then the most written', () => {
    expect(summary.standout).toEqual(['w6', 'w4', 'w2'])
  })

  it('never lists the same activity twice among what stood out', () => {
    const flows = ['2026-10-19', '2026-10-20', '2026-10-21'].map((date) => entry(date, 'Deep work', { flow: true }))
    const other = entry('2026-10-22', 'Choir', { flow: true })
    expect(weekSummary([...flows, other], '2026-10-19').standout).toEqual([flows[0]?.id, other.id])
  })

  it("gathers the week's next steps and things to remember", () => {
    expect(summary.nextSteps).toEqual(['w4'])
    expect(summary.remember).toEqual(['w6'])
  })

  it('is empty, not guessed, for a week with no entries', () => {
    expect(weekSummary(week, '2026-11-02')).toMatchObject({ entries: 0, days: 0, gave: [], used: [], feelings: [], standout: [], nextSteps: [], remember: [] })
  })
})

describe('patterns keep the entries behind them', () => {
  it('each activity group lists its entry ids', () => {
    const rows = activityStats([entry('2026-10-19', 'Run', gave), entry('2026-10-20', 'run', gave)])
    expect(rows[0]?.entryIds).toEqual([`w${n - 1}`, `w${n}`])
  })

  it('alone or with others: only with 3+ entries each way', () => {
    const together = [1, 2, 3].map((d) => entry(`2026-10-1${d}`, 'Lunch', { ...gave, people: ['Sam'] }))
    const alone = [1, 2].map((d) => entry(`2026-10-1${d}`, 'Lunch', used))
    expect(aloneOrWithOthers([...together, ...alone])).toBeNull()
    const more = [...together, ...alone, entry('2026-10-14', 'Lunch', used)]
    expect(aloneOrWithOthers(more)?.map((g) => [g.label, g.count])).toEqual([
      ['With others', 3],
      ['Alone', 3],
    ])
  })
})
