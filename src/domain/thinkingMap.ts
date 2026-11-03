import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { MIN_COUNT } from '../analysis/stats'
import { type AreaId, areaLines } from './areas'

// The map of your thinking (v0.22, owner: "visualise what and how I think and how they connect"). Dots are life areas
// (the ones with 3+ entries), sized by how many entries. Two dots are joined when you wrote about both on the same
// days, which the phone counts exactly. Joining entries by how close their meaning is was tried and dropped
// (2026-11-03, real model, fictional journal): entries written as one thread across two areas were no closer than
// unrelated ones (median 0.21; unrelated pairs reached 0.32 at the 99th percentile and 0.52 at most), so no cut-off
// told a real link from noise. Nothing here is a score: a count of entries, a count of days.

/** An area's dot: the entries in it (an entry in two areas is in both). */
export interface MapDot {
  id: AreaId
  name: string
  entryIds: string[]
}

/** Two areas written about on the same days: the days, and the entries of those days in either area. */
export interface MapLine {
  a: AreaId
  b: AreaId
  days: string[]
  entryIds: string[]
}

export interface ThinkingMap {
  dots: MapDot[]
  lines: MapLine[]
}

/** How much more often than chance two areas must be written about on the same day. Busy areas meet every day by chance. */
const LIFT = 1.5

/**
 * The map for some finished entries and the areas the phone put them in. Dots: areas with MIN_COUNT or more entries,
 * most first (as Life areas lists them). A line joins two dots written about on MIN_COUNT or more of the same days,
 * and on at least LIFT times the days chance would give (each area's days times the other's, over the days that have
 * any area written about). Said as counts, never causes.
 */
export function thinkingMap(entries: readonly { id: string; date: string }[], byEntry: ReadonlyMap<string, readonly AreaId[]>): ThinkingMap {
  const { ranked } = areaLines(
    entries.map((e) => e.id),
    byEntry,
  )
  const dateOf = new Map(entries.map((e) => [e.id, e.date]))
  // Oldest first, so the map is the same whatever order the entries came in.
  const oldestFirst = (a: string, b: string) => (dateOf.get(a) ?? '').localeCompare(dateOf.get(b) ?? '') || a.localeCompare(b)
  const dots: MapDot[] = ranked.map((line) => ({ id: line.id, name: line.name, entryIds: [...line.entryIds].sort(oldestFirst) }))
  const shown = new Set(dots.map((d) => d.id))

  /** For each day, the entries in each shown area. */
  const byDay = new Map<string, Map<AreaId, string[]>>()
  for (const dot of dots)
    for (const id of dot.entryIds) {
      const date = dateOf.get(id)
      if (date === undefined) continue
      const areas = byDay.get(date) ?? new Map<AreaId, string[]>()
      areas.set(dot.id, [...(areas.get(dot.id) ?? []), id])
      byDay.set(date, areas)
    }
  const days = [...byDay.keys()].sort()
  const daysOf = (id: AreaId) => days.filter((d) => byDay.get(d)!.has(id))

  const lines: MapLine[] = []
  for (let i = 0; i < dots.length; i++)
    for (let j = i + 1; j < dots.length; j++) {
      const a = dots[i]!.id
      const b = dots[j]!.id
      if (!shown.has(a) || !shown.has(b)) continue
      const together = days.filter((d) => byDay.get(d)!.has(a) && byDay.get(d)!.has(b))
      const chance = (daysOf(a).length * daysOf(b).length) / days.length
      if (together.length < MIN_COUNT || together.length < LIFT * chance) continue
      const entryIds = together.flatMap((d) => [...byDay.get(d)!.get(a)!, ...byDay.get(d)!.get(b)!])
      lines.push({ a, b, days: together, entryIds: [...new Set(entryIds)].sort(oldestFirst) })
    }
  return { dots, lines }
}

/** A dot placed: its centre and radius in the map's own units. The radius is by entry count alone. */
export interface PlacedDot {
  id: AreaId
  name: string
  count: number
  x: number
  y: number
  r: number
}

/** Radius from the count: big enough to tap on a phone, never so big one area hides the rest. */
const radius = (count: number) => Math.min(30, Math.max(14, 8 + 4 * Math.sqrt(count)))
/** Room under a dot for its name. */
const LABEL_H = 14
/** About how wide a letter of a name is, and the most of that a label may claim in the layout. */
const LETTER = 5

type Node = SimulationNodeDatum & { id: AreaId; r: number; half: number }

/**
 * Where each dot goes in a box, worked out once and the same every time (d3-force's own random numbers are fixed, and
 * it is run to rest here, never animated), so the map never moves under a finger. Areas joined by a line sit nearer;
 * each dot keeps clear of the others, and its name sits under it inside the box.
 */
export function layoutMap(map: ThinkingMap, box: { width: number; height: number }): PlacedDot[] {
  if (!map.dots.length) return []
  const nodes: Node[] = map.dots.map((d) => ({ id: d.id, r: radius(d.entryIds.length), half: (d.name.length * LETTER) / 2 }))
  const links: SimulationLinkDatum<Node>[] = map.lines.map((l) => ({ source: l.a, target: l.b }))
  const clampX = (n: Node) => Math.min(box.width - Math.max(n.r, n.half), Math.max(Math.max(n.r, n.half), n.x ?? 0))
  const clampY = (n: Node) => Math.min(box.height - n.r - LABEL_H, Math.max(n.r, n.y ?? 0))

  const simulation = forceSimulation(nodes)
    .stop()
    .force('link', forceLink<Node, SimulationLinkDatum<Node>>(links).id((n) => n.id).distance(70).strength(0.4))
    .force('charge', forceManyBody().strength(-90))
    .force('x', forceX<Node>(box.width / 2).strength(0.08))
    .force('y', forceY<Node>(box.height / 2).strength(0.08))
    .force('collide', forceCollide<Node>((n) => Math.max(n.r + 4, n.half * 0.8)).iterations(3))
  for (let i = 0; i < 300; i++) {
    simulation.tick()
    for (const n of nodes) {
      n.x = clampX(n)
      n.y = clampY(n)
    }
  }
  return nodes.map((n, i) => ({ id: n.id, name: map.dots[i]!.name, count: map.dots[i]!.entryIds.length, x: n.x ?? 0, y: n.y ?? 0, r: n.r }))
}
