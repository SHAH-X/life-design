import { graphlib, layout } from '@dagrejs/dagre'
import type { IdeaKind, MapIdea, MapLink } from './ideaMap'

// Where the map of your ideas is drawn: ideas joined by a link laid out top to bottom by dagre (an arrow points the
// way you wrote it, its words placed on it), ideas with no link in rows below. Worked out once from sorted input, so
// it's the same every time and nothing moves under a finger. Units are the SVG's: 320 wide fills a phone. Boxes wrap
// at 10 characters: at 14, a row of four ideas no link points to (common in reflective writing) was 377 wide.

export const MAP_WIDTH = 320
/** Characters on a box's line before its words wrap; a longer word keeps a line of its own, never cut. */
const LINE_CHARS = 10
/** About how wide a character of a box's words is (12 units of type, --fs-xs), with room to spare. */
const CHAR_W = 6.8
const LINE_H = 15
const COUNT_H = 13
const PAD_X = 7
const PAD_Y = 6
const MIN_BOX_W = 48
const WORDS_CHAR_W = 5.4
const WORDS_H = 14
const GAP = 8
const ROW_GAP = 16

export interface PlacedIdea {
  id: string
  label: string
  lines: string[]
  kind: IdeaKind
  count: number
  /** Centre. */
  x: number
  y: number
  w: number
  h: number
}

export interface PlacedLink {
  from: string
  to: string
  words: string
  points: { x: number; y: number }[]
  /** Where its words go: their centre and width. */
  labelX: number
  labelY: number
  labelW: number
}

export interface IdeaMapLayout {
  width: number
  height: number
  boxes: PlacedIdea[]
  arrows: PlacedLink[]
}

/** A label in at most two lines of about LINE_CHARS; a word longer than that gets a line of its own. */
export function wrapLabel(label: string, max = LINE_CHARS): string[] {
  const lines: string[] = []
  for (const word of label.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1)
    if (last !== undefined && last.length + 1 + word.length <= max) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines.length <= 2 ? lines : [lines[0]!, `${lines.slice(1).join(' ')}`]
}

const boxSize = (lines: readonly string[]) => ({
  w: Math.max(MIN_BOX_W, Math.max(...lines.map((l) => l.length)) * CHAR_W + 2 * PAD_X),
  h: lines.length * LINE_H + COUNT_H + 2 * PAD_Y,
})

export function layoutIdeaMap(ideas: readonly MapIdea[], links: readonly MapLink[]): IdeaMapLayout {
  const sortedIdeas = [...ideas].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  const sortedLinks = [...links].sort((a, b) => a.from.localeCompare(b.from, 'en', { numeric: true }) || a.to.localeCompare(b.to, 'en', { numeric: true }))
  const linked = new Set(sortedLinks.flatMap((l) => [l.from, l.to]))
  const sized = sortedIdeas.map((idea) => {
    const lines = wrapLabel(idea.label)
    return { idea, lines, ...boxSize(lines) }
  })

  const g = new graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: GAP, ranksep: 36, edgesep: 4, marginx: 4, marginy: 4 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const s of sized) if (linked.has(s.idea.id)) g.setNode(s.idea.id, { width: s.w, height: s.h })
  for (const l of sortedLinks) g.setEdge(l.from, l.to, { width: l.words.length * WORDS_CHAR_W + 6, height: WORDS_H, labelpos: 'c' })
  if (linked.size) layout(g)
  const graph = g.graph() as { width?: number; height?: number }
  const graphW = linked.size ? (graph.width ?? 0) : 0
  const graphH = linked.size ? (graph.height ?? 0) : 0
  const width = Math.max(MAP_WIDTH, graphW)
  const shift = (width - graphW) / 2

  const boxes: PlacedIdea[] = []
  for (const s of sized) {
    if (!linked.has(s.idea.id)) continue
    const node = g.node(s.idea.id) as { x: number; y: number }
    boxes.push({ id: s.idea.id, label: s.idea.label, lines: s.lines, kind: s.idea.kind, count: s.idea.entryIds.length, x: node.x + shift, y: node.y, w: s.w, h: s.h })
  }
  const arrows: PlacedLink[] = sortedLinks.map((l) => {
    const edge = g.edge(l.from, l.to) as { points: { x: number; y: number }[]; x: number; y: number; width: number }
    return { from: l.from, to: l.to, words: l.words, points: edge.points.map((p) => ({ x: p.x + shift, y: p.y })), labelX: edge.x + shift, labelY: edge.y, labelW: edge.width }
  })

  // Ideas with no link: in rows below, left to right.
  let x = 4
  let y = graphH + (linked.size ? ROW_GAP : 4)
  let rowH = 0
  for (const s of sized) {
    if (linked.has(s.idea.id)) continue
    if (x > 4 && x + s.w > width - 4) {
      x = 4
      y += rowH + GAP
      rowH = 0
    }
    boxes.push({ id: s.idea.id, label: s.idea.label, lines: s.lines, kind: s.idea.kind, count: s.idea.entryIds.length, x: x + s.w / 2, y: y + s.h / 2, w: s.w, h: s.h })
    x += s.w + GAP
    rowH = Math.max(rowH, s.h)
  }
  const height = Math.ceil(Math.max(graphH, rowH ? y + rowH + 4 : 0))
  return { width: Math.ceil(width), height, boxes, arrows }
}
