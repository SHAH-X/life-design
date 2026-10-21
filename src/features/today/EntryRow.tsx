import type { Entry } from '../../db/types'
import { energyEdge, wordsFor } from '../../domain/feelings'

/**
 * One activity: what you did, the words you described it with, and your note. A thin edge shows how it left you
 * (blue gave energy, red took it); the words stay in ink. Time, place and people are in the edit view.
 * Without `onOpen` it's a plain example, as on the welcome.
 */
export function EntryRow({ entry, onOpen }: { entry: Entry; onOpen?: () => void }) {
  const { during, after } = wordsFor(entry)
  const content = (
    <span className="entry-text">
      <span className="entry-activity">{entry.activity}</span>
      <span className="entry-feelings">{[...during, ...after].map((word) => word.toLowerCase()).join(' · ')}</span>
      {entry.note ? <span className="entry-note">{entry.note}</span> : null}
    </span>
  )
  return onOpen ? (
    <button type="button" className="entry-row" data-energy={energyEdge(entry.energy)} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className="entry-row" data-energy={energyEdge(entry.energy)}>
      {content}
    </div>
  )
}
