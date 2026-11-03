import { useId } from 'react'
import type { IdeaKind } from '../../domain/ideaMap'
import { type IdeaMapLayout, MAP_WIDTH } from '../../domain/ideaMapLayout'

export type MapChoice = { kind: 'idea'; id: string } | { kind: 'link'; from: string; to: string } | null

export const KIND_WORDS: Record<IdeaKind, string> = { weighs: 'weighs on you', helps: 'helps you', idea: 'other idea' }

/** A box's corners say its kind, never its colour alone: square for what weighs on you, round for what helps. */
const corner = (kind: IdeaKind, h: number) => (kind === 'weighs' ? 2 : kind === 'helps' ? h / 2 : 8)

/** The smallest tap target, in the map's units (about a pixel each on a phone). */
const HIT = 24

/**
 * The map of your ideas (v0.23): each idea a box with its name and how many entries it comes up in, each link you
 * wrote an arrow with your joining words on it. Boxes and arrows' words are the targets: tap or focus one to choose
 * it. Everything stays neutral and in ink; only what's chosen, and the arrows into and out of it, take the accent. A
 * map wider than a phone scrolls sideways in its own box.
 */
export function IdeaMapChart(props: { layout: IdeaMapLayout; chosen: MapChoice; onChoose: (choice: MapChoice) => void; label: string }) {
  const { layout, chosen, onChoose, label } = props
  const marker = `idea-map-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const name = new Map(layout.boxes.map((b) => [b.id, b.label]))
  const lit = (from: string, to: string) =>
    chosen?.kind === 'idea' ? chosen.id === from || chosen.id === to : chosen?.kind === 'link' && chosen.from === from && chosen.to === to
  const wide = layout.width > MAP_WIDTH

  const svg = (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="chart-svg idea-map"
      style={wide ? { width: layout.width } : undefined}
      role="group"
      aria-label={label}
    >
      <defs>
        {['', '-lit'].map((end) => (
          <marker key={end} id={`${marker}${end}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" className={end ? 'idea-arrow-head lit' : 'idea-arrow-head'} />
          </marker>
        ))}
      </defs>
      {layout.arrows.map((a) => {
        const on = lit(a.from, a.to)
        const d = `M${a.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')}`
        return <path key={`${a.from}-${a.to}`} d={d} className={on ? 'idea-arrow lit' : 'idea-arrow'} markerEnd={`url(#${marker}${on ? '-lit' : ''})`} aria-hidden="true" />
      })}
      {layout.arrows.map((a) => (
        <g key={`${a.from}-${a.to}-words`}>
          <rect x={a.labelX - a.labelW / 2} y={a.labelY - 7} width={a.labelW} height={14} rx={3} className="idea-words-back" aria-hidden="true" />
          <text x={a.labelX} y={a.labelY + 3.4} textAnchor="middle" className={lit(a.from, a.to) ? 'idea-words lit' : 'idea-words'} aria-hidden="true">
            {a.words}
          </text>
          <rect
            x={a.labelX - Math.max(a.labelW, HIT) / 2}
            y={a.labelY - HIT / 2}
            width={Math.max(a.labelW, HIT)}
            height={HIT}
            className="chart-hit"
            role="button"
            tabIndex={0}
            aria-label={`${name.get(a.from)} ${a.words} ${name.get(a.to)}`}
            aria-pressed={chosen?.kind === 'link' && chosen.from === a.from && chosen.to === a.to}
            onFocus={() => onChoose({ kind: 'link', from: a.from, to: a.to })}
            onClick={() => onChoose({ kind: 'link', from: a.from, to: a.to })}
          />
        </g>
      ))}
      {layout.boxes.map((b) => {
        const on = chosen?.kind === 'idea' && chosen.id === b.id
        const top = b.y - b.h / 2
        return (
          <g key={b.id}>
            <rect x={b.x - b.w / 2} y={top} width={b.w} height={b.h} rx={corner(b.kind, b.h)} className={on ? 'idea-box lit' : 'idea-box'} aria-hidden="true" />
            {b.lines.map((line, i) => (
              <text key={i} x={b.x} y={top + 18 + i * 15} textAnchor="middle" className="idea-label" aria-hidden="true">
                {line}
              </text>
            ))}
            <text x={b.x} y={top + b.h - 8} textAnchor="middle" className="idea-count" aria-hidden="true">
              {b.count} {b.count === 1 ? 'entry' : 'entries'}
            </text>
            <rect
              x={b.x - b.w / 2}
              y={top}
              width={b.w}
              height={b.h}
              rx={corner(b.kind, b.h)}
              className="chart-hit"
              role="button"
              tabIndex={0}
              aria-label={`${b.label}, ${KIND_WORDS[b.kind]}: ${b.count} ${b.count === 1 ? 'entry' : 'entries'}`}
              aria-pressed={on}
              onFocus={() => onChoose({ kind: 'idea', id: b.id })}
              onClick={() => onChoose({ kind: 'idea', id: b.id })}
            />
          </g>
        )
      })}
    </svg>
  )
  return wide ? <div className="idea-map-scroll">{svg}</div> : svg
}
