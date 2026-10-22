import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { loadSuggestions, type Suggestions } from '../../db/repo'
import type { Entry } from '../../db/types'
import { matchesSearch } from '../../domain/search'
import { longDate, PART_ORDER } from '../../lib/dates'
import { Loading } from '../../ui/Loading'
import { EntryRow } from '../today/EntryRow'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { usePurposeSettings } from '../today/usePurpose'
import { useOwnWords } from '../today/useOwnWords'

const NO_SUGGESTIONS: Suggestions = { activities: [], where: [], people: [], objects: [] }
/** Days with entries shown at first; "Show earlier" adds as many again. */
const DAYS_AT_A_TIME = 60

const byTimeOfDay = (a: Entry, b: Entry) => PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt

/** Everything you've written, newest first, unfinished ones on top, with a search. */
export function EntriesScreen() {
  const searchId = useId()
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const own = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [query, setQuery] = useState('')
  const [days, setDays] = useState(DAYS_AT_A_TIME)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || own === undefined || purpose === undefined) return <Loading />

  const matches = entries.filter((e) => matchesSearch(e, query))
  const drafts = matches.filter((e) => e.status === 'draft').sort((a, b) => b.updatedAt - a.updatedAt)
  const done = matches.filter((e) => e.status !== 'draft')
  const dates = [...new Set(done.map((e) => e.date))].sort().reverse()
  const shown = dates.slice(0, days)
  const row = (entry: Entry) => (
    <li key={entry.id}>
      <EntryRow entry={entry} onOpen={() => setSheet({ kind: 'open', entry })} />
    </li>
  )

  return (
    <>
      <h1>Entries</h1>
      <label className="visually-hidden" htmlFor={searchId}>
        Search your entries
      </label>
      <input id={searchId} type="search" placeholder="Search your entries" value={query} onChange={(e) => setQuery(e.target.value)} />

      {drafts.length ? (
        <section className="list-section" aria-label="Unfinished">
          <h2>Unfinished</h2>
          <ul className="entry-list">{drafts.map(row)}</ul>
        </section>
      ) : null}
      {shown.map((date) => (
        <section key={date} className="list-section" aria-label={longDate(date)}>
          <h2>{longDate(date)}</h2>
          <ul className="entry-list">{done.filter((e) => e.date === date).sort(byTimeOfDay).map(row)}</ul>
        </section>
      ))}
      {matches.length === 0 ? <p className="empty">{query.trim() ? 'Nothing matches that yet.' : 'Everything you write will be listed here.'}</p> : null}
      {dates.length > shown.length ? (
        <button type="button" className="wide" onClick={() => setDays((d) => d + DAYS_AT_A_TIME)}>
          Show earlier
        </button>
      ) : null}

      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </>
  )
}
