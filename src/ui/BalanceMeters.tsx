import { type Balance, BALANCE_AREAS } from '../db/types'
import { BALANCE_INFO } from '../reviews/prompts'

/** Read-only Health/Work/Play/Love levels from the latest review, with the one before for comparison. */
export function BalanceMeters({ latest, previous }: { latest: Balance; previous: Balance | null }) {
  return (
    <ul className="meters">
      {BALANCE_AREAS.map((area) => {
        const value = latest[area]
        const before = previous?.[area] ?? null
        return (
          <li key={area} className="meter-row">
            <span className="meter-label">{BALANCE_INFO[area].label}</span>
            <span className="meter-track" aria-hidden="true">
              {value !== null ? <span className="meter-fill" style={{ width: `${value * 10}%` }} /> : null}
            </span>
            <span className="meter-value">
              {value === null ? '–' : `${value}/10`}
              {before !== null && value !== null ? <span className="muted"> (was {before})</span> : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
