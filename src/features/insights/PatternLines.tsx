import type { GroupStat } from '../../analysis/stats'
import type { Entry } from '../../db/types'
import { howOften, times } from '../../domain/feelings'
import { Evidence } from './Evidence'

type Direction = 'gives' | 'takes' | 'context'

/** What a line says, in words: how often it went that way, and how many times it was logged. */
function describe(row: GroupStat, direction: Direction): string {
  const gave = row.gave / row.count
  const took = row.took / row.count
  if (direction === 'gives') return `${howOften(gave)} · ${times(row.count)}`
  if (direction === 'takes') return `${howOften(took)} · ${times(row.count)}`
  if (gave >= 0.4 && row.gave >= row.took) return `${howOften(gave)} gives energy · ${times(row.count)}`
  if (took >= 0.4) return `${howOften(took)} takes energy · ${times(row.count)}`
  return `mixed · ${times(row.count)}`
}

/**
 * One line per activity, place or person, in words ("usually · 5 times"), with the thin edge every activity row has
 * (blue gave energy, red took it). It opens to the entries behind it, and each of those opens the entry (v0.13; the
 * bars either side of zero are gone: they drew an average, and the words already say it).
 */
export function PatternLines(props: {
  rows: readonly GroupStat[]
  direction: Direction
  entries: ReadonlyMap<string, Entry>
  onOpen: (entry: Entry) => void
}) {
  const { rows, direction, entries, onOpen } = props
  const edge = (row: GroupStat) => (direction === 'context' ? (row.gave >= row.took ? 'gives' : 'takes') : direction)
  return (
    <ul className="plain-list compact">
      {rows.map((row) => (
        <li key={row.label}>
          <details className="week-line">
            <summary data-energy={edge(row)}>
              <span>{row.label}</span> <span className="muted small">· {describe(row, direction)}</span>
            </summary>
            <Evidence ids={row.entryIds} entries={entries} onOpen={onOpen} />
          </details>
        </li>
      ))}
    </ul>
  )
}
