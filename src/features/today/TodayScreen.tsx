import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Notices, useExportNudge } from '../../app/Notices'
import { db } from '../../db/db'
import { loadSuggestions, type Suggestions } from '../../db/repo'
import type { Entry } from '../../db/types'
import { addDays, dayHeading, longDate, PART_ORDER } from '../../lib/dates'
import { useReviewStatus } from '../../reviews/useReviewStatus'
import { EntryRow } from './EntryRow'
import { EntrySheet } from './EntrySheet'
import { SmallJoy } from './SmallJoy'
import { useToday } from './useToday'

const NO_SUGGESTIONS: Suggestions = { activities: [], where: [], people: [], objects: [] }

const byTimeOfDay = (a: Entry, b: Entry) => PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt

export function TodayScreen() {
  const today = useToday()
  const [date, setDate] = useState(today)
  const [sheet, setSheet] = useState<{ existing?: Entry } | null>(null)

  // After midnight, jump to the new day.
  useEffect(() => setDate(today), [today])

  const entries = useLiveQuery(() => db.entries.where('date').equals(date).toArray(), [date])
  const day = useLiveQuery(() => db.days.get(date).then((d) => d ?? null), [date])
  const nudge = useExportNudge()
  const reviewStatus = useReviewStatus()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const isToday = date === today

  // Render only once everything has loaded, so nothing jumps under your finger.
  if (entries === undefined || day === undefined || nudge === undefined || reviewStatus === undefined) {
    return <div className="loading" aria-busy="true" />
  }
  const sorted = [...entries].sort(byTimeOfDay)

  return (
    <>
      <Notices nudge={nudge} reviewDue={reviewStatus.due ? reviewStatus.defaultPeriod : null} />

      <header className="day-header">
        <button type="button" className="icon-button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          ‹
        </button>
        <div className="day-title">
          <h1>{dayHeading(date, today)}</h1>
          <p className="muted">{longDate(date)}</p>
        </div>
        <button type="button" className="icon-button" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}>
          ›
        </button>
      </header>
      {!isToday ? (
        <p className="center">
          <button type="button" className="link" onClick={() => setDate(today)}>
            Back to today
          </button>
        </p>
      ) : null}

      <section aria-label="Activities">
        {sorted.length === 0 ? (
          <div className="empty">
            <p>Nothing logged yet{isToday ? ' today' : ''}.</p>
            <p className="small">Add the 3–6 main things you did: work, people, exercise, chores… anything that took real time.</p>
          </div>
        ) : (
          <ul className="entry-list">
            {sorted.map((entry) => (
              <li key={entry.id}>
                <EntryRow entry={entry} onOpen={() => setSheet({ existing: entry })} />
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="primary wide" onClick={() => setSheet({})}>
          + Add activity
        </button>
        {sorted.length > 0 && sorted.length < 3 ? <p className="muted small center">Aim for 3–6 main activities.</p> : null}
      </section>

      <SmallJoy key={date} date={date} saved={day?.smallJoy ?? ''} />

      {sheet ? <EntrySheet date={date} existing={sheet.existing} suggestions={suggestions} onClose={() => setSheet(null)} /> : null}
    </>
  )
}
