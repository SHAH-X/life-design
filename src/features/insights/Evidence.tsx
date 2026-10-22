import type { Entry } from '../../db/types'
import { entryWords } from '../../domain/feelings'
import { shortDay } from '../../lib/dates'
import { entryTitle } from '../today/EntryRow'

/** The entries behind a line, newest first: day, what it was, and its words. Nothing is claimed without them. */
export function Evidence({ ids, entries }: { ids: readonly string[]; entries: ReadonlyMap<string, Entry> }) {
  const listed = ids
    .map((id) => entries.get(id))
    .filter((e): e is Entry => e !== undefined)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  return (
    <ul className="plain-list compact evidence-list">
      {listed.map((e) => (
        <li key={e.id}>
          <span className="muted small">{shortDay(e.date)}</span> {entryTitle(e)}
          {e.kind === 'free' ? null : <span className="muted small"> · {entryWords(e)}</span>}
        </li>
      ))}
    </ul>
  )
}
