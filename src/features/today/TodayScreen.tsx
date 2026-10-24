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
import { SwipeRow } from '../../ui/SwipeRow'
import { useEntryTitle } from '../areas/AreasProvider'
import { EntryRow } from './EntryRow'
import { EntrySheet, type EntrySheetState } from './EntrySheet'
import { usePurposeSettings } from './usePurpose'
import { EveningQuestion } from './EveningQuestion'
import { SmallJoy } from './SmallJoy'
import { useDeleteEntry } from './useDeleteEntry'
import { useOwnWords } from './useOwnWords'
import { Provoker } from './Provoker'
import { useProvoker } from './useProvoker'
import { useToday } from './useToday'

const byTimeOfDay = (a: Entry, b: Entry) => PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt

export function TodayScreen() {
  const entryTitle = useEntryTitle()
  const today = useToday()
  const [date, setDate] = useState(today)
  // Writing (the box), or an entry you tapped (an unfinished one carries on where it was left).
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  const remove = useDeleteEntry()

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
  const provoker = useProvoker(today)
  const isToday = date === today

  // Render only once everything has loaded, so nothing jumps under your finger.
  if (
    entries === undefined ||
    day === undefined ||
    nudge === undefined ||
    purpose === undefined ||
    tonight === undefined ||
    own === undefined ||
    lastEntryDate === undefined ||
    provoker === undefined
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

      <section aria-label="Your writing">
        {welcomeBack ? <p className="empty">Welcome back. Missed days don't matter.</p> : null}
        {/* The provoker (v0.16): at most one question a day from your own writing, today only. */}
        {isToday ? <Provoker key={today} today={today} data={provoker} onAnswer={(ask) => setSheet({ kind: 'free', date, ask })} /> : null}
        {/* One way in (v0.15, owner: "If I have to think about where a thought belongs, I won't record it"): no title,
            no category, no questions. It comes first, always in the same place: a long day never pushes it out of sight. */}
        <button type="button" className="capture-box" onClick={() => setSheet({ kind: 'free', date })}>
          <span className="capture-prompt">What's on your mind?</span>
          <span className="capture-hint">A thought, a worry, a plan…</span>
        </button>
        {sorted.length === 0 ? null : (
          <ul className="entry-list">
            {sorted.map((entry) => (
              <li key={entry.id}>
                <SwipeRow deleteLabel={`Delete ${entryTitle(entry)}`} onDelete={() => void remove(entry)}>
                  <EntryRow entry={entry} onOpen={() => setSheet({ kind: 'open', entry })} />
                </SwipeRow>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card evening" aria-label="This evening">
        <SmallJoy key={`joy:${date}`} date={date} saved={day?.smallJoy ?? ''} />
        <EveningQuestion key={`q:${date}:${tonight.prompt.id}`} date={date} tonight={tonight} />
      </section>

      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </>
  )
}
