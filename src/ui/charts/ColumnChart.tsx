import { useId, useState } from 'react'

export interface Column {
  key: string
  /** Short label under the column, e.g. "Tue 20". */
  axisLabel: string
  /** Full label for the readout and table, e.g. "Tuesday 20 October". */
  title: string
  /** Null when nothing was logged. */
  value: number | null
  count: number
}

interface Props {
  title: string
  columns: readonly Column[]
  domain: readonly [number, number]
  /** Gridline values, each labelled on the left. */
  ticks: readonly number[]
  /** Diverging: grows up or down from zero (blue above, red below). Sequential: grows up from the bottom in one hue. */
  mode: 'diverging' | 'sequential'
  formatValue: (value: number) => string
  formatTick?: (value: number) => string
  valueName: string
  countName?: string
  /** Shown in the readout until a column is tapped. */
  summary: string
  /** Room on the left for the axis labels (wider for words than for numbers). */
  axisWidth?: number
}

const W = 320
const TOP = 6
const PLOT_H = 96
const AXIS_H = 18
const RIGHT = 2
const H = TOP + PLOT_H + AXIS_H

/** A column with a 4px rounded data end and a square end on the baseline. */
function columnPath(x: number, w: number, base: number, end: number): string {
  const h = Math.abs(base - end)
  if (h < 0.5) return ''
  const r = Math.min(4, w / 2, h)
  const s = end < base ? 1 : -1 // grows up (1) or down (-1)
  return `M${x},${base}V${end + s * r}Q${x},${end} ${x + r},${end}H${x + w - r}Q${x + w},${end} ${x + w},${end + s * r}V${base}Z`
}

export function ColumnChart({
  title,
  columns,
  domain,
  ticks,
  mode,
  formatValue,
  formatTick = String,
  valueName,
  countName = 'activities',
  summary,
  axisWidth = 26,
}: Props) {
  const LEFT = axisWidth
  const [active, setActive] = useState<number | null>(null)
  const titleId = useId()
  const [min, max] = domain
  const y = (v: number) => TOP + ((max - v) / (max - min)) * PLOT_H
  const base = mode === 'diverging' ? y(0) : y(min)
  const band = (W - LEFT - RIGHT) / Math.max(columns.length, 1)
  const barW = Math.max(2, Math.min(24, band - 2)) // ≤24px, with a 2px gap between neighbours
  const labelEvery = columns.length <= 8 ? 1 : Math.ceil(columns.length / 6)

  const describe = (c: Column) =>
    c.value === null ? `${c.title}: nothing logged` : `${c.title}: ${formatValue(c.value)} · ${c.count} ${countName}`
  const activeColumn = active === null ? undefined : columns[active]

  return (
    <figure className="chart">
      <figcaption id={titleId} className="chart-title">
        {title}
      </figcaption>
      <p className="chart-readout" aria-live="polite">
        {activeColumn ? describe(activeColumn) : summary}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="group" aria-labelledby={titleId}>
        {ticks.map((t) => (
          <g key={t} aria-hidden="true">
            <line x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={LEFT - 5} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {activeColumn ? (
          <rect x={LEFT + (active ?? 0) * band} y={TOP} width={band} height={PLOT_H} className="chart-hover" aria-hidden="true" />
        ) : null}
        <line x1={LEFT} x2={W - RIGHT} y1={base} y2={base} className="chart-baseline" aria-hidden="true" />
        {columns.map((c, i) => {
          const x = LEFT + i * band + (band - barW) / 2
          if (c.value === null) return <circle key={c.key} cx={x + barW / 2} cy={base} r={1.5} className="chart-empty" aria-hidden="true" />
          const kind = mode === 'sequential' ? 'seq' : c.value > 0 ? 'pos' : c.value < 0 ? 'neg' : 'mid'
          if (kind === 'mid') return <rect key={c.key} x={x} y={base - 1} width={barW} height={2} className="chart-col mid" aria-hidden="true" />
          return <path key={c.key} d={columnPath(x, barW, base, y(c.value))} className={`chart-col ${kind}`} aria-hidden="true" />
        })}
        {columns.map((c, i) =>
          i % labelEvery === 0 || i === columns.length - 1 ? (
            <text key={c.key} x={LEFT + i * band + band / 2} y={TOP + PLOT_H + 13} textAnchor="middle" className="chart-tick" aria-hidden="true">
              {c.axisLabel}
            </text>
          ) : null,
        )}
        {/* Tap or focus targets: the whole column band, bigger than the mark. */}
        {columns.map((c, i) => (
          <rect
            key={c.key}
            x={LEFT + i * band}
            y={TOP}
            width={band}
            height={PLOT_H}
            className="chart-hit"
            role="button"
            tabIndex={0}
            aria-label={describe(c)}
            onPointerEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
          />
        ))}
      </svg>
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">{valueName[0]?.toUpperCase() + valueName.slice(1)}</th>
              <th scope="col">{countName[0]?.toUpperCase() + countName.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key}>
                <th scope="row">{c.title}</th>
                <td>{c.value === null ? '—' : formatValue(c.value)}</td>
                <td>{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
