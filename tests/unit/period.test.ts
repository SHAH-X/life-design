import { describe, expect, it } from 'vitest'
import type { Entry } from '../../src/db/types'
import { defaultReviewPeriod, isReviewDue, nextReviewDate, pickMoments } from '../../src/reviews/period'

// 2026-10-21 is a Wednesday; 25 Oct a Sunday; 1 Nov the first Sunday of November.
const weekly = { kind: 'weekly', day: 0 } as const
const monthly = { kind: 'monthly', day: 0 } as const
const fortnightly = { kind: 'days', every: 14 } as const

describe('nextReviewDate', () => {
  it('is nothing until something has been logged', () => {
    expect(nextReviewDate(weekly, null, null)).toBeNull()
  })

  it('falls on the first scheduled day after logging began', () => {
    expect(nextReviewDate(weekly, null, '2026-10-21')).toBe('2026-10-25')
    expect(nextReviewDate(monthly, null, '2026-10-21')).toBe('2026-11-01')
    expect(nextReviewDate(fortnightly, null, '2026-10-21')).toBe('2026-11-03')
  })

  it('then follows on from the last review', () => {
    expect(nextReviewDate(weekly, '2026-10-25', '2026-10-01')).toBe('2026-11-01')
    expect(nextReviewDate(fortnightly, '2026-10-25', '2026-10-01')).toBe('2026-11-08')
  })

  it('is due on that day and after', () => {
    expect(isReviewDue('2026-10-24', '2026-10-25')).toBe(false)
    expect(isReviewDue('2026-10-25', '2026-10-25')).toBe(true)
    expect(isReviewDue('2026-10-30', '2026-10-25')).toBe(true)
    expect(isReviewDue('2026-10-30', null)).toBe(false)
  })
})

describe('defaultReviewPeriod', () => {
  it('covers everything since the last review', () => {
    expect(defaultReviewPeriod('2026-10-25', weekly, '2026-10-18', '2026-10-01')).toEqual({ start: '2026-10-19', end: '2026-10-25' })
  })

  it('otherwise looks back one schedule length, but not before logging began', () => {
    expect(defaultReviewPeriod('2026-10-25', weekly, null, '2026-10-01')).toEqual({ start: '2026-10-19', end: '2026-10-25' })
    expect(defaultReviewPeriod('2026-10-25', weekly, null, '2026-10-22')).toEqual({ start: '2026-10-22', end: '2026-10-25' })
    expect(defaultReviewPeriod('2026-10-25', monthly, null, '2026-01-01')).toEqual({ start: '2026-09-26', end: '2026-10-25' })
    expect(defaultReviewPeriod('2026-10-25', fortnightly, null, '2026-01-01')).toEqual({ start: '2026-10-12', end: '2026-10-25' })
  })
})

describe('pickMoments', () => {
  const e = (id: string, energy: Entry['energy'], engagement: Entry['engagement'], flow = false): Entry => ({
    id,
    date: '2026-10-20',
    part: 'morning',
    activity: id,
    engagement,
    energy,
    flow,
    where: [],
    people: [],
    objects: [],
    note: '',
    source: 'evening',
    createdAt: 1,
    updatedAt: 1,
  })

  it('picks the highest-energy moment as best and the lowest as worst', () => {
    const moments = pickMoments([e('meeting', -1, 2), e('run', 2, 4), e('deep work', 2, 5, true), e('commute', -2, 1)])
    expect(moments.best?.id).toBe('deep work')
    expect(moments.worst?.id).toBe('commute')
  })

  it('has no worst moment when there is only one entry, or nothing lower', () => {
    expect(pickMoments([e('run', 2, 4)])).toEqual({ best: expect.objectContaining({ id: 'run' }), worst: null })
    expect(pickMoments([e('a', 1, 3), e('b', 1, 3)]).worst).toBeNull()
    expect(pickMoments([])).toEqual({ best: null, worst: null })
  })
})
