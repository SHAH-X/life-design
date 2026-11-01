import { useId } from 'react'
import { endPath } from './DayCountChart'
import { scaleTop } from './MonthChart'

/** One month's end: the column is what you hold; everything else is said in words, never by colour or height alone. */
export interface BalanceColumn {
  key: string
  /** Under the column, "Oct". */
  axisLabel: string
  /** For the readout and table, "October 2026" or "October so far". */
  title: string
  /** Pence held: the column's height. Zero when nothing is held, it's overdrawn or it isn't known (the words say which). */
  value: number
  /** What is held, in words: "£1240.50 held", "£120.00 overdrawn", "not known: no statement for Lloyds". */
  held: string
  /** What is owed, in words, or '' when there is nothing to say. Kept apart from what is held, never netted. */
  owed: string
}

// The same geometry as MonthChart, so the two read as one family.
const W = 320
const LEFT = 44
const RIGHT = 2
const TOP = 16
const PLOT_H = 96
const AXIS_H = 18
const H = TOP + PLOT_H + AXIS_H
const BASE = TOP + PLOT_H
const GAP = 2

const describe = (m: BalanceColumn) => `${m.title}: ${m.held}${m.owed ? ` · ${m.owed}` : ''}`

/**
 * Your balances at each month's end (v0.20.28): one column a month on one scale, in one colour. Tap or focus a month for
 * its words; the labelled month's amount is written on its cap; "Show as table" gives every month in full. Money held
 * and money owed are separate columns of the table: an owed card is never taken off what you hold.
 */
export function BalanceChart(props: {
  title: string
  months: readonly BalanceColumn[]
  /** Shown in the readout until a month is tapped. */
  summary: string
  active: number | null
  onActive: (index: number) => void
  /** The month whose amount is written on its cap until another is tapped. */
  labelled: number
  /** Whether any account owes, so the table has a column for it. */
  showOwed: boolean
}) {
  const { title, months, summary, active, onActive, labelled, showOwed } = props
  const titleId = useId()
  const top = scaleTop(Math.max(0, ...months.map((m) => m.value)))
  const height = (value: number) => (value / top) * PLOT_H
  const band = (W - LEFT - RIGHT) / Math.max(months.length, 1)
  const barW = Math.max(2, Math.min(24, band - GAP))
  const shown = active ?? labelled
  const activeMonth = active === null ? undefined : months[active]
  const tick = (pence: number) => `£${(pence / 100).toLocaleString()}`
  const cap = (pence: number) => `£${(pence / 100).toFixed(2)}`

  return (
    <figure className="chart">
      <figcaption id={titleId} className="chart-title">
        {title}
      </figcaption>
      <p className="chart-readout" aria-live="polite">
        {activeMonth ? describe(activeMonth) : summary}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="group" aria-labelledby={titleId}>
        <g aria-hidden="true">
          {[top / 2, top].map((v) => (
            <g key={v}>
              <line x1={LEFT} x2={W - RIGHT} y1={BASE - height(v)} y2={BASE - height(v)} className="chart-grid" />
              <text x={LEFT - 6} y={BASE - height(v)} dy="0.32em" textAnchor="end" className="chart-tick">
                {tick(v)}
              </text>
            </g>
          ))}
        </g>
        {activeMonth ? <rect x={LEFT + (active ?? 0) * band} y={TOP} width={band} height={PLOT_H} className="chart-hover" aria-hidden="true" /> : null}
        <line x1={LEFT} x2={W - RIGHT} y1={BASE} y2={BASE} className="chart-baseline" aria-hidden="true" />
        {months.map((m, i) => {
          const x = LEFT + i * band + (band - barW) / 2
          if (m.value <= 0) return <circle key={m.key} cx={x + barW / 2} cy={BASE} r={1.5} className="chart-empty" aria-hidden="true" />
          return <path key={m.key} d={endPath(x, barW, BASE, BASE - Math.max(height(m.value), 1))} className="chart-col seq" aria-hidden="true" />
        })}
        {months[shown] && months[shown]!.value > 0 ? (
          <text x={LEFT + shown * band + band / 2} y={BASE - height(months[shown]!.value) - 4} textAnchor="middle" className="chart-tick" aria-hidden="true">
            {cap(months[shown]!.value)}
          </text>
        ) : null}
        {months.map((m, i) => (
          <text key={m.key} x={LEFT + i * band + band / 2} y={BASE + 13} textAnchor="middle" className="chart-tick" aria-hidden="true">
            {m.axisLabel}
          </text>
        ))}
        {/* Tap or focus targets: the whole month, bigger than its column. */}
        {months.map((m, i) => (
          <rect
            key={m.key}
            x={LEFT + i * band}
            y={TOP}
            width={band}
            height={PLOT_H}
            className="chart-hit"
            role="button"
            tabIndex={0}
            aria-label={describe(m)}
            aria-pressed={active === i}
            onPointerEnter={() => onActive(i)}
            onFocus={() => onActive(i)}
            onClick={() => onActive(i)}
          />
        ))}
      </svg>
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Held</th>
              {showOwed ? <th scope="col">Owed</th> : null}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.title}</th>
                <td>{m.held}</td>
                {showOwed ? <td>{m.owed || '–'}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
