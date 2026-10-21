import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Notices, useExportNudge } from '../../app/Notices'
import { db } from '../../db/db'
import { loadSuggestions, type Suggestions } from '../../db/repo'
import type { Entry } from '../../db/types'
import { addDays, dayHeading, dayMonthLong, PART_ORDER } from '../../lib/dates'
import { useTonight } from '../../prompts/useTonight'
import { useReviewStatus } from '../../reviews/useReviewStatus'
import { EntryEdit } from './EntryEdit'
import { EntryFlow } from './EntryFlow'
import { EntryRow } from './EntryRow'
import { EveningQuestion } from './EveningQuestion'
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
  const tonight = useTonight(date)
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const isToday = date === today

  // Render only once everything has loaded, so nothing jumps under your finger.
  if (entries === undefined || day === undefined || nudge === undefined || reviewStatus === undefined || tonight === undefined) {
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
          <p className="muted">{dayMonthLong(date)}</p>
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
          <p className="empty">Add the 3–6 main things you did.</p>
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
      </section>

      <section className="card evening" aria-label="This evening">
        <SmallJoy key={`joy:${date}`} date={date} saved={day?.smallJoy ?? ''} />
        <EveningQuestion key={`q:${date}:${tonight.prompt.id}`} date={date} tonight={tonight} />
      </section>

      {sheet?.existing ? (
        <EntryEdit existing={sheet.existing} suggestions={suggestions} onClose={() => setSheet(null)} />
      ) : sheet ? (
        <EntryFlow date={date} suggestions={suggestions} onClose={() => setSheet(null)} />
      ) : null}
    </>
  )
}
