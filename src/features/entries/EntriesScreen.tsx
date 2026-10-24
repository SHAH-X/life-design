import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useId, useState } from 'react'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import type { Entry } from '../../db/types'
import { matchesSearch } from '../../domain/search'
import { longDate, PART_ORDER } from '../../lib/dates'
import { Loading } from '../../ui/Loading'
import { SwipeRow } from '../../ui/SwipeRow'
import { type MeaningResults, setMeaningSearch, useMeaningResults, useMeaningSearch, workingText } from '../meaning/useMeaning'
import { EntryRow, entryTitle } from '../today/EntryRow'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { usePurposeSettings } from '../today/usePurpose'
import { useDeleteEntry } from '../today/useDeleteEntry'
import { useOwnWords } from '../today/useOwnWords'

/** Days with entries shown at first; "Show earlier" adds as many again. */
const DAYS_AT_A_TIME = 60
/** Entries found by meaning, below the word matches: the closest three (see `closest`). */
const BY_MEANING = 3

const NO_ENTRIES: Entry[] = []
const NO_IDS: string[] = []

const byTimeOfDay = (a: Entry, b: Entry) => PART_ORDER[a.part] - PART_ORDER[b.part] || a.createdAt - b.createdAt

/** Logs (the tab was Entries until 2026-10-23): everything you've written, newest first, unfinished ones on top, with a
 *  search. With search by meaning on (v0.14), entries about the same thing follow the word matches. */
export function EntriesScreen() {
  const searchId = useId()
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const own = useOwnWords()
  const purpose = usePurposeSettings()
  const meaning = useMeaningSearch()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [query, setQuery] = useState('')
  const [days, setDays] = useState(DAYS_AT_A_TIME)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  const remove = useDeleteEntry()

  const searching = query.trim() !== ''
  const all = entries ?? NO_ENTRIES
  const matches = all.filter((e) => matchesSearch(e, query))
  const matched = new Set(matches.map((e) => e.id))
  const byMeaning = meaning === 'on' && searching
  const among = byMeaning ? all.filter((e) => e.status !== 'draft' && !matched.has(e.id)).map((e) => e.id) : NO_IDS
  const found = useMeaningResults(query, { enabled: byMeaning && entries !== undefined, among, max: BY_MEANING, pick: 'closest' })
  // Render only once loaded, so nothing jumps under your finger.
  if (entries === undefined || own === undefined || purpose === undefined || meaning === undefined) return <Loading />

  const drafts = matches.filter((e) => e.status === 'draft').sort((a, b) => b.updatedAt - a.updatedAt)
  const done = matches.filter((e) => e.status !== 'draft')
  const dates = [...new Set(done.map((e) => e.date))].sort().reverse()
  const shown = dates.slice(0, days)
  const byId = new Map(entries.map((e) => [e.id, e]))
  const row = (entry: Entry, dated = false) => (
    <li key={entry.id}>
      <SwipeRow deleteLabel={`Delete ${entryTitle(entry)}`} onDelete={() => void remove(entry)}>
        <EntryRow entry={entry} onOpen={() => setSheet({ kind: 'open', entry })} dated={dated} />
      </SwipeRow>
    </li>
  )
  const empty = searching ? 'Nothing matches that yet.' : 'Everything you write will be listed here.'

  return (
    <>
      <h1>Logs</h1>
      <label className="visually-hidden" htmlFor={searchId}>
        Search your logs
      </label>
      <input id={searchId} type="search" placeholder="Search your logs" value={query} onChange={(e) => setQuery(e.target.value)} />
      {searching && meaning === 'unasked' ? <MeaningOffer /> : null}

      {drafts.length ? (
        <section className="list-section" aria-label="Unfinished">
          <h2>Unfinished</h2>
          <ul className="entry-list">{drafts.map((e) => row(e))}</ul>
        </section>
      ) : null}
      {shown.map((date) => (
        <section key={date} className="list-section" aria-label={longDate(date)}>
          <h2>{longDate(date)}</h2>
          <ul className="entry-list">
            {done
              .filter((e) => e.date === date)
              .sort(byTimeOfDay)
              .map((e) => row(e))}
          </ul>
        </section>
      ))}
      {matches.length === 0 && !byMeaning ? <p className="empty">{empty}</p> : null}
      {dates.length > shown.length ? (
        <button type="button" className="wide" onClick={() => setDays((d) => d + DAYS_AT_A_TIME)}>
          Show earlier
        </button>
      ) : null}
      {byMeaning ? <AlsoAboutThis found={found} byId={byId} matched={matched} row={row} alone={matches.length === 0} empty={empty} /> : null}

      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </>
  )
}

/** The first time you search: search by meaning, offered once (More → Search by meaning changes it later). */
function MeaningOffer() {
  return (
    <aside className="notice">
      <p>
        Also find entries by meaning?
        <br />
        <span className="muted small">About 30 MB, once. Stays on this phone.</span>
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={() => void setMeaningSearch(true)}>
          Turn on
        </button>
        <button type="button" onClick={() => void setMeaningSearch(false)}>
          No thanks
        </button>
      </div>
    </aside>
  )
}

/** Below the word matches, so nothing above moves: what search by meaning found, or how it's getting on. `alone`: no
 *  word matched, so this is all there is. */
function AlsoAboutThis(props: {
  found: MeaningResults
  byId: ReadonlyMap<string, Entry>
  matched: ReadonlySet<string>
  row: (entry: Entry, dated: boolean) => ReactNode
  alone: boolean
  empty: string
}) {
  const { found, byId, matched, row, alone, empty } = props
  if (found.state === 'idle') return null
  if (found.state === 'problem')
    return (
      <p className="error small" role="alert">
        {found.message}
      </p>
    )
  if (found.state === 'working')
    return (
      <p className={alone ? 'empty' : 'muted small'} role="status">
        {workingText(found)}
      </p>
    )
  const entries = found.ids.flatMap((id) => {
    const entry = byId.get(id)
    return entry && !matched.has(id) ? [entry] : []
  })
  if (entries.length === 0) return alone ? <p className="empty">{empty}</p> : null
  return (
    <section className="list-section" aria-label="Also about this">
      <h2>Also about this</h2>
      <ul className="entry-list">{entries.map((e) => row(e, true))}</ul>
    </section>
  )
}
