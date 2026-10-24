import type { Entry, Question } from '../../db/types'
import { amountsNotFromPhone, notFromPhoneLine } from '../../domain/ask'
import { PlainMarkdown } from '../../ui/PlainMarkdown'
import { useEntryTitle } from '../areas/AreasProvider'

/** An answer: its words, any amount in it the phone didn't give, the receipts and entries it named (each opens), and
 *  every part that was sent for it. */
export function Answer({ question, entries, onOpen }: { question: Question; entries: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  const title = useEntryTitle()
  const notFromPhone = notFromPhoneLine(amountsNotFromPhone(question.answer, question.sent))
  const byPhoto = new Map([...entries.values()].flatMap((e) => (e.photos ?? []).map((p) => [p.id, e] as const)))
  const used = [
    ...new Set([...question.cited.receipts.map((id) => byPhoto.get(id)), ...question.cited.entries.map((id) => entries.get(id))].filter((e): e is Entry => e !== undefined)),
  ]
  return (
    <>
      <PlainMarkdown text={question.answer} />
      {notFromPhone ? <p className="notice warn">{notFromPhone}</p> : null}
      {used.length ? (
        <ul className="plain-list compact">
          {used.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="line-button" onClick={() => onOpen(entry)}>
                <span>
                  <span className="muted small">{entry.date}</span> {title(entry)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <details className="evidence">
        <summary>What was sent</summary>
        {question.sent.map((s, i) => (
          <div key={i}>
            <p className="small">
              <strong>{s.label}</strong>
            </p>
            <pre className="sent-preview">{s.text}</pre>
          </div>
        ))}
      </details>
    </>
  )
}
