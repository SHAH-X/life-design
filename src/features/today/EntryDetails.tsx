import { useState } from 'react'
import type { Suggestions } from '../../db/repo'
import type { Duration } from '../../db/types'
import { DURATION_OPTIONS } from '../../domain/feelings'
import { DAY_PARTS, type DayPart } from '../../lib/dates'
import { ChipPicker } from '../../ui/ChipPicker'

interface Props {
  part: DayPart
  onPart: (part: DayPart) => void
  duration: Duration | null
  onDuration: (duration: Duration | null) => void
  where: string[]
  onWhere: (values: string[]) => void
  people: string[]
  onPeople: (values: string[]) => void
  objects: string[]
  onObjects: (values: string[]) => void
  suggestions: Suggestions
}

/** When it happened (preset from the clock), and optionally how long, where, with whom and using what (AEIOU). */
export function EntryDetails({ part, onPart, duration, onDuration, where, onWhere, people, onPeople, objects, onObjects, suggestions }: Props) {
  const [open, setOpen] = useState(duration !== null || where.length + people.length + objects.length > 0)

  return (
    <>
      <div className="chip-row when" role="group" aria-label="When">
        {DAY_PARTS.map((p) => (
          <button key={p.value} type="button" className="chip" aria-pressed={part === p.value} onClick={() => onPart(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {open ? (
        <>
          <div className="chip-row" role="group" aria-label="How long">
            {DURATION_OPTIONS.map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={duration === o.value} onClick={() => onDuration(duration === o.value ? null : o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          <ChipPicker legend="Where" values={where} suggestions={suggestions.where} onChange={onWhere} placeholder="e.g. Home, office" />
          <ChipPicker legend="With whom" values={people} suggestions={suggestions.people} onChange={onPeople} placeholder="e.g. Alex, team" />
          <ChipPicker legend="Using" values={objects} suggestions={suggestions.objects} onChange={onObjects} placeholder="e.g. Laptop, guitar" />
        </>
      ) : (
        <button type="button" className="link" onClick={() => setOpen(true)}>
          + How long, where, who
        </button>
      )}
    </>
  )
}
