import type { Entry } from '../../db/types'
import { energyEdge, entryWords } from '../../domain/feelings'

/** Free writing is listed by its first line. */
export function entryTitle(entry: Entry): string {
  if (entry.kind !== 'free') return entry.activity
  return entry.note.split('\n')[0]?.trim() || 'Free writing'
}

/**
 * One entry: what you did (or the first line of free writing), its words, and your note. A thin edge shows how it
 * left you (blue gave energy, red took it); the words say it too. An unfinished one says so.
 * Without `onOpen` it's a plain example, as on the welcome.
 */
export function EntryRow({ entry, onOpen }: { entry: Entry; onOpen?: () => void }) {
  const free = entry.kind === 'free'
  const words = free ? '' : entryWords(entry)
  const note = free ? entry.note.split('\n').slice(1).join(' ').trim() : entry.note
  const content = (
    <span className="entry-text">
      <span className="entry-activity">{entryTitle(entry)}</span>
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
