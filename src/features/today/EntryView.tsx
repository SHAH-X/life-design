import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { db } from '../../db/db'
import { deleteEntry, patchEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
import { DURATION_OPTIONS, ENERGY_OPTIONS, entryWords, wordsFor } from '../../domain/feelings'
import { possibleInsight } from '../../domain/summary'
import { addDays, DAY_PARTS, loggedAt, longDate, shortDay, toDateKey } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { revealOnMount } from '../../ui/keepInView'
import type { EntryPart } from './EntryEdit'
import { useAreas, useEntryTitle } from '../areas/AreasProvider'
import { PhotoReading } from '../photos/PhotoReading'
import { StoredPhoto } from '../photos/PhotoView'
import { usePhotoText } from '../photos/usePhotoText'
import { NextStep } from './NextStep'

const words = (list: readonly string[]) => [...new Set(list.map((w) => w.toLowerCase()))].join(' · ')

/** An entry's parts, in plain words, each opening its own question: what you did, the three questions, your words,
 * and when, how long, where and who. A skipped question says so (never guessed). Free writing is its words. */
function partsFor(entry: Entry): { part: EntryPart; label: string; value: string; empty: boolean; edge?: 'gives' | 'takes' }[] {
  const writing = [...entry.reflections.map((r) => `${r.question} ${r.text}`), entry.note.trim()].filter(Boolean).join('\n\n')
  // Writing that answers Today's question (v0.16) is labelled with it.
  const yourWords = { part: 'writing' as const, label: entry.replyTo?.question ?? 'Your words', value: writing || 'Nothing written yet', empty: !writing }
  if (entry.kind === 'free') return [yourWords]
  const { during, after } = wordsFor(entry)
  const energy = ENERGY_OPTIONS.find((o) => o.value === entry.energyEffect)?.label ?? ''
  const duration = DURATION_OPTIONS.find((o) => o.value === entry.duration)?.label ?? ''
  const part = DAY_PARTS.find((p) => p.value === entry.part)?.label ?? ''
  const details = [part, duration, ...entry.where, ...entry.people, ...entry.objects].filter(Boolean).join(' · ')
  return [
    { part: 'activity', label: 'What you did', value: entry.activity, empty: false },
    { part: 'during', label: 'What it was like', value: words(during) || 'Skipped', empty: during.length === 0 },
    { part: 'energy', label: 'What it did to your energy', value: energy || 'Skipped', empty: !energy, edge: entry.energyEffect === 'gave' ? 'gives' : entry.energyEffect === 'used' ? 'takes' : undefined },
    { part: 'after', label: 'How you felt', value: words(after) || 'Skipped', empty: after.length === 0 },
    yourWords,
    { part: 'details', label: 'When, how long, where, who', value: details, empty: false },
  ]
}

/** "Today, afternoon", "Yesterday, evening", "Monday 19 October, morning". */
function when(entry: Entry): string {
  const today = toDateKey(new Date())
  const day = entry.date === today ? 'Today' : entry.date === addDays(today, -1) ? 'Yesterday' : longDate(entry.date)
  return `${day}, ${entry.part}`
}

/**
 * An entry, one screen to read it and to change it (owner, 2026-10-23: "it should be simpler … whether two different
 * screens required?"). When it was, a possible insight only when 3+ entries back it (each one listed, and yours to
 * dismiss or put your own way), then the entry as its parts in plain words: tap one and only that question opens.
 * Then a next step, or what you keep to remember, also changed with a tap. Delete asks first.
 */
export function EntryView(props: { entryId: string; fresh?: boolean; onPart: (entry: Entry, part: EntryPart | 'remember') => void; onClose: () => void }) {
  const { entryId, fresh = false, onPart, onClose } = props
  const entryTitle = useEntryTitle()
  const { photoProblem, aiProblem } = useAreas()
  const reading = usePhotoText()
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
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Deleted elsewhere: nothing left to show.
  useEffect(() => {
    if (data === null) onClose()
  }, [data, onClose])
  if (!data) return null

  const { entry, same } = data
  const insight = entry.take || entry.insightHidden ? null : possibleInsight(entry, same)
  const behind = insight ? same.filter((e) => insight.entryIds.includes(e.id)).sort((a, b) => b.date.localeCompare(a.date)) : []
  const parts = partsFor(entry)

  // One row, as everywhere: Delete asks first.
  const footer = confirmDelete ? (
    <div className="row">
      <span className="grow">Delete this entry?</span>
      <button type="button" className="danger" onClick={() => void deleteEntry(entry.id).then(onClose)}>
        Yes, delete
      </button>
      <button type="button" onClick={() => setConfirmDelete(false)}>
        Keep
      </button>
    </div>
  ) : (
    <div className="footer-row">
      <button type="button" className="link danger-text" onClick={() => setConfirmDelete(true)}>
        Delete
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

      <section className="entry-parts" aria-label="Your entry">
        {parts.map((p) => (
          <button key={p.part} type="button" className="part-row" onClick={() => onPart(entry, p.part)}>
            <span className="part-label">{p.label}</span>{' '}
            <span className={p.empty ? 'part-value muted' : p.part === 'writing' ? 'part-value writing' : 'part-value'} data-energy={p.edge}>
              {p.value || 'Add'}
            </span>
            <span className="part-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
      </section>

      {entry.photos.length ? (
        <section className="entry-photos" aria-label="Photos">
          {entry.photos.map((photo, i) => (
            <figure key={photo.id}>
              <StoredPhoto id={photo.id} className="photo-full" alt={`Photo ${i + 1}`} />
              <PhotoReading photo={photo} phoneProblem={photoProblem} phoneReading={reading === 'on'} aiProblem={aiProblem} />
            </figure>
          ))}
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

      <NextStep entry={entry} onRemember={() => onPart(entry, 'remember')} />
    </Dialog>
  )
}
