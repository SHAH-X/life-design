import { describe, expect, it } from 'vitest'
import type { Entry, IkigaiItem } from '../../src/db/types'
import { gapQuestion, IKIGAI_GROUPS, ikigaiEvidence, ikigaiGroup, ikigaiLine, ikigaiSuggestions } from '../../src/domain/ikigai'

// Fictional example data. Circles: L love it, G good at it, N the world needs it, P could be paid for it.
const item = (text: string, circles: string, over: Partial<IkigaiItem> = {}): IkigaiItem => ({
  id: text,
  text,
  love: circles.includes('L'),
  goodAt: circles.includes('G'),
  worldNeeds: circles.includes('N'),
  paidFor: circles.includes('P'),
  linkedActivities: [],
  notes: '',
  createdAt: 1,
  updatedAt: 1,
  ...over,
})

let n = 0
const entry = (activity: string, energy: Entry['energy'], flow = false): Entry => ({
  id: `e${(n += 1)}`,
  date: '2026-10-20',
  part: 'morning',
  activity,
  engagement: 4,
  energy,
  flow,
  where: [],
  people: [],
  objects: [],
  during: [],
  after: [],
  note: '',
  source: 'evening',
  createdAt: n,
  updatedAt: n,
})

describe('ikigaiGroup: every item lands in exactly one group', () => {
  it('all four is a candidate, three is close, a named pair is its zone, and the rest are still taking shape', () => {
    expect(ikigaiGroup(item('a', 'LGNP'))).toBe('ikigai')
    for (const circles of ['GNP', 'LNP', 'LGP', 'LGN']) expect(ikigaiGroup(item('a', circles))).toBe('close')
    expect(ikigaiGroup(item('a', 'LG'))).toBe('passion')
    expect(ikigaiGroup(item('a', 'LN'))).toBe('mission')
    expect(ikigaiGroup(item('a', 'GP'))).toBe('profession')
    expect(ikigaiGroup(item('a', 'NP'))).toBe('vocation')
    for (const circles of ['LP', 'GN', 'L', 'G', 'N', 'P', '']) expect(ikigaiGroup(item('a', circles))).toBe('forming')
  })

  it('names every group in words: no counts or scores (v1 ranked items "x/4")', () => {
    expect(IKIGAI_GROUPS.map((g) => g.key)).toEqual(['ikigai', 'close', 'passion', 'mission', 'profession', 'vocation', 'forming'])
    for (const group of IKIGAI_GROUPS) expect(group.title).not.toMatch(/\d|\b(one|two|three|four)\b/i)
  })
})

describe('ikigaiLine: the words under an item', () => {
  it('says what is missing when an item is close to Ikigai', () => {
    expect(ikigaiLine(item('Writing', 'LGN'))).toBe('Not yet: could be paid for it')
    expect(ikigaiLine(item('Writing', 'GNP'))).toBe('Not yet: love it')
  })

  it('says what is true while an item is still taking shape', () => {
    expect(ikigaiLine(item('Pottery', 'LP'))).toBe('You love it · you could be paid for it')
    expect(ikigaiLine(item('Pottery', ''))).toBe('Nothing tapped yet')
  })

  it('adds nothing where the group title already says it', () => {
    expect(ikigaiLine(item('Teaching', 'LGNP'))).toBeNull()
    expect(ikigaiLine(item('Cooking', 'LG'))).toBeNull()
  })
})

describe('gapQuestion: the missing circle, as a question a prototype could answer', () => {
  it('asks about the one circle that is missing', () => {
    expect(gapQuestion(item('Teaching design', 'LGN'))).toBe('Could I be paid for teaching design?')
    expect(gapQuestion(item('Teaching design', 'GNP'))).toBe('Would I enjoy teaching design?')
    expect(gapQuestion(item('Teaching design', 'LNP'))).toBe('Could I get good at teaching design?')
    expect(gapQuestion(item('Teaching design', 'LGP'))).toBe('Who would value teaching design?')
  })

  it('keeps a name or abbreviation as written', () => {
    expect(gapQuestion(item('UX research', 'LGN'))).toBe('Could I be paid for UX research?')
  })

  it('asks nothing unless exactly one circle is missing', () => {
    expect(gapQuestion(item('a', 'LGNP'))).toBeNull()
    expect(gapQuestion(item('a', 'LG'))).toBeNull()
  })
})

describe('ikigaiEvidence: the linked activities, in words', () => {
  it('says how often it gave energy, how many times, and when time flew', () => {
    const entries = [...[2, 2, 1, 2, -1, 0].map((e, i) => entry(i % 2 ? 'Deep work' : 'deep work', e as Entry['energy'], i < 2))]
    expect(ikigaiEvidence(item('Teaching', 'LGNP', { linkedActivities: ['Deep work'] }), entries)).toEqual([
      'Deep work: usually gives energy · 6 times · time flew twice',
    ])
  })

  it('logged under 3 times, it only says how many times: too few to say "usually"', () => {
    expect(ikigaiEvidence(item('Pottery', 'LG', { linkedActivities: ['Pottery'] }), [entry('Pottery', 2), entry('Pottery', 2)])).toEqual([
      'Pottery: logged twice',
    ])
  })

  it('says nothing for a linked activity that has not been logged', () => {
    expect(ikigaiEvidence(item('Pottery', 'LG', { linkedActivities: ['Pottery'] }), [entry('Reading', 2)])).toEqual([])
  })
})

describe('ikigaiSuggestions: activities that keep giving energy and are not on the map yet', () => {
  const days = [
    ...[1, 2, 3].map(() => entry('Evening run', 2)),
    ...[1, 2, 3, 4].map(() => entry('Deep work', 2)),
    ...[1, 2, 3, 4].map(() => entry('Commute', -2)),
    ...[1, 2].map(() => entry('Cooking', 2)),
  ]

  it('suggests energising activities logged 3 or more times, best first', () => {
    expect(ikigaiSuggestions(days, [])).toEqual(['Deep work', 'Evening run'])
  })

  it('skips what is on the map already, by name or by link', () => {
    expect(ikigaiSuggestions(days, [item('deep work', 'LG')])).toEqual(['Evening run'])
    expect(ikigaiSuggestions(days, [item('Running', 'L', { linkedActivities: ['evening run'] })])).toEqual(['Deep work'])
  })

  it('suggests at most three', () => {
    const many = ['A', 'B', 'C', 'D'].flatMap((a) => [1, 2, 3].map(() => entry(a, 2)))
    expect(ikigaiSuggestions(many, [])).toHaveLength(3)
  })
})
