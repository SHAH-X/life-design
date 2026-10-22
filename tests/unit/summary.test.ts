import { describe, expect, it } from 'vitest'
import { type Entry, entryDefaults } from '../../src/db/types'
import { summarize } from '../../src/domain/summary'

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

describe('summarize: what happened, in your words', () => {
  it('takes the first sentence of what you wrote', () => {
    const e = entry('Team meeting', { reflections: [{ question: 'What went well?', text: 'The demo landed. Then we ran over.' }] })
    expect(summarize(e, [e]).happened).toEqual({ title: 'Team meeting', quote: 'The demo landed.' })
  })

  it('prefers the note, and quotes nothing when nothing was written', () => {
    const e = entry('Run', { note: 'Easy pace!  Felt strong', reflections: [{ question: 'What went well?', text: 'Hills' }] })
    expect(summarize(e, [e]).happened.quote).toBe('Easy pace!')
    expect(summarize(entry('Run'), []).happened.quote).toBeNull()
  })

  it('titles free writing by its first line', () => {
    const e = entry('', { kind: 'free', note: "Couldn't sleep\nKept thinking about the move", skipped: ['engagement', 'energy'] })
    expect(summarize(e, [e]).happened).toEqual({ title: "Couldn't sleep", quote: 'Kept thinking about the move' })
  })
})

describe('summarize: what you noticed, only what the entry says', () => {
  it('lists the energy answer, your feelings and what it was like, in words', () => {
    const e = entry('Team meeting', { energyEffect: 'used', energy: -2, after: ['Frustrated', 'Tired'], during: ['Distracted', 'Time flew'] })
    expect(summarize(e, [e]).noticed).toEqual(['It used up your energy', 'You felt frustrated and tired', 'While doing it: distracted · time flew'])
  })

  it('adds feelings found in your words that you did not tap', () => {
    const e = entry('Team meeting', { after: ['Tired'], note: 'Honestly a bit anxious about the deadline' })
    expect(summarize(e, [e]).noticed).toContain('In your words: anxious')
  })

  it('says nothing for skipped questions: no guesses', () => {
    const e = entry('Walk', { skipped: ['engagement', 'energy'] })
    expect(summarize(e, [e]).noticed).toEqual([])
  })
})

describe('summarize: a possible insight, only with evidence', () => {
  const meeting = (energyEffect: Entry['energyEffect'], over: Partial<Entry> = {}) =>
    entry('Team meeting', { energyEffect, energy: energyEffect === 'used' ? -2 : energyEffect === 'gave' ? 2 : 0, ...over })

  it('appears with 3 or more finished entries mostly one way, as an observation and a question, with its entries', () => {
    const history = [meeting('used'), meeting('used'), meeting('gave'), meeting('used'), entry('team meeting', { energyEffect: 'used', energy: -2 })]
    const latest = history[4] as Entry
    const insight = summarize(latest, history).insight
    expect(insight?.text).toBe('Team meeting has used up your energy in 4 of your 5 entries about it.')
    expect(insight?.question).toBe('What would make it easier?')
    expect(insight?.entryIds).toEqual(history.map((e) => e.id))
  })

  it('says when something keeps giving energy', () => {
    const history = [entry('Run', { energyEffect: 'gave', energy: 2 }), entry('Run', { energyEffect: 'gave', energy: 2 }), entry('Run', { energyEffect: 'gave', energy: 2 })]
    expect(summarize(history[2] as Entry, history).insight).toMatchObject({
      text: 'Run has given you energy in 3 of your 3 entries about it.',
      question: 'What makes it work so well?',
    })
  })

  it('stays silent with fewer than 3 entries, a mixed picture, drafts, skipped energy or free writing', () => {
    const two = [meeting('used'), meeting('used')]
    expect(summarize(two[1] as Entry, two).insight).toBeNull()
    const mixed = [meeting('used'), meeting('gave'), meeting('little'), meeting('gave'), meeting('used')]
    expect(summarize(mixed[4] as Entry, mixed).insight).toBeNull()
    const drafts = [meeting('used'), meeting('used', { status: 'draft' }), meeting('used', { status: 'draft' })]
    expect(summarize(drafts[0] as Entry, drafts).insight).toBeNull()
    const skipped = [meeting('used'), meeting('used'), meeting(null, { skipped: ['energy'] })]
    expect(summarize(skipped[0] as Entry, skipped).insight).toBeNull()
    const free = entry('', { kind: 'free', note: 'A long day' })
    expect(summarize(free, [free]).insight).toBeNull()
  })
})
