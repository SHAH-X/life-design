import { describe, expect, it } from 'vitest'
import type { IkigaiItem, Prototype } from '../../src/db/types'
import { emptyPlan } from '../../src/domain/lifeDesign'
import { HOW_OPTIONS, howLine, NEXT_OPTIONS, newPrototype, questionSuggestions } from '../../src/domain/prototypes'

// Fictional example data.
const writing: IkigaiItem = {
  id: 'i1',
  text: 'Writing',
  love: true,
  goodAt: true,
  worldNeeds: true,
  paidFor: false,
  linkedActivities: [],
  notes: '',
  createdAt: 1,
  updatedAt: 1,
}

describe('questionSuggestions: questions worth testing, from your plans and your Ikigai map', () => {
  it("offers your plans' questions first (plan by plan), then what is missing on the map, without repeats", () => {
    const plans = [
      { ...emptyPlan(3, 1), questions: ['Would I enjoy teaching every day?', 'Could I live on less?'] },
      { ...emptyPlan(1, 1), questions: ['would I enjoy teaching every day?'] },
    ]
    expect(questionSuggestions(plans, [writing])).toEqual([
      { question: 'would I enjoy teaching every day?', planSlot: 1 },
      { question: 'Could I live on less?', planSlot: 3 },
      { question: 'Could I be paid for writing?', planSlot: null },
    ])
  })

  it('offers at most six', () => {
    const plans = [1, 2, 3].map((slot) => ({ ...emptyPlan(slot as 1 | 2 | 3, 1), questions: ['A?', 'B?', 'C?'].map((q) => `${slot}${q}`) }))
    expect(questionSuggestions(plans, [writing])).toHaveLength(6)
  })
})

describe('a prototype in words', () => {
  const planned = (over: Partial<Prototype>): Prototype => ({ ...newPrototype(1000), question: 'Would I enjoy teaching?', ...over })

  it('says how you will find out: talk to someone, or try it out', () => {
    expect(howLine(planned({ how: 'talk', withWhat: 'Maria, a design tutor' }))).toBe('Talk to Maria, a design tutor')
    expect(howLine(planned({ how: 'try', withWhat: 'a weekend pottery class' }))).toBe('Try: a weekend pottery class')
    expect(howLine(planned({ how: 'talk', withWhat: ' ' }))).toBe('Talk to someone')
    expect(howLine(planned({ how: 'try', withWhat: '' }))).toBe('Try it out')
  })

  it('starts as planned, with nothing learned yet', () => {
    expect(newPrototype(1000)).toMatchObject({ question: '', planSlot: null, how: 'talk', when: null, doneAt: null, learned: '', after: [], next: null, createdAt: 1000 })
  })

  it('offers Designing Your Life\'s two kinds of prototype, and what comes next, in words', () => {
    expect(HOW_OPTIONS.map((o) => o.label)).toEqual(['Talk to someone', 'Try it out'])
    expect(NEXT_OPTIONS.map((o) => o.label)).toEqual(['Keep exploring', 'Try something else', 'Enough for now'])
  })
})
