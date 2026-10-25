import { type ReactNode, useId } from 'react'
import { endPath } from './DayCountChart'

export interface MonthColumn {
  key: string
  /** Under the column, "Oct". */
  axisLabel: string
  /** For the readout and table, "October 2026" or "October so far". */
  title: string
  /** Pence in the chart's one currency: the column's height. */
  value: number
  /** Every amount in words, "£70.48 and €7.30", for the readout and table. */
  amount: string
  receipts: number
}

const W = 320
const LEFT = 44
const RIGHT = 2
const TOP = 16 // room for the value written on a column's cap
const PLOT_H = 96
const AXIS_H = 18
const H = TOP + PLOT_H + AXIS_H
const BASE = TOP + PLOT_H
const GAP = 2

/** The scale's top, in pence: a round amount at or above the most spent (at least £10), halved without pence. */
export function scaleTop(most: number): number {
  const pounds = Math.max(most / 100, 10)
  const magnitude = 10 ** Math.floor(Math.log10(pounds))
  const step = [1, 2, 4, 5, 10].find((m) => m * magnitude >= pounds) ?? 10
  return step * magnitude * 100
}

const receiptsWord = (n: number) => `${n} receipt${n === 1 ? '' : 's'}`

function describe(month: MonthColumn): string {
  return month.receipts ? `${month.title}: ${month.amount} · ${receiptsWord(month.receipts)}` : `${month.title}: no receipts`
}

/**
 * Spending each month (Shopping, v0.19): one column a month in one colour on one scale, the currency most receipts are
 * in. Tap or focus a month for its amounts (every currency) and, below, a way to open it (`detail`); the highlighted
 * month's amount is written on its cap; "Show as table" gives every value.
 */
export function MonthChart(props: {
  title: string
  months: readonly MonthColumn[]
  currency: string
  /** Shown in the readout until a month is tapped. */
  summary: string
  active: number | null
  onActive: (index: number) => void
  /** The month whose amount is written on its cap until another is tapped: the page's own. */
  labelled: number
  detail?: ReactNode
}) {
  const { title, months, currency, summary, active, onActive, labelled, detail } = props
  const titleId = useId()
  const top = scaleTop(Math.max(0, ...months.map((m) => m.value)))
  const height = (value: number) => (value / top) * PLOT_H
  const band = (W - LEFT - RIGHT) / Math.max(months.length, 1)
  const barW = Math.max(2, Math.min(24, band - GAP))
  const shown = active ?? labelled
  const activeMonth = active === null ? undefined : months[active]
  // Gridlines are whole pounds (scaleTop); a column's cap says its pounds and pence.
  const tick = (pence: number) => `${currency}${(pence / 100).toLocaleString()}`
  const cap = (pence: number) => `${currency}${(pence / 100).toFixed(2)}`

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
      {detail}
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Spent</th>
              <th scope="col">Receipts</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.title}</th>
                <td>{m.receipts ? m.amount : '–'}</td>
                <td>{m.receipts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
