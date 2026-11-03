import { describe, expect, it } from 'vitest'
import type { AreaId } from '../../src/domain/areas'
import { layoutMap, thinkingMap } from '../../src/domain/thinkingMap'

// Fictional entries: each is an id on a day, with the areas the phone put it in (as lifeAreas gives them).

const day = (n: number) => `2026-10-${String(n).padStart(2, '0')}`

/** Entries in an area on some days, ids `<area><day>`. */
function journal(spec: Partial<Record<AreaId, readonly number[]>>) {
  const entries: { id: string; date: string }[] = []
  const byEntry = new Map<string, AreaId[]>()
  for (const [area, days] of Object.entries(spec) as [AreaId, readonly number[]][])
    for (const d of days) {
      const id = `${area}${d}`
      entries.push({ id, date: day(d) })
      byEntry.set(id, [area])
    }
  return { entries, byEntry }
}

describe('thinkingMap: dots', () => {
  it('has a dot for each area with 3+ entries and leaves out the rest, as Life areas does', () => {
    const { entries, byEntry } = journal({ money: [1, 2, 3], health: [4, 5, 6, 7], travel: [8, 9] })
    const { dots } = thinkingMap(entries, byEntry)
    expect(dots.map((d) => [d.id, d.entryIds.length])).toEqual([
      ['health', 4],
      ['money', 3],
    ])
  })

  it('counts an entry in two areas in both', () => {
    const { entries, byEntry } = journal({ money: [1, 2, 3], health: [4, 5, 6] })
    byEntry.set('money1', ['money', 'health'])
    const { dots } = thinkingMap(entries, byEntry)
    expect(dots.find((d) => d.id === 'health')?.entryIds).toContain('money1')
    expect(dots.find((d) => d.id === 'health')?.entryIds).toHaveLength(4)
    expect(dots.find((d) => d.id === 'money')?.entryIds).toHaveLength(3)
  })

  it('leaves out entries with no area, and an empty journal gives an empty map', () => {
    const { entries, byEntry } = journal({ money: [1, 2, 3] })
    entries.push({ id: 'none', date: day(4) })
    expect(thinkingMap(entries, byEntry).dots[0]?.entryIds).not.toContain('none')
    expect(thinkingMap([], new Map())).toEqual({ dots: [], lines: [] })
  })
})

describe('thinkingMap: lines', () => {
  // Ten days all written about: work on 1-4, money on 1-3 and 9-10 (3 days with work, 2 expected by chance), health on 5-8.
  const base = { work: [1, 2, 3, 4], money: [1, 2, 3, 9, 10], health: [5, 6, 7, 8] }

  it('joins two areas written about on 3+ of the same days, more often than chance would give', () => {
    const { entries, byEntry } = journal(base)
    const { lines } = thinkingMap(entries, byEntry)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ a: 'money', b: 'work', days: [day(1), day(2), day(3)] })
  })

  it('opens to the entries of those days in either area, and no others', () => {
    const { entries, byEntry } = journal(base)
    const line = thinkingMap(entries, byEntry).lines[0]!
    expect([...line.entryIds].sort()).toEqual(['money1', 'money2', 'money3', 'work1', 'work2', 'work3'])
  })

  it('draws no line for 2 shared days', () => {
    const { entries, byEntry } = journal({ work: [1, 2, 3, 4], money: [1, 2, 9, 10], health: [5, 6, 7, 8] })
    expect(thinkingMap(entries, byEntry).lines).toEqual([])
  })

  it('draws no line between areas written about on every day: they meet by chance', () => {
    const { entries, byEntry } = journal({ work: [1, 2, 3, 4, 5, 6], money: [1, 2, 3, 4, 5, 6], health: [1, 2, 3, 4, 5, 6] })
    expect(thinkingMap(entries, byEntry).lines).toEqual([])
  })

  it('counts an entry in two areas as both being written about that day', () => {
    const { entries, byEntry } = journal({ work: [1, 2, 3, 4, 5], money: [6, 7, 8], health: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20] })
    for (const d of [1, 2, 3]) byEntry.set(`work${d}`, ['work', 'money'])
    const { lines } = thinkingMap(entries, byEntry)
    expect(lines.map((l) => [l.a, l.b, l.days.length])).toEqual([['money', 'work', 3]])
  })

  it('gives the same map however the entries are ordered', () => {
    const { entries, byEntry } = journal(base)
    expect(thinkingMap([...entries].reverse(), byEntry)).toEqual(thinkingMap(entries, byEntry))
  })
})

describe('layoutMap', () => {
  const { entries, byEntry } = journal({ work: [1, 2, 3, 4], money: [1, 2, 3, 9, 10], health: [5, 6, 7, 8], travel: [11, 12, 13] })
  const map = thinkingMap(entries, byEntry)

  it('puts every dot inside the box and no two on top of each other', () => {
    const placed = layoutMap(map, { width: 320, height: 300 })
    expect(placed).toHaveLength(4)
    for (const p of placed) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(0)
      expect(p.x + p.r).toBeLessThanOrEqual(320)
      expect(p.y - p.r).toBeGreaterThanOrEqual(0)
      expect(p.y + p.r).toBeLessThanOrEqual(300)
    }
    for (const a of placed) for (const b of placed) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r)
  })

  it('is the same every time, so the map never moves under a finger', () => {
    expect(layoutMap(map, { width: 320, height: 300 })).toEqual(layoutMap(map, { width: 320, height: 300 }))
  })

  it('gives a bigger dot to an area with more entries, and sizes only by count', () => {
    const placed = layoutMap(map, { width: 320, height: 300 })
    const r = (id: string) => placed.find((p) => p.id === id)!.r
    expect(r('money')).toBeGreaterThan(r('work'))
    expect(r('work')).toBeGreaterThanOrEqual(r('travel'))
  })

  it('has nothing to place for no dots', () => {
    expect(layoutMap({ dots: [], lines: [] }, { width: 320, height: 300 })).toEqual([])
  })
})
