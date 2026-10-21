import { describe, expect, it } from 'vitest'
import type { Entry, Review } from '../../src/db/types'
import { addDays, dayNumber } from '../../src/lib/dates'
import { BANK } from '../../src/prompts/bank'
import { findPatterns, type PatternPrompt } from '../../src/prompts/patterns'
import { nextTonight, type PickInput, pickTonight } from '../../src/prompts/pick'

const base = (date: string, over: Partial<PickInput> = {}): PickInput => ({
  date,
  purposes: ['calm', 'grow', 'goal', 'learn'],
  goal: 'Run a half marathon',
  answered: [],
  patterns: [],
  ...over,
})

const daysFrom = (start: string, n: number) => Array.from({ length: n }, (_, i) => addDays(start, i))

describe('the evening question', () => {
  it('depends only on the date and your history, so it stays the same all day', () => {
    expect(pickTonight(base('2026-10-21'), null)).toEqual(pickTonight(base('2026-10-21'), null))
  })

  it('takes turns: know yourself, each chosen purpose, then joy', () => {
    const purposes = daysFrom('2026-10-21', 6).map((d) => pickTonight(base(d), null).purpose)
    expect(new Set(purposes)).toEqual(new Set(['know', 'calm', 'grow', 'goal', 'learn', 'joy']))
  })

  it('leaves out purposes that are switched off', () => {
    const purposes = daysFrom('2026-10-21', 12).map((d) => pickTonight(base(d, { purposes: ['learn'] }), null).purpose)
    expect(new Set(purposes)).toEqual(new Set(['know', 'learn', 'joy']))
  })

  it('asks goal questions only once a goal is set, with the goal in the question', () => {
    const noGoal = daysFrom('2026-10-21', 12).map((d) => pickTonight(base(d, { goal: '  ' }), null))
    expect(noGoal.some((p) => p.purpose === 'goal')).toBe(false)
    const goalDays = daysFrom('2026-10-21', 12)
      .map((d) => pickTonight(base(d), null))
      .filter((p) => p.purpose === 'goal')
    expect(goalDays.length).toBeGreaterThan(0)
    // The goal reads naturally mid-sentence: "closer to run a half marathon".
    expect(goalDays.every((p) => p.question.includes('run a half marathon') && !p.question.includes('{goal}'))).toBe(true)
  })

  it("goes through all of a purpose's questions before repeating one", () => {
    const bank = BANK.filter((p) => p.purpose === 'calm')
    const calm = daysFrom('2026-10-21', 6 * bank.length)
      .map((d) => pickTonight(base(d), null))
      .filter((p) => p.purpose === 'calm')
    expect(calm).toHaveLength(bank.length)
    expect(new Set(calm.map((p) => p.id)).size).toBe(bank.length)
  })

  it('skips a question answered in the last 30 days', () => {
    const first = pickTonight(base('2026-10-21'), null)
    const recent = pickTonight(base('2026-10-21', { answered: [{ promptId: first.id, date: '2026-10-01' }] }), null)
    expect(recent.purpose).toBe(first.purpose)
    expect(recent.id).not.toBe(first.id)
    const longAgo = pickTonight(base('2026-10-21', { answered: [{ promptId: first.id, date: '2026-09-01' }] }), null)
    expect(longAgo.id).toBe(first.id)
  })

  it('"Another" moves to a different kind of question, and the choice holds for the day', () => {
    const input = base('2026-10-21')
    const first = pickTonight(input, null)
    const second = nextTonight(input, first.id)
    expect(second.purpose).not.toBe(first.purpose)
    expect(pickTonight(input, second.id)).toEqual(second)
    // A saved choice that is no longer on offer is ignored.
    expect(pickTonight(input, 'no-such-question')).toEqual(first)
  })

  it('every third evening, starts with a question about a pattern in your own days', () => {
    const pattern: PatternPrompt = {
      id: 'pattern:drain:commute',
      kind: 'drain',
      question: 'Commute took your energy 3 times lately. What about it drains you?',
    }
    const dates = daysFrom('2026-10-21', 3)
    expect(dates.filter((d) => dayNumber(d) % 3 === 0)).toHaveLength(1)
    const picks = dates.map((d) => pickTonight(base(d, { patterns: [pattern] }), null))
    expect(picks.filter((p) => p.purpose === 'pattern').map((p) => p.question)).toEqual([pattern.question])
  })

  it('says which method each question comes from', () => {
    expect(pickTonight(base('2026-10-21'), null).method.length).toBeGreaterThan(10)
    expect(BANK.every((p) => p.text.endsWith('?'))).toBe(true)
  })
})

describe('questions from your own days', () => {
  const today = '2026-10-21'
  let n = 0
  const entry = (daysAgo: number, activity: string, energy: Entry['energy'], over: Partial<Entry> = {}): Entry => {
    n += 1
    return {
      id: `p${n}`,
      date: addDays(today, -daysAgo),
      part: 'morning',
      activity,
      engagement: 3,
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
  // Fictional fortnight. Commute: −2, −2, −1, +1 (drained 3 times, average −1). Deep work: +2, +2, +1 with time flying twice.
  const entries = [
    entry(1, 'Commute', -2),
    entry(2, 'Commute', -2),
    entry(3, 'Commute', -1),
    entry(4, 'Commute', 1),
    entry(1, 'Deep work', 2, { flow: true }),
    entry(3, 'Deep work', 2, { flow: true }),
    entry(5, 'Deep work', 1),
    entry(0, 'Team meeting', -2), // today: not part of a pattern yet
    entry(0, 'Team meeting', -2),
    entry(0, 'Team meeting', -2),
    entry(20, 'Old chore', -2), // more than two weeks ago
    entry(21, 'Old chore', -2),
    entry(22, 'Old chore', -2),
  ]
  const review = (play: number): Review => {
    const note = { entryId: null, activities: '', environments: '', interactions: '', objects: '', users: '', why: '' }
    return {
      id: `r${play}`,
      periodStart: '2026-10-12',
      periodEnd: '2026-10-18',
      balance: { health: 7, work: 6, play, love: 8 },
      best: note,
      worst: note,
      reflection: '',
      takeaway: '',
      completedAt: 1,
      createdAt: 1,
      updatedAt: 1,
    }
  }

  it('finds what drained you, what gave you energy, where time flew, and a low balance area', () => {
    expect(findPatterns(today, entries, [review(3)], []).map((p) => [p.id, p.question])).toEqual([
      ['pattern:drain:commute', 'Commute took your energy 3 times lately. What about it drains you?'],
      ['pattern:energy:deep work', 'Deep work keeps giving you energy. What is it about it?'],
      ['pattern:flow:deep work', 'Time flew during deep work twice lately. What made that possible?'],
      ['pattern:balance:play', "Play has been low in your reviews. What's one small thing that would help?"],
    ])
  })

  it('needs a real pattern: nothing from today, nothing older than two weeks, no balance above 4', () => {
    const found = findPatterns(today, entries, [review(6)], [])
    expect(found.some((p) => /team meeting|old chore/i.test(p.question))).toBe(false)
    expect(found.some((p) => p.kind === 'balance')).toBe(false)
  })

  it("doesn't ask about the same pattern within two weeks of answering it", () => {
    const recent = findPatterns(today, entries, [], [{ promptId: 'pattern:drain:commute', date: '2026-10-16' }])
    expect(recent.some((p) => p.id === 'pattern:drain:commute')).toBe(false)
    const older = findPatterns(today, entries, [], [{ promptId: 'pattern:drain:commute', date: '2026-10-01' }])
    expect(older.some((p) => p.id === 'pattern:drain:commute')).toBe(true)
  })
})
