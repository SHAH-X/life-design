import { describe, expect, it } from 'vitest'
import { type Answer, type Day, type Entry, entryDefaults, type Step, type Week } from '../../src/db/types'
import { buildReviewPackage, firstWrittenDate, periodFor, REVIEW_INSTRUCTIONS, type ReviewData } from '../../src/domain/review'

// Review a period (v0.12): one package, in words, for an AI chat or the in-app review. Fictional example data.
let n = 0
const entry = (date: string, activity: string, over: Partial<Entry> = {}): Entry => {
  n += 1
  return {
    id: `e${n}`,
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
    createdAt: new Date(`${date}T21:14:00`).getTime(),
    updatedAt: 1,
    ...entryDefaults(),
    ...over,
  }
}

describe('periodFor: the periods to choose from', () => {
  const thursday = '2026-10-22'
  it('gives this and last week, Monday to Sunday', () => {
    expect(periodFor('this-week', thursday)).toEqual({ start: '2026-10-19', end: '2026-10-25' })
    expect(periodFor('last-week', thursday)).toEqual({ start: '2026-10-12', end: '2026-10-18' })
  })

  it('gives this and last month, across a year end too', () => {
    expect(periodFor('this-month', thursday)).toEqual({ start: '2026-10-01', end: '2026-10-31' })
    expect(periodFor('last-month', thursday)).toEqual({ start: '2026-09-01', end: '2026-09-30' })
    expect(periodFor('last-month', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
  })

  it('gives all time from the first day anything was written, or just today with nothing written', () => {
    expect(periodFor('all-time', '2026-10-22', '2025-03-04')).toEqual({ start: '2025-03-04', end: '2026-10-22' })
    expect(periodFor('all-time', '2026-10-22')).toEqual({ start: '2026-10-22', end: '2026-10-22' })
    const days: Day[] = [{ date: '2026-09-01', smallJoy: 'Rain', createdAt: 1, updatedAt: 1 }, { date: '2026-01-01', smallJoy: '', createdAt: 1, updatedAt: 1 }]
    expect(firstWrittenDate({ entries: [entry('2026-10-01', 'Walk'), entry('2025-02-02', 'Draft', { status: 'draft' })], days, answers: [] })).toBe('2026-09-01')
    expect(firstWrittenDate({ entries: [], days: [], answers: [] })).toBeNull()
  })
})

describe('buildReviewPackage: what an AI is given', () => {
  const meeting = entry('2026-10-20', 'Team meeting', {
    energy: -2,
    energyEffect: 'used',
    during: ['Distracted'],
    after: ['Tired', 'Frustrated'],
    people: ['Alex'],
    note: 'Went in circles again.',
    take: 'Meetings without an agenda drain me',
  })
  const free = entry('2026-10-21', '', { kind: 'free', purpose: 'free', note: "Couldn't sleep\nThinking about the move", skipped: ['engagement', 'energy'] })
  const draft = entry('2026-10-21', 'Gym', { status: 'draft' })
  const outside = entry('2026-10-12', 'Old meeting')
  const agenda: Step = {
    id: 's1',
    text: 'Ask for an agenda first',
    when: 'before the meeting',
    kind: 'once',
    status: 'active',
    entryIds: [meeting.id],
    activity: 'team meeting',
    createdAt: 1,
    updatedAt: 1,
    finishedAt: null,
  }
  const joy: Day = { date: '2026-10-20', smallJoy: 'Coffee in the sun', createdAt: 1, updatedAt: 1 }
  const answer: Answer = { id: 'a1', date: '2026-10-21', promptId: 'know-1', purpose: 'know', question: 'What mattered most today?', text: 'Calling my sister', createdAt: 1, updatedAt: 1 }
  const carry: Week = { id: '2026-10-19', carry: 'Walk at lunch', createdAt: 1, updatedAt: 1 }
  const data: ReviewData = {
    entries: [meeting, free, draft, outside],
    days: [joy],
    answers: [answer],
    weeks: [carry],
    steps: [agenda],
    purpose: { primary: 'know', focus: { know: 'What kind of work suits me' }, goal: '' },
  }
  const pack = buildReviewPackage(data, { start: '2026-10-19', end: '2026-10-25' }, ' Why am I tired on Mondays? ')

  it('starts with the instructions and what to focus on, then the period', () => {
    expect(pack.text.startsWith(REVIEW_INSTRUCTIONS)).toBe(true)
    expect(pack.text).toContain('Please look especially at: Why am I tired on Mondays?')
    expect(pack.data).toMatch(/My journal, 19\s?–\s?25 October 2026/)
    expect(pack.data).toContain('What I journal for: Understand myself (what kind of work suits me)')
  })

  it('gives each finished entry in the period in words, never numbers, with its writing and take', () => {
    expect(pack.data).toContain('Team meeting')
    expect(pack.data).toContain('What it was like: distracted')
    expect(pack.data).toContain('Energy: it used up my energy')
    expect(pack.data).toContain('Feelings: tired, frustrated')
    expect(pack.data).toContain('With: Alex')
    expect(pack.data).toContain('Went in circles again.')
    expect(pack.data).toContain('My take: Meetings without an agenda drain me')
    expect(pack.data).toContain("Free writing (logged 21:14): Couldn't sleep")
    expect(pack.data).not.toMatch(/[−-]2|energy: -?\d/i)
  })

  it("says which of Today's questions free writing answers (v0.16)", () => {
    const reply = { ...free, id: 'reply', replyTo: { id: 'loop:x#1', question: 'On Tue 13 Oct you wrote “Need to call the bank”. Where are you with it?' } }
    const answered = buildReviewPackage({ ...data, entries: [reply] }, { start: '2026-10-19', end: '2026-10-25' }, '')
    expect(answered.data).toContain('Free writing (logged 21:14, answering "On Tue 13 Oct you wrote “Need to call the bank”. Where are you with it?"): Couldn\'t sleep')
  })

  it('leaves out drafts and other weeks', () => {
    expect(pack.data).not.toContain('Gym')
    expect(pack.data).not.toContain('Old meeting')
  })

  it('adds small joys, evening answers, next steps and what to carry into the week', () => {
    expect(pack.data).toContain('Small joy: Coffee in the sun')
    expect(pack.data).toContain('What mattered most today? Calling my sister')
    expect(pack.data).toContain('Working on: Before the meeting: Ask for an agenda first (once)')
    expect(pack.data).toContain('To carry into the week of 19 October: Walk at lunch')
  })

  it('counts what is in it, so you see before anything leaves', () => {
    expect(pack.counts).toEqual({ entries: 2, days: 2, smallJoys: 1, answers: 1, steps: 1 })
    expect(pack.words).toBeGreaterThan(40)
  })

  it('"Only entries about this": just those entries, with what came from their days, and it says the rest is left out', () => {
    const narrowed = buildReviewPackage(data, { start: '2026-10-19', end: '2026-10-25' }, ' Why am I tired on Mondays? ', new Set([meeting.id]))
    expect(narrowed.data).toContain('Only the entries about "Why am I tired on Mondays?" are here, chosen by the app')
    expect(narrowed.data).toContain('Team meeting')
    expect(narrowed.data).toContain('Small joy: Coffee in the sun') // the meeting's day
    expect(narrowed.data).toContain('Working on: Before the meeting: Ask for an agenda first') // came from the meeting
    expect(narrowed.data).toContain('To carry into the week of 19 October')
    expect(narrowed.data).not.toContain("Couldn't sleep") // free writing, not chosen
    expect(narrowed.data).not.toContain('Calling my sister') // an answer from another day
    expect(narrowed.counts).toEqual({ entries: 1, days: 1, smallJoys: 1, answers: 0, steps: 1 })
  })

  it('narrowed to nothing, sends nothing', () => {
    const none = buildReviewPackage(data, { start: '2026-10-19', end: '2026-10-25' }, 'x', new Set())
    expect(none.counts).toEqual({ entries: 0, days: 0, smallJoys: 0, answers: 0, steps: 0 })
  })
})
