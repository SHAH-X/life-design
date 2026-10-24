import type { Entry } from '../../db/types'
import { entryWords } from '../../domain/feelings'
import { PART_ORDER, shortDay } from '../../lib/dates'
import { useEntryTitle } from '../areas/AreasProvider'

/**
 * The entries behind a line, newest first: day, what it was, and its words. Nothing is claimed without them. With
 * `onOpen` (v0.13) each one opens the entry itself, the same wherever a line opens. `oneDay`: a single day's
 * entries (a day tapped on the chart), in the order of the day as on Logs, without repeating its date.
 */
export function Evidence(props: { ids: readonly string[]; entries: ReadonlyMap<string, Entry>; onOpen?: (entry: Entry) => void; oneDay?: boolean }) {
  const { ids, entries, onOpen, oneDay = false } = props
  const entryTitle = useEntryTitle()
  const listed = ids
    .map((id) => entries.get(id))
    .filter((e): e is Entry => e !== undefined)
    .sort(
      oneDay
        ? (a, b) => PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt
        : (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
    )
  return (
    <ul className="plain-list compact evidence-list">
      {listed.map((e) => {
        const words = (
          <>
            {oneDay ? null : <span className="muted small">{shortDay(e.date)} </span>}
            {entryTitle(e)}
            {e.kind === 'free' ? null : <span className="muted small"> · {entryWords(e)}</span>}
          </>
        )
        return (
          <li key={e.id}>
            {onOpen ? (
              <button type="button" className="line-button" onClick={() => onOpen(e)}>
                <span>{words}</span>
              </button>
            ) : (
              words
            )}
          </li>
        )
      })}
    </ul>
  )
}
