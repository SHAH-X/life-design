import type { GroupStat } from '../../analysis/stats'
import { howOften, times } from '../../domain/feelings'

/** What a row says, in words: how often it went that way, and how many times it was logged. */
function describe(row: GroupStat, direction: 'gives' | 'takes' | 'context'): string {
  const gave = row.gave / row.count
  const took = row.took / row.count
  if (direction === 'gives') return `${howOften(gave)} · ${times(row.count)}`
  if (direction === 'takes') return `${howOften(took)} · ${times(row.count)}`
  if (gave >= 0.4 && row.gave >= row.took) return `${howOften(gave)} gives energy · ${times(row.count)}`
  if (took >= 0.4) return `${howOften(took)} takes energy · ${times(row.count)}`
  return `mixed · ${times(row.count)}`
}

/**
 * One row per activity, place or person, in words ("usually · 5 times"). The bar either side of the middle
 * (blue = gives energy, red = takes it) is only a visual aid: the words carry the meaning, never a score.
 */
export function EnergyRows({ rows, direction }: { rows: readonly GroupStat[]; direction: 'gives' | 'takes' | 'context' }) {
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
            <span className="bar-value">{describe(row, direction)}</span>
          </li>
        )
      })}
    </ul>
  )
}
