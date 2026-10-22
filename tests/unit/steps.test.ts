import { describe, expect, it } from 'vitest'
import type { Step } from '../../src/db/types'
import {
  findLookAlike,
  isStale,
  kindFor,
  lookAlike,
  lookAlikePairs,
  STALE_DAYS,
  stepLine,
  stepsForActivity,
  stepsFromIntentions,
} from '../../src/domain/steps'

// Next steps you can manage (v0.11). Fictional example data.
const DAY = 86_400_000
let n = 0
const step = (text: string, over: Partial<Step> = {}): Step => {
  n += 1
  return { id: `s${n}`, text, when: '', kind: 'once', status: 'active', entryIds: [], activity: '', createdAt: n, updatedAt: n, finishedAt: null, ...over }
}

describe('kindFor: once or ongoing, from what you chose', () => {
  it('makes "Do it again" and "Make time…" ongoing, and trying or exploring something once', () => {
    expect(kindFor('again')).toBe('ongoing')
    expect(kindFor('time')).toBe('ongoing')
    expect(kindFor('differently')).toBe('once')
    expect(kindFor('explore')).toBe('once')
  })
})

describe('stepsFromIntentions: next steps kept on entries before v0.11', () => {
  const entry = (id: string, activity: string, intention: unknown) => ({ id, activity: ` ${activity} `, createdAt: 5, updatedAt: 9, intention })

  it('becomes one step each, linked to its entry and its activity, keeping where it stood', () => {
    const steps = stepsFromIntentions([
      entry('e1', 'Team meeting', { kind: 'differently', text: 'Ask for an agenda first', status: 'open', updatedAt: 20 }),
      entry('e2', 'Evening run', { kind: 'again', text: '', status: 'done', updatedAt: 30 }),
      entry('e3', 'Commute', { kind: 'explore', text: 'Why Mondays?', status: 'dropped', updatedAt: 40 }),
    ])
    expect(steps).toEqual([
      { id: 'from-e1', text: 'Ask for an agenda first', when: '', kind: 'once', status: 'active', entryIds: ['e1'], activity: 'team meeting', createdAt: 20, updatedAt: 20, finishedAt: null },
      { id: 'from-e2', text: 'Do it again', when: '', kind: 'ongoing', status: 'done', entryIds: ['e2'], activity: 'evening run', createdAt: 30, updatedAt: 30, finishedAt: 30 },
      { id: 'from-e3', text: 'Why Mondays?', when: '', kind: 'once', status: 'stopped', entryIds: ['e3'], activity: 'commute', createdAt: 40, updatedAt: 40, finishedAt: 40 },
    ])
  })

  it('leaves "Remember this", entries without a next step, and anything malformed alone', () => {
    expect(
      stepsFromIntentions([
        entry('e1', 'Walk', { kind: 'remember', text: 'Small steps', status: 'open', updatedAt: 1 }),
        entry('e2', 'Walk', null),
        entry('e3', 'Walk', { kind: 'again' }),
        'not an entry',
      ]),
    ).toEqual([])
  })
})

describe('lookAlike: two steps that say the same thing in similar words', () => {
  it('matches the same words, a few changed, or one inside the other', () => {
    expect(lookAlike('Walk 10 minutes every evening', 'walk 10 min each evening')).toBe(true)
    expect(lookAlike('Ask for an agenda first', 'Ask for an agenda')).toBe(true)
    expect(lookAlike('Walking after dinner', 'Walk after dinner')).toBe(true)
  })

  it('keeps different steps apart, and never matches on small words alone', () => {
    expect(lookAlike('Walk after dinner', 'Call Mum on Sundays')).toBe(false)
    expect(lookAlike('Go for a walk', 'Go for a swim')).toBe(false)
    expect(lookAlike('Do it', 'Do it again')).toBe(false)
    expect(lookAlike('', 'Walk')).toBe(false)
  })

  it('finds a step you already have, only among those you are working on', () => {
    const walk = step('Walk 10 minutes every evening', { updatedAt: 50 })
    const done = step('Walk after dinner', { status: 'done' })
    expect(findLookAlike('walk 10 min each evening', [done, walk])).toBe(walk)
    expect(findLookAlike('Walk after dinner', [done])).toBeUndefined()
  })

  it('lists look-alike pairs on the page, each once', () => {
    const a = step('Ask for an agenda first')
    const b = step('Ask for an agenda')
    const c = step('Walk after dinner')
    expect(lookAlikePairs([a, b, c]).map(([x, y]) => [x.id, y.id])).toEqual([[a.id, b.id]])
  })
})

describe('steps in their place', () => {
  it('read with their cue first: "After dinner: Walk 10 minutes"', () => {
    expect(stepLine(step('Walk 10 minutes', { when: ' after dinner ' }))).toBe('After dinner: Walk 10 minutes')
    expect(stepLine(step('Walk 10 minutes'))).toBe('Walk 10 minutes')
  })

  it('come back when you write about the same activity, while you are working on them', () => {
    const agenda = step('Ask for an agenda first', { activity: 'team meeting' })
    const finished = step('Take notes', { activity: 'team meeting', status: 'done' })
    const byHand = step('Read more', { activity: '' })
    expect(stepsForActivity([agenda, finished, byHand], ' Team Meeting ')).toEqual([agenda])
    expect(stepsForActivity([byHand], '')).toEqual([])
  })

  it(`count as not touched lately after ${STALE_DAYS} days, only while you are working on them`, () => {
    const now = 100 * DAY
    expect(isStale(step('A', { updatedAt: now - (STALE_DAYS + 1) * DAY }), now)).toBe(true)
    expect(isStale(step('B', { updatedAt: now - 2 * DAY }), now)).toBe(false)
    expect(isStale(step('C', { updatedAt: 0, status: 'done' }), now)).toBe(false)
  })
})
