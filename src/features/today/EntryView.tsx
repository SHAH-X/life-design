import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { db } from '../../db/db'
import { patchEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
import { entryWords } from '../../domain/feelings'
import { purposeInfo } from '../../domain/purposes'
import { summarize } from '../../domain/summary'
import { shortDay } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { entryTitle } from './EntryRow'
import { NextStep } from './NextStep'

/**
 * An entry, read back (Stage E): what happened and what you noticed, in your words; a possible insight only when
 * 3+ entries back it (each one listed, and yours to dismiss or put your own way); your full words; a next step.
 */
export function EntryView(props: { entryId: string; fresh?: boolean; onEdit: (entry: Entry) => void; onClose: () => void }) {
  const { entryId, fresh = false, onEdit, onClose } = props
  const takeId = useId()
  const data = useLiveQuery(async () => {
    const entry = await db.entries.get(entryId)
    if (!entry) return null
    const key = entry.activity.trim().toLowerCase()
    const same = key ? await db.entries.filter((e) => e.activity.trim().toLowerCase() === key).toArray() : [entry]
    return { entry, same }
  }, [entryId])
  const [taking, setTaking] = useState(false)
  const [take, setTake] = useState('')

  // Deleted elsewhere: nothing left to show.
  useEffect(() => {
    if (data === null) onClose()
  }, [data, onClose])
  if (!data) return null

  const { entry, same } = data
  const summary = summarize(entry, same)
  const behind = summary.insight ? same.filter((e) => summary.insight?.entryIds.includes(e.id)).sort((a, b) => b.date.localeCompare(a.date)) : []
  const words = entry.kind === 'free' ? '' : entryWords(entry)

  const footer = (
    <>
      <button type="button" className="primary wide" onClick={onClose}>
        Done
      </button>
      <button type="button" className="wide" onClick={() => onEdit(entry)}>
        Edit
      </button>
    </>
  )

  return (
    <Dialog title={entryTitle(entry)} onClose={onClose} footer={footer}>
      {fresh ? <p className="saved-line">✓ Saved</p> : null}
      <section className="entry-summary" aria-label="Summary">
        <h3>What happened</h3>
        <p>
          <strong>{summary.happened.title}</strong>
          {summary.happened.quote && summary.happened.quote !== summary.happened.title ? <span className="muted"> · “{summary.happened.quote}”</span> : null}
        </p>
        {summary.noticed.length ? (
          <>
            <h3>What you noticed</h3>
            <ul className="plain-list compact">
              {summary.noticed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </>
        ) : null}

        {entry.take ? (
          <>
            <h3>Your take</h3>
            <p>{entry.take}</p>
          </>
        ) : summary.insight && !entry.insightHidden ? (
          <>
            <h3>Possible insight</h3>
            <p>
              {summary.insight.text} <em>{summary.insight.question}</em>
            </p>
            <details className="evidence">
              <summary>See the {behind.length} entries</summary>
              <ul className="plain-list compact">
                {behind.map((e) => (
                  <li key={e.id}>
                    <span className="muted small">{shortDay(e.date)}</span> {entryTitle(e)} <span className="muted small">· {entryWords(e)}</span>
                  </li>
                ))}
              </ul>
            </details>
            {taking ? null : (
              <div className="row">
                <button type="button" className="link" onClick={() => void patchEntry(entry.id, { insightHidden: true })}>
                  Not quite
                </button>
                <button type="button" className="link" onClick={() => setTaking(true)}>
                  Say it your way
                </button>
              </div>
            )}
          </>
        ) : null}
        {taking ? (
          <>
            <label className="question-text" htmlFor={takeId}>
              Your take
            </label>
            <textarea id={takeId} value={take} rows={2} maxLength={1000} onChange={(e) => setTake(e.target.value)} />
            <button
              type="button"
              disabled={!take.trim()}
              onClick={() => {
                void patchEntry(entry.id, { take })
                setTaking(false)
              }}
            >
              Keep my take
            </button>
          </>
        ) : null}
      </section>

      <section className="your-words" aria-label="Your words">
        {entry.kind !== 'free' && words ? <p className="muted small">{words}</p> : null}
        {entry.reflections.map((r) => (
          <div key={r.question} className="answer">
            <p className="muted small">{r.question}</p>
            <p>{r.text}</p>
          </div>
        ))}
        {entry.note && entry.kind !== 'free' ? <p className="views-text">{entry.note}</p> : null}
        {entry.kind === 'free' ? <p className="views-text">{entry.note}</p> : null}
        {entry.purpose && entry.purpose !== 'free' ? <p className="muted small">For: {purposeInfo(entry.purpose).label}</p> : null}
      </section>

      <NextStep entry={entry} />
    </Dialog>
  )
}
