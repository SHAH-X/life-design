import type { Entry } from '../../db/types'
import { energyEdge, entryWords } from '../../domain/feelings'
import { loggedAt, shortDayMonth } from '../../lib/dates'

/** What an entry is called in lists, labels and its sheet: the activity, or "Free writing" (never the writing itself:
 * a long first line once became a whole passage in bold, v0.12.2). */
export function entryTitle(entry: Entry): string {
  return entry.kind === 'free' ? 'Free writing' : entry.activity
}

/**
 * One entry, the same shape for every kind: a one-line title (what you did, or "Free writing") and when you wrote it,
 * its words, then at most two lines of what you wrote: the whole of it opens with the entry (owner, v0.12.2: "the very
 * big passage should not be shown like this"). A thin edge shows how it left you (blue gave energy, red took it); the
 * words say it too. An unfinished one says so.
 * Without `onOpen` it's a plain example, as on the welcome (no time: it was never written). `dated`: its day instead of
 * the time, for a row away from its day's heading.
 */
export function EntryRow({ entry, onOpen, dated = false }: { entry: Entry; onOpen?: () => void; dated?: boolean }) {
  const free = entry.kind === 'free'
  const words = free ? '' : entryWords(entry)
  const note = entry.note.replace(/\s+/g, ' ').trim()
  const content = (
    <span className="entry-text">
      <span className="entry-first">
        <span className="entry-activity">{entryTitle(entry)}</span>
        {onOpen ? (
          <time className="entry-time" dateTime={dated ? entry.date : new Date(entry.createdAt).toISOString()}>
            {dated ? shortDayMonth(entry.date) : loggedAt(entry.createdAt, entry.date)}
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
