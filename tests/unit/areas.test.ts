import { describe, expect, it } from 'vitest'
import { type AreaId, areaCentres, areaLines, entryTitle, LIFE_AREAS, placeEntries } from '../../src/domain/areas'
import { areaEntry } from '../fixtures/areas'
import { fakeEntry } from '../fixtures/meaning'

// A stand-in for the model: each area's examples point one way of their own (one number each), so what a piece is
// about can be set exactly. The real model's behaviour is in areasModel.test.ts.

const DIMS = LIFE_AREAS.length
const axis = (id: AreaId) => LIFE_AREAS.findIndex((a) => a.id === id)
const towards = (mix: Partial<Record<AreaId, number>>) => {
  const v = new Float32Array(DIMS)
  for (const [id, w] of Object.entries(mix)) v[axis(id as AreaId)] = w
  const n = Math.hypot(...v)
  return v.map((x) => x / n)
}
const CENTRES = areaCentres(new Map(LIFE_AREAS.map((a) => [a.id, a.examples.map(() => towards({ [a.id]: 1 }))])))
const place = (pieces: Record<string, Float32Array[]>) => placeEntries(new Map(Object.entries(pieces)), CENTRES)

describe('the areas', () => {
  it('has seven starter areas, and every area has examples and a name of its own', () => {
    expect(LIFE_AREAS.filter((a) => a.starter).map((a) => a.name)).toEqual(['Money', 'Work', 'Tech & learning', 'Mindset', 'Health', 'People', 'Home & errands'])
    expect(new Set(LIFE_AREAS.map((a) => a.id)).size).toBe(LIFE_AREAS.length)
    expect(new Set(LIFE_AREAS.map((a) => a.name)).size).toBe(LIFE_AREAS.length)
    for (const area of LIFE_AREAS) expect(area.examples.length).toBeGreaterThanOrEqual(2)
  })
})

describe('placeEntries: each entry in the area it is clearly about, or none', () => {
  it('places writing in a starter area from the first entry', () => {
    expect(place({ rent: [towards({ money: 1 })] })).toEqual(new Map([['rent', ['money']]]))
  })

  it('leaves writing that is as much about two areas as one in none: a wrong area is worse than none', () => {
    expect(place({ mixed: [towards({ money: 1, work: 1 })] })).toEqual(new Map())
  })

  it('shows a possible area only once 3 entries are in it, and then for all of them', () => {
    const trips = { a: [towards({ travel: 1 })], b: [towards({ travel: 1 })] }
    expect(place(trips)).toEqual(new Map())
    expect(place({ ...trips, c: [towards({ travel: 1 })] })).toEqual(
      new Map([
        ['a', ['travel']],
        ['b', ['travel']],
        ['c', ['travel']],
      ]),
    )
  })

  it('keeps the starter area of an entry whose possible area does not show yet', () => {
    const placed = place({ trip: [towards({ travel: 1, money: 0.45 })] })
    expect(placed.get('trip')).toEqual(['money'])
    const three = place({ a: [towards({ travel: 1, money: 0.45 })], b: [towards({ travel: 1 })], c: [towards({ travel: 1 })] })
    expect(three.get('a')).toEqual(['travel'])
  })

  it('gives long writing whose pieces are about different things both areas (most of it first), never more than two', () => {
    const week = [towards({ health: 1 }), towards({ work: 1 }), towards({ work: 1 }), towards({ people: 1 })]
    expect(place({ week }).get('week')).toEqual(['work', 'health'])
  })
})

describe('areaLines: Insights counts, ranked only with 3+', () => {
  const byEntry = new Map<string, AreaId[]>([
    ['m1', ['money']],
    ['m2', ['money']],
    ['m3', ['money', 'health']],
    ['w1', ['work']],
    ['w2', ['work']],
    ['w3', ['work']],
    ['w4', ['work']],
    ['p1', ['people']],
  ])

  it('ranks areas with 3+ entries by how many, and lists the rest by name; an entry in two counts in both', () => {
    const { ranked, also } = areaLines([...byEntry.keys(), 'unsorted'], byEntry)
    expect(ranked.map((l) => [l.name, l.entryIds.length])).toEqual([
      ['Work', 4],
      ['Money', 3],
    ])
    expect(also.map((l) => [l.name, l.entryIds])).toEqual([
      ['Health', ['m3']],
      ['People', ['p1']],
    ])
  })

  it('counts only the entries it is given (a period)', () => {
    const { ranked, also } = areaLines(['m1', 'w1'], byEntry)
    expect(ranked).toEqual([])
    expect(also.map((l) => l.name)).toEqual(['Money', 'Work'])
  })
})

describe('entryTitle', () => {
  it('names free writing by its areas, or "Free writing" while it is in none; an activity by what you did', () => {
    const free = areaEntry({ id: 'f', text: 'Paid the rent and the gym', expect: [] })
    expect(entryTitle(free)).toBe('Free writing')
    expect(entryTitle(free, ['money'])).toBe('Money')
    expect(entryTitle(free, ['money', 'health'])).toBe('Money · Health')
    expect(entryTitle(fakeEntry('a', 'Hike', 'Up the ridge.', [], []), ['health'])).toBe('Hike')
  })
})
