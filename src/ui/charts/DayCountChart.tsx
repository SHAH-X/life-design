import { type ReactNode, useId } from 'react'

export interface DayColumn {
  key: string
  /** Short label under the day, e.g. "Mon". */
  axisLabel: string
  /** Full label for the readout, e.g. "Tuesday, October 20". */
  title: string
  /** The table's row label, short so its four columns fit a phone, e.g. "Tue 20". */
  rowLabel: string
  /** Activities that gave energy, used it up, or made little difference; a skipped answer counts in none. */
  gave: number
  used: number
  little: number
  /** Entries written that day, whatever their answers. */
  logged: number
}

const W = 320
const LEFT = 48
const RIGHT = 2
const TOP = 6
const PLOT_H = 96 // as the earlier chart: taller made saturated blocks (dataviz: thin marks, never large blocks)
const AXIS_H = 18
const H = TOP + PLOT_H + AXIS_H
const BASE = TOP + PLOT_H / 2
const HALF = PLOT_H / 2 - 1 // a 1px gap either side of the line, so what gave and what used up never touch
const GAP = 2 // the surface gap between counted segments
const MIN_SEGMENT = 6 // below this a day's count is one solid column, not segments

/** A column's far segment: a 4px rounded data end, square where it meets the one before. */
export function endPath(x: number, w: number, near: number, far: number): string {
  const h = Math.abs(far - near)
  const r = Math.min(4, w / 2, h)
  const s = far < near ? 1 : -1 // grows up (1) or down (-1)
  return `M${x},${near}V${far + s * r}Q${x},${far} ${x + r},${far}H${x + w - r}Q${x + w},${far} ${x + w},${far + s * r}V${near}Z`
}

/** In words: "2 gave you energy, 1 used it up". */
export function countWords({ gave, used, little }: { gave: number; used: number; little: number }): string {
  const parts = [gave ? `${gave} gave you energy` : '', used ? `${used} used it up` : '', little ? `${little} little difference` : ''].filter(Boolean)
  return parts.join(', ')
}

function describe(day: DayColumn): string {
  if (day.logged === 0) return `${day.title}: nothing logged`
  return `${day.title}: ${countWords(day) || 'energy not answered'}`
}

/**
 * Energy this week (v0.13): for each day, how many activities gave energy (blue, up) and how many used it up (red,
 * down), one segment each so they can be counted. Counted, never averaged: a day of two good and two draining things
 * shows both. Tap or focus a day for its words and, below, its entries (`detail`); "Show as table" for every value.
 */
export function DayCountChart(props: {
  title: string
  days: readonly DayColumn[]
  /** Shown in the readout until a day is tapped. */
  summary: string
  active: number | null
  onActive: (index: number) => void
  /** Under the chart: what the tapped day holds. */
  detail?: ReactNode
}) {
  const { title, days, summary, active, onActive, detail } = props
  const titleId = useId()
  const most = Math.max(3, ...days.flatMap((d) => [d.gave, d.used]))
  const unit = HALF / most
  const band = (W - LEFT - RIGHT) / Math.max(days.length, 1)
  const barW = Math.max(2, Math.min(24, band - GAP))
  const activeDay = active === null ? undefined : days[active]

  const column = (x: number, count: number, kind: 'pos' | 'neg', key: string) => {
    if (count === 0) return null
    const dir = kind === 'pos' ? -1 : 1
    const near = BASE + dir
    if (unit < MIN_SEGMENT) return <path key={key} d={endPath(x, barW, near, near + dir * count * unit)} className={`chart-col ${kind}`} aria-hidden="true" />
    return Array.from({ length: count }, (_, i) => {
      const from = near + dir * i * unit
      const to = from + dir * (unit - GAP)
      if (i < count - 1) {
        const y = Math.min(from, to)
        return <rect key={`${key}-${i}`} x={x} y={y} width={barW} height={unit - GAP} className={`chart-col ${kind}`} aria-hidden="true" />
      }
      return <path key={`${key}-${i}`} d={endPath(x, barW, from, to)} className={`chart-col ${kind}`} aria-hidden="true" />
    })
  }

  return (
    <figure className="chart">
      <figcaption id={titleId} className="chart-title">
        {title}
      </figcaption>
      <p className="chart-readout" aria-live="polite">
        {activeDay ? describe(activeDay) : summary}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="group" aria-labelledby={titleId}>
        <g aria-hidden="true">
          <text x={LEFT - 6} y={BASE - HALF / 2} dy="0.32em" textAnchor="end" className="chart-tick">
            gave
          </text>
          <text x={LEFT - 6} y={BASE + HALF / 2} dy="0.32em" textAnchor="end" className="chart-tick">
            used up
          </text>
        </g>
        {activeDay ? <rect x={LEFT + (active ?? 0) * band} y={TOP} width={band} height={PLOT_H} className="chart-hover" aria-hidden="true" /> : null}
        <line x1={LEFT} x2={W - RIGHT} y1={BASE} y2={BASE} className="chart-baseline" aria-hidden="true" />
        {days.map((d, i) => {
          const x = LEFT + i * band + (band - barW) / 2
          if (d.logged === 0) return <circle key={d.key} cx={x + barW / 2} cy={BASE} r={1.5} className="chart-empty" aria-hidden="true" />
          if (d.gave === 0 && d.used === 0) return <rect key={d.key} x={x} y={BASE - 1} width={barW} height={2} className="chart-col mid" aria-hidden="true" />
          return [column(x, d.gave, 'pos', `${d.key}-gave`), column(x, d.used, 'neg', `${d.key}-used`)]
        })}
        {days.map((d, i) => (
          <text key={d.key} x={LEFT + i * band + band / 2} y={TOP + PLOT_H + 13} textAnchor="middle" className="chart-tick" aria-hidden="true">
            {d.axisLabel}
          </text>
        ))}
        {/* Tap or focus targets: the whole day, bigger than its marks. */}
        {days.map((d, i) => (
          <rect
            key={d.key}
            x={LEFT + i * band}
            y={TOP}
            width={band}
            height={PLOT_H}
            className="chart-hit"
            role="button"
            tabIndex={0}
            aria-label={describe(d)}
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
              <th scope="col">When</th>
              <th scope="col">Gave energy</th>
              <th scope="col">Used it up</th>
              <th scope="col">Little difference</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.rowLabel}</th>
                <td>{d.gave}</td>
                <td>{d.used}</td>
                <td>{d.little}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
