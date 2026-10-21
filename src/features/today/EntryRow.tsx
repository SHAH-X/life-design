import type { Entry } from '../../db/types'
import { feelingTone, type OwnWord, wordsFor } from '../../domain/feelings'

/** One activity: what you did, the words you described it with, and your note. Time, place and people are in the edit view. */
export function EntryRow({ entry, own, onOpen }: { entry: Entry; own: readonly OwnWord[]; onOpen: () => void }) {
  const { during, after } = wordsFor(entry)

  return (
    <button type="button" className="entry-row" onClick={onOpen}>
      <span className="entry-text">
        <span className="entry-activity">{entry.activity}</span>
        <span className="entry-feelings">
          {[...during.map((word) => ({ word, tone: 'neutral' as const })), ...after.map((word) => ({ word, tone: feelingTone(word, own) }))].map(
            ({ word, tone }, i) => (
              <span key={`${i}:${word}`} className={`feeling ${tone}`}>
                {i > 0 ? ' · ' : ''}
                {word.toLowerCase()}
              </span>
            ),
          )}
        </span>
        {entry.note ? <span className="entry-note">{entry.note}</span> : null}
      </span>
    </button>
  )
}
