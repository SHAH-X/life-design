import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { db } from '../../db/db'
import { patchEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
import { ENERGY_OPTIONS, entryWords, wordsFor } from '../../domain/feelings'
import { possibleInsight } from '../../domain/summary'
import { addDays, loggedAt, longDate, shortDay, toDateKey } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { revealOnMount } from '../../ui/keepInView'
import { entryTitle } from './EntryRow'
import { NextStep } from './NextStep'

/** The words an entry was described with, as tapped: the energy answer first (with its edge), "time flew", then the rest. */
function chipsFor(entry: Entry): { energy: { label: string; edge: 'gives' | 'takes' | undefined } | null; words: string[] } {
  if (entry.kind === 'free') return { energy: null, words: [] }
  const { during, after } = wordsFor(entry)
  const option = ENERGY_OPTIONS.find((o) => o.value === entry.energyEffect)
  const edge = entry.energyEffect === 'gave' ? 'gives' : entry.energyEffect === 'used' ? 'takes' : undefined
  const words = [...during.filter((w) => w === 'Time flew'), ...during.filter((w) => w !== 'Time flew'), ...after]
  return { energy: option ? { label: option.short, edge } : null, words: [...new Set(words.map((w) => w.toLowerCase()))] }
}

/** "Today, afternoon", "Yesterday, evening", "Monday 19 October, morning". */
function when(entry: Entry): string {
  const today = toDateKey(new Date())
  const day = entry.date === today ? 'Today' : entry.date === addDays(today, -1) ? 'Yesterday' : longDate(entry.date)
  return `${day}, ${entry.part}`
}

/**
 * An entry, read back (Stage E): your entry first, as you gave it (the words you tapped, then what you wrote),
 * then a possible insight only when 3+ entries back it (each one listed, and yours to dismiss or put your own way),
 * then a next step. Nothing repeated (v0.9: the summary that restated the entry made it hard to read).
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
  const insight = entry.take || entry.insightHidden ? null : possibleInsight(entry, same)
  const behind = insight ? same.filter((e) => insight.entryIds.includes(e.id)).sort((a, b) => b.date.localeCompare(a.date)) : []
  const chips = chipsFor(entry)
  const written = entry.reflections.length > 0 || entry.note.trim() !== ''

  const footer = (
    <div className="footer-row">
      <button type="button" onClick={() => onEdit(entry)}>
        Edit
      </button>
      <button type="button" className="primary" onClick={onClose}>
        Done
      </button>
    </div>
  )

  return (
    <Dialog title={entryTitle(entry)} onClose={onClose} footer={footer} full>
      <p className="entry-when">
        {fresh ? (
          <>
            <span className="saved-line">✓ Saved</span> ·{' '}
          </>
        ) : null}
        {when(entry)}
        {fresh ? null : ` · logged ${loggedAt(entry.createdAt, entry.date)}`}
      </p>

      {chips.energy || chips.words.length ? (
        <ul className="chip-row entry-chips" aria-label="How it was">
          {chips.energy ? (
            <li className="chip static" data-energy={chips.energy.edge}>
              {chips.energy.label}
            </li>
          ) : null}
          {chips.words.map((w) => (
            <li key={w} className="chip static">
              {w}
            </li>
          ))}
        </ul>
      ) : null}

      {written ? (
        <section className="entry-writing" aria-label="Your words">
          {entry.reflections.map((r) => (
            <div key={r.question} className="earlier">
              <p className="muted small">{r.question}</p>
              <p className="writing">{r.text}</p>
            </div>
          ))}
          {entry.note.trim() ? <p className="writing">{entry.note}</p> : null}
        </section>
      ) : null}

      {entry.take ? (
        <section className="insight-card" aria-label="Your take">
          <h3>Your take</h3>
          <p>{entry.take}</p>
        </section>
      ) : insight ? (
        <section className="insight-card" data-energy={insight.direction} aria-label="Possible insight">
          <h3>Possible insight</h3>
          <p>
            {insight.text} <em>{insight.question}</em>
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
          {taking ? (
            <div ref={revealOnMount}>
              <label className="question-text" htmlFor={takeId}>
                Your take
              </label>
              <textarea id={takeId} value={take} rows={2} maxLength={1000} onChange={(e) => setTake(e.target.value)} />
              <button
                type="button"
                className="top-gap"
                disabled={!take.trim()}
                onClick={() => {
                  void patchEntry(entry.id, { take })
                  setTaking(false)
                }}
              >
                Keep my take
              </button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className="link" onClick={() => void patchEntry(entry.id, { insightHidden: true })}>
                Not quite
              </button>
              <button type="button" className="link" onClick={() => setTaking(true)}>
                Say it your way
              </button>
            </div>
          )}
        </section>
      ) : null}

      <NextStep entry={entry} />
    </Dialog>
  )
}
