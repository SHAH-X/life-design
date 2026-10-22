import { describe, expect, it } from 'vitest'
import { type Entry, entryDefaults } from '../../src/db/types'
import { matchesSearch } from '../../src/domain/search'

// Fictional example data.
const entry: Entry = {
  id: 'e1',
  date: '2026-10-20',
  part: 'afternoon',
  activity: 'Team meeting',
  engagement: 2,
  energy: -2,
  flow: false,
  where: [],
  people: ['Alex'],
  objects: [],
  during: ['Distracted'],
  after: ['Frustrated'],
  note: 'Went in circles',
  source: 'evening',
  createdAt: 1,
  updatedAt: 1,
  ...entryDefaults(),
  reflections: [{ question: 'What went well?', text: 'The demo landed' }],
  intention: { kind: 'differently', text: 'Ask for an agenda', status: 'open', updatedAt: 1 },
}

describe('matchesSearch: finding an entry by anything in it', () => {
  it('looks through what you did, your words, your answers and your next step, ignoring case', () => {
    for (const query of ['team', 'CIRCLES', 'frustrated', 'demo', 'agenda', 'went well']) expect(matchesSearch(entry, query)).toBe(true)
  })

  it('needs every word to match, and an empty search matches everything', () => {
    expect(matchesSearch(entry, 'team demo')).toBe(true)
    expect(matchesSearch(entry, 'team holiday')).toBe(false)
    expect(matchesSearch(entry, '   ')).toBe(true)
  })
})
