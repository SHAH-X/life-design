import type { Entry } from '../../db/types'
import { energyLevel, engagementLevel } from '../../domain/scales'
import { DAY_PARTS } from '../../lib/dates'
import { EnergySymbol, EngagementDots } from '../../ui/Signs'

/** One activity: energy as ▲/▼ in blue or red, how into it as five dots, ✦ when time flew. VoiceOver hears words. */
export function EntryRow({ entry, onOpen }: { entry: Entry; onOpen: () => void }) {
  const part = DAY_PARTS.find((p) => p.value === entry.part)?.label ?? ''
  const details = [part, ...entry.where, ...entry.people.map((p) => `with ${p}`), ...entry.objects].join(' · ')
  const spoken = [energyLevel(entry.energy).phrase, engagementLevel(entry.engagement).phrase, entry.flow ? 'time flew' : '']
    .filter(Boolean)
    .join(', ')

  return (
    <button type="button" className="entry-row" onClick={onOpen}>
      <span className="entry-text">
        <span className="entry-activity">{entry.activity}</span>
        {entry.note ? <span className="entry-note">{entry.note}</span> : null}
        <span className="entry-meta">{details}</span>
      </span>
      <span className="entry-signs" aria-hidden="true">
        {entry.flow ? <span className="sign-flow">✦</span> : null}
        <EngagementDots value={entry.engagement} />
        <EnergySymbol value={entry.energy} />
      </span>
      <span className="visually-hidden">, {spoken}</span>
    </button>
  )
}
