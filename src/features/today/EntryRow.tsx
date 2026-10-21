import type { Entry } from '../../db/types'
import { energyLabel, energyShort, engagementLabel } from '../../domain/scales'
import { DAY_PARTS } from '../../lib/dates'

export function EntryRow({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const part = DAY_PARTS.find((p) => p.value === entry.part)?.label ?? ''
  const details = [part, ...entry.where, ...entry.people.map((p) => `with ${p}`), ...entry.objects].join(' · ')

  return (
    <button type="button" className="entry-row" onClick={onOpen}>
      <span className="entry-text">
        <span className="entry-activity">{entry.activity}</span>
        <span className="entry-meta">{details}</span>
      </span>
      <span className="entry-badges">
        {entry.flow ? <span className="badge flow">Flow</span> : null}
        <span className="badge">
          <span aria-hidden="true">{entry.engagement}/5</span>
          <span className="visually-hidden">
            , engagement {entry.engagement} of 5, {engagementLabel(entry.engagement)}
          </span>
        </span>
        <span className={`badge energy e${entry.energy}`}>
          <span aria-hidden="true">{energyShort(entry.energy)}</span>
          <span className="visually-hidden">, energy {energyLabel(entry.energy)}</span>
        </span>
      </span>
    </button>
  )
}
