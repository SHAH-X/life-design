import { describe, expect, it } from 'vitest'
import { type Entry, entryDefaults } from '../../src/db/types'
import { possibleInsight } from '../../src/domain/summary'

// Fictional example data.
let n = 0
const entry = (activity: string, over: Partial<Entry> = {}): Entry => {
  n += 1
  return {
    id: `e${n}`,
    date: '2026-10-20',
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

describe('possibleInsight: only with evidence', () => {
  const meeting = (energyEffect: Entry['energyEffect'], over: Partial<Entry> = {}) =>
    entry('Team meeting', { energyEffect, energy: energyEffect === 'used' ? -2 : energyEffect === 'gave' ? 2 : 0, ...over })

  it('appears with 3 or more finished entries mostly one way, as an observation and a question, with its entries', () => {
    const history = [meeting('used'), meeting('used'), meeting('gave'), meeting('used'), entry('team meeting', { energyEffect: 'used', energy: -2 })]
    const latest = history[4] as Entry
    const insight = possibleInsight(latest, history)
    expect(insight?.text).toBe('Team meeting has used up your energy in 4 of your 5 entries about it.')
    expect(insight?.question).toBe('What would make it easier?')
    expect(insight?.entryIds).toEqual(history.map((e) => e.id))
    // Which way it goes, for the card's thin coloured edge (red took energy).
    expect(insight?.direction).toBe('takes')
  })

  it('says when something keeps giving energy', () => {
    const history = [entry('Run', { energyEffect: 'gave', energy: 2 }), entry('Run', { energyEffect: 'gave', energy: 2 }), entry('Run', { energyEffect: 'gave', energy: 2 })]
    expect(possibleInsight(history[2] as Entry, history)).toMatchObject({
      text: 'Run has given you energy in 3 of your 3 entries about it.',
      question: 'What makes it work so well?',
      direction: 'gives',
    })
  })

  it('stays silent with fewer than 3 entries, a mixed picture, drafts, skipped energy or free writing', () => {
    const two = [meeting('used'), meeting('used')]
    expect(possibleInsight(two[1] as Entry, two)).toBeNull()
    const mixed = [meeting('used'), meeting('gave'), meeting('little'), meeting('gave'), meeting('used')]
    expect(possibleInsight(mixed[4] as Entry, mixed)).toBeNull()
    const drafts = [meeting('used'), meeting('used', { status: 'draft' }), meeting('used', { status: 'draft' })]
    expect(possibleInsight(drafts[0] as Entry, drafts)).toBeNull()
    const skipped = [meeting('used'), meeting('used'), meeting(null, { skipped: ['energy'] })]
    expect(possibleInsight(skipped[0] as Entry, skipped)).toBeNull()
    const free = entry('', { kind: 'free', note: 'A long day' })
    expect(possibleInsight(free, [free])).toBeNull()
  })
})
