import type { Entry } from '../../db/types'
import { energyEdge, entryWords } from '../../domain/feelings'
import { loggedAt } from '../../lib/dates'

/** Free writing is listed by its first line. */
export function entryTitle(entry: Entry): string {
  if (entry.kind !== 'free') return entry.activity
  return entry.note.split('\n')[0]?.trim() || 'Free writing'
}

/**
 * One entry: what you did (or the first line of free writing), when you wrote it, its words, and your note. A thin
 * edge shows how it left you (blue gave energy, red took it); the words say it too. An unfinished one says so.
 * Without `onOpen` it's a plain example, as on the welcome (no time: it was never written).
 */
export function EntryRow({ entry, onOpen }: { entry: Entry; onOpen?: () => void }) {
  const free = entry.kind === 'free'
  const words = free ? '' : entryWords(entry)
  const note = free ? entry.note.split('\n').slice(1).join(' ').trim() : entry.note
  const content = (
    <span className="entry-text">
      <span className="entry-first">
        <span className="entry-activity">{entryTitle(entry)}</span>
        {onOpen ? (
          <time className="entry-time" dateTime={new Date(entry.createdAt).toISOString()}>
            {loggedAt(entry.createdAt, entry.date)}
          </time>
        ) : null}
      </span>
      {entry.status === 'draft' ? <span className="entry-status">Unfinished · Continue</span> : null}
      {words ? <span className="entry-feelings">{words}</span> : null}
      {note ? <span className="entry-note">{note}</span> : null}
    </span>
  )
  const energy = free ? undefined : energyEdge(entry.energy)
  return onOpen ? (
    <button type="button" className="entry-row" data-energy={energy} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className="entry-row" data-energy={energy}>
      {content}
    </div>
  )
}
