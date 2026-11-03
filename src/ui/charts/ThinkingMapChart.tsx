import type { AreaId } from '../../domain/areas'
import type { PlacedDot } from '../../domain/thinkingMap'

export const MAP_W = 320
export const MAP_H = 260

export interface MapJoin {
  a: AreaId
  b: AreaId
  days: number
}

/**
 * The map of your thinking (v0.22): a dot for each life area, sized by how many entries it has, and a line between two
 * written about on the same days, thicker for more days. The dots are the targets (the lines only draw what the list
 * under it says in words); tap or focus one for what it holds. Dots stay neutral grey and only the chosen one takes the
 * accent, as colour means nothing here beyond that. The layout is worked out once, so nothing moves.
 */
export function ThinkingMapChart(props: {
  dots: readonly PlacedDot[]
  joins: readonly MapJoin[]
  active: AreaId | null
  onActive: (id: AreaId) => void
  label: string
}) {
  const { dots, joins, active, onActive, label } = props
  const at = new Map(dots.map((d) => [d.id, d]))
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="chart-svg thinking-map" role="group" aria-label={label}>
      {joins.map((j) => {
        const a = at.get(j.a)
        const b = at.get(j.b)
        if (!a || !b) return null
        return (
          <line
            key={`${j.a}-${j.b}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={active === j.a || active === j.b ? 'map-line chosen' : 'map-line'}
            strokeWidth={Math.min(1 + j.days * 0.5, 5)}
            aria-hidden="true"
          />
        )
      })}
      {dots.map((d) => (
        <g key={d.id}>
          <circle cx={d.x} cy={d.y} r={d.r} className={active === d.id ? 'map-dot chosen' : 'map-dot'} aria-hidden="true" />
          <text x={d.x} y={d.y + d.r + 12} textAnchor="middle" className="map-label" aria-hidden="true">
            {d.name}
          </text>
          <circle
            cx={d.x}
            cy={d.y}
            r={d.r + 6}
            className="chart-hit"
            role="button"
            tabIndex={0}
            aria-label={`${d.name}: ${d.count} ${d.count === 1 ? 'entry' : 'entries'}`}
            aria-pressed={active === d.id}
            onFocus={() => onActive(d.id)}
            onClick={() => onActive(d.id)}
          />
        </g>
      ))}
    </svg>
  )
}
