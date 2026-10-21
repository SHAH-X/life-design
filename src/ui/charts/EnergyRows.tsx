import { formatSigned, type GroupStat } from '../../analysis/stats'

/**
 * One row per activity, place or person: its average energy as a bar either side of zero
 * (blue = gives energy, red = drains), with the number and how many times it was logged.
 * The text carries every value, so the bar is a visual aid, never the only way to read it.
 */
export function EnergyRows({ rows }: { rows: readonly GroupStat[] }) {
  return (
    <ul className="bar-rows">
      {rows.map((row) => {
        const width = `${Math.min(100, (Math.abs(row.avgEnergy) / 2) * 100)}%`
        return (
          <li key={row.label} className="bar-row">
            <span className="bar-label">{row.label}</span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-half neg">{row.avgEnergy < 0 ? <span className="bar-fill" style={{ width }} /> : null}</span>
              <span className="bar-half pos">{row.avgEnergy > 0 ? <span className="bar-fill" style={{ width }} /> : null}</span>
            </span>
            <span className="bar-value">
              {formatSigned(row.avgEnergy)}
              <span className="muted"> · {row.count}×</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
