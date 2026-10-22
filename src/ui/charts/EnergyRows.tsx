import type { GroupStat } from '../../analysis/stats'
import { energyWords } from '../../analysis/words'

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
            <span className="bar-value">{energyWords(row, direction)}</span>
          </li>
        )
      })}
    </ul>
  )
}
