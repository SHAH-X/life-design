import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Notices, useExportNudge } from '../../app/Notices'
import { isBackAfterBreak } from '../../app/welcome'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import type { Entry } from '../../db/types'
import { addDays, dayHeading, dayMonthLong, PART_ORDER } from '../../lib/dates'
import { useTonight } from '../../prompts/useTonight'
import { Loading } from '../../ui/Loading'
import { EntryRow } from './EntryRow'
import { EntrySheet, type EntrySheetState } from './EntrySheet'
import { usePurposeSettings } from './usePurpose'
import { EveningQuestion } from './EveningQuestion'
import { SmallJoy } from './SmallJoy'
import { useOwnWords } from './useOwnWords'
import { useToday } from './useToday'


const byTimeOfDay = (a: Entry, b: Entry) => PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt

export function TodayScreen() {
  const today = useToday()
  const [date, setDate] = useState(today)
  // A new activity, free writing, or an entry you tapped (an unfinished one carries on where it was left).
  const [sheet, setSheet] = useState<EntrySheetState>(null)

  // After midnight, jump to the new day.
  useEffect(() => setDate(today), [today])

  const entries = useLiveQuery(() => db.entries.where('date').equals(date).toArray(), [date])
  const day = useLiveQuery(() => db.days.get(date).then((d) => d ?? null), [date])
  const lastEntryDate = useLiveQuery(() => db.entries.where('date').below(today).last().then((e) => e?.date ?? null), [today])
  const nudge = useExportNudge()
  const purpose = usePurposeSettings()
  const tonight = useTonight(date)
  const own = useOwnWords()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const isToday = date === today

  // Render only once everything has loaded, so nothing jumps under your finger.
  if (
    entries === undefined ||
    day === undefined ||
    nudge === undefined ||
    purpose === undefined ||
    tonight === undefined ||
    own === undefined ||
    lastEntryDate === undefined
  ) {
    return <Loading />
  }
  const sorted = [...entries].sort(byTimeOfDay)
  // After a few days away: no counts or streaks, just a way back in.
  const welcomeBack = isToday && sorted.length === 0 && isBackAfterBreak(lastEntryDate, today)

  return (
    <>
      <Notices nudge={nudge} />

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
          <p className="empty">{welcomeBack ? "Welcome back. Missed days don't matter: start with one thing you did." : 'Start with one thing you did.'}</p>
        ) : (
          <ul className="entry-list">
            {sorted.map((entry) => (
              <li key={entry.id}>
                <EntryRow entry={entry} onOpen={() => setSheet({ kind: 'open', entry })} />
              </li>
            ))}
          </ul>
        )}
        <div className="journal-actions">
          <button type="button" className="primary wide" onClick={() => setSheet({ kind: 'new', date })}>
            + Reflect on an activity
          </button>
          <button type="button" className="wide" onClick={() => setSheet({ kind: 'free', date })}>
            Write freely
          </button>
        </div>
      </section>

      <section className="card evening" aria-label="This evening">
        <SmallJoy key={`joy:${date}`} date={date} saved={day?.smallJoy ?? ''} />
        <EveningQuestion key={`q:${date}:${tonight.prompt.id}`} date={date} tonight={tonight} />
      </section>

      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </>
  )
}
