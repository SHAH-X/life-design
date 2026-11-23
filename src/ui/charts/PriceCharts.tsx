import { useState } from 'react'

// Two small pictures of what you paid (step 3, 2026-11-23, drawn first as a mock the owner approved): a dot for each shop on one
// shared scale, and one shop's price over time. No colour carries meaning: the ink of the page, the chart hairlines, and a filled
// or hollow dot. Every dot says its value in words under the picture, and the sheet that holds them has a table.

export interface DotRow {
  key: string
  label: string
  /** What the last purchase cost, and the cheapest and dearest it has been. */
  value: number
  low: number
  high: number
  /** Said under the dot, "17 Oct". */
  when: string
  /** The price in words, "£0.73 a litre". */
  said: string
}

const W = 340

/** One row a shop on a shared scale: the last price as a dot, the range it has been as a line behind it. */
export function PriceDots({ rows, label }: { rows: readonly DotRow[]; label: string }) {
  const values = rows.flatMap((r) => [r.low, r.high, r.value])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo || hi * 0.2 || 1) * 0.35
  const [min, max] = [lo - pad, hi + pad]
  const left = 78
  const x = (v: number) => left + ((v - min) / (max - min)) * (W - left - 40)
  const height = 28 + rows.length * 50
  const ticks = [min + pad * 0.6, (min + max) / 2, max - pad * 0.6]
  return (
    <svg className="price-chart" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} width="100%">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={x(t)} x2={x(t)} y1={6} y2={height - 28} stroke="var(--viz-grid)" strokeWidth={1} />
          <text x={x(t)} y={height - 10} textAnchor="middle" fontSize={12} fill="var(--muted)">
            £{(t / 100).toFixed(2)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = 34 + i * 50
        return (
          <g key={r.key}>
            <text x={0} y={y + 4} fontSize={14} fill="currentColor">
              {r.label.length > 10 ? `${r.label.slice(0, 9)}…` : r.label}
            </text>
            <line x1={x(r.low)} x2={x(r.high)} y1={y} y2={y} stroke="var(--viz-axis)" strokeWidth={4} strokeLinecap="round" />
            <circle cx={x(r.value)} cy={y} r={7} fill="currentColor" stroke="currentColor" strokeWidth={2} />
            <text x={Math.min(x(r.value), W - 70)} y={y - 13} textAnchor="middle" fontSize={12} fill="currentColor">
              {r.said} · {r.when}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export interface StepPoint {
  /** YYYY-MM-DD. */
  date: string
  value: number
  /** In words: "17 Oct · £1.65 · £0.73 a litre". */
  said: string
  /** Bought on offer: its ring is dashed. */
  offer: boolean
}

const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000)

/** One shop's price over time, one dot for each purchase and a step where it changed; tap or focus a dot to read it. */
export function PriceSteps({ points, label, edge }: { points: readonly StepPoint[]; label: string; edge: { first: string; last: string; format: (pence: number) => string } }) {
  const [at, setAt] = useState(points.length - 1)
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = (hi - lo || hi * 0.2 || 1) * 0.4
  const [min, max] = [lo - pad, hi + pad]
  const [L, R, T, B] = [48, W - 12, 14, 118]
  const first = dayNumber(points[0]!.date)
  const span = dayNumber(points.at(-1)!.date) - first
  const x = (p: StepPoint) => (span === 0 ? (L + R) / 2 : L + ((dayNumber(p.date) - first) / span) * (R - L - 8))
  const y = (v: number) => B - ((v - min) / (max - min)) * (B - T)
  let path = `M${x(points[0]!)} ${y(points[0]!.value)}`
  for (let i = 1; i < points.length; i += 1) path += ` L${x(points[i]!)} ${y(points[i - 1]!.value)} L${x(points[i]!)} ${y(points[i]!.value)}`
  const grid = [lo, (lo + hi) / 2, hi]
  const chosen = points[at]!
  return (
    <>
      <svg className="price-chart" viewBox={`0 0 ${W} 150`} role="group" aria-label={label} width="100%">
        {grid.map((v, i) => (
          <g key={i}>
            <line x1={L} x2={R} y1={y(v)} y2={y(v)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
              {edge.format(v)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(p)} cy={y(p.value)} r={i === at ? 7 : 5} fill={i === at ? 'currentColor' : 'var(--surface)'} stroke="currentColor" strokeWidth={2} strokeDasharray={p.offer ? '3 2' : undefined} pointerEvents="none" />
            {/* A larger, invisible target: the dot alone is about 11px on the screen, under what a finger can hit (24px at least). */}
            <circle
              cx={x(p)}
              cy={y(p.value)}
              r={16}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={p.said}
              aria-pressed={i === at}
              style={{ cursor: 'pointer' }}
              onClick={() => setAt(i)}
              onFocus={() => setAt(i)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setAt(i)}
            />
          </g>
        ))}
        <text x={L} y={142} fontSize={12} fill="var(--muted)">
          {edge.first}
        </text>
        <text x={R} y={142} textAnchor="end" fontSize={12} fill="var(--muted)">
          {edge.last}
        </text>
      </svg>
      <p className="chart-readout" aria-live="polite">
        {chosen.said}
      </p>
    </>
  )
}
