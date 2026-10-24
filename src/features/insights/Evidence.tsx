import type { Entry } from '../../db/types'
import { entryWords } from '../../domain/feelings'
import { photoTexts } from '../../domain/search'
import { PART_ORDER, shortDay } from '../../lib/dates'
import { useEntryTitle } from '../areas/AreasProvider'

/** About one line after its date at iPhone width: an opened line stays a list to scan, not pages of writing. */
const OPENING_MAX = 36

/** How a piece of free writing starts (or what its photo says), cut at a word. */
function opening(entry: Entry): string {
  const text = (entry.note || photoTexts(entry).join(' ')).replace(/\s+/g, ' ').trim()
  if (text.length <= OPENING_MAX) return text
  const cut = text.slice(0, OPENING_MAX)
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : OPENING_MAX).trimEnd()}…`
}

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
        // Free writing by how it starts (v0.16): its title is now its area, the same on every line of an area.
        const words = (
          <>
            {oneDay ? null : <span className="muted small">{shortDay(e.date)} </span>}
            {e.kind === 'free' ? opening(e) || entryTitle(e) : entryTitle(e)}
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
