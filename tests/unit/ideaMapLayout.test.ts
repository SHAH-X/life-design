import { describe, expect, it } from 'vitest'
import type { MapIdea, MapLink } from '../../src/domain/ideaMap'
import { layoutIdeaMap, MAP_WIDTH, wrapLabel } from '../../src/domain/ideaMapLayout'

// A map shaped like a reflective journal's: a few worries joined by the words written about them, a couple of things
// that help, and ideas with no link. Fictional.

const idea = (id: string, label: string, kind: MapIdea['kind'], count: number): MapIdea => ({ id, label, kind, entryIds: Array.from({ length: count }, (_, i) => `${id}-${i}`) })
const link = (from: string, to: string, words: string): MapLink => ({ from, to, words, entryId: 'e', quote: 'q' })

const IDEAS = [
  idea('i1', 'Rushing', 'weighs', 5),
  idea('i2', 'Tension', 'weighs', 4),
  idea('i3', 'Comparing myself', 'weighs', 3),
  idea('i4', 'Feeling behind', 'weighs', 3),
  idea('i5', 'A short walk', 'helps', 2),
  idea('i6', 'Writing it down', 'helps', 2),
  idea('i7', 'Saying no', 'helps', 1),
  idea('i8', 'Mornings', 'idea', 1),
]
const LINKS = [link('i1', 'i2', 'makes'), link('i3', 'i4', 'leaves me'), link('i5', 'i2', 'eases'), link('i6', 'i4', 'shrinks'), link('i4', 'i2', 'adds to'), link('i8', 'i1', 'start with')]

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2

describe('wrapLabel', () => {
  it('wraps a label into at most two lines, a long word on a line of its own, never cut', () => {
    expect(wrapLabel('Rushing')).toEqual(['Rushing'])
    expect(wrapLabel('Writing it down')).toEqual(['Writing it', 'down'])
    expect(wrapLabel('Overcommitting myself')).toEqual(['Overcommitting', 'myself'])
    expect(wrapLabel('Not enough time for the things')).toEqual(['Not enough', 'time for the things'])
  })
})

describe('layoutIdeaMap', () => {
  const map = layoutIdeaMap(IDEAS, LINKS)

  it('places every idea once, none on top of another, all inside the map', () => {
    expect(map.boxes.map((b) => b.id).sort()).toEqual(IDEAS.map((i) => i.id).sort())
    for (const a of map.boxes) {
      expect(a.x - a.w / 2).toBeGreaterThanOrEqual(0)
      expect(a.x + a.w / 2).toBeLessThanOrEqual(map.width)
      expect(a.y - a.h / 2).toBeGreaterThanOrEqual(0)
      expect(a.y + a.h / 2).toBeLessThanOrEqual(map.height)
      for (const b of map.boxes) if (a !== b) expect(overlap(a, b), `${a.label} and ${b.label}`).toBe(false)
    }
  })

  it('a journal-sized map fits a phone’s width', () => {
    expect(map.width).toBe(MAP_WIDTH)
  })

  it('draws each link as an arrow from where it starts to where it points, with its words on it', () => {
    expect(map.arrows).toHaveLength(LINKS.length)
    const makes = map.arrows.find((a) => a.words === 'makes')!
    const from = map.boxes.find((b) => b.id === 'i1')!
    const to = map.boxes.find((b) => b.id === 'i2')!
    expect(makes.points.length).toBeGreaterThanOrEqual(2)
    expect(makes.points[0]!.y).toBeLessThan(makes.points.at(-1)!.y)
    expect(from.y).toBeLessThan(to.y)
    expect(makes.labelW).toBeGreaterThan(0)
  })

  it('puts ideas with no link in rows below the linked ones', () => {
    const lone = map.boxes.find((b) => b.id === 'i7')!
    const lowestLinked = Math.max(...map.boxes.filter((b) => b.id !== 'i7').map((b) => b.y + b.h / 2))
    expect(lone.y - lone.h / 2).toBeGreaterThan(lowestLinked)
  })

  it('is the same every time, whatever order the ideas and links come in', () => {
    expect(layoutIdeaMap([...IDEAS].reverse(), [...LINKS].reverse())).toEqual(map)
  })

  it('draws ideas alone when there are no links, in rows', () => {
    const alone = layoutIdeaMap(IDEAS, [])
    expect(alone.arrows).toEqual([])
    expect(alone.width).toBe(MAP_WIDTH)
    for (const a of alone.boxes) for (const b of alone.boxes) if (a !== b) expect(overlap(a, b)).toBe(false)
  })

  it('has nothing to draw for no ideas', () => {
    expect(layoutIdeaMap([], [])).toEqual({ width: MAP_WIDTH, height: 0, boxes: [], arrows: [] })
  })
})
