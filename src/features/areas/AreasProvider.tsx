import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { ensureAreas, lifeAreas } from '../../db/areas'
import { db } from '../../db/db'
import { ensureLoopVectors } from '../../db/loops'
import { isDone } from '../../db/repo'
import type { Entry } from '../../db/types'
import { type AreaId, entryTitle } from '../../domain/areas'
import { embed, MEANING_PROBLEMS, MeaningError } from '../../lib/embedder'
import { type MeaningSearch, useMeaningSearch } from '../meaning/useMeaning'

/** After a change, this long without another before the entries are read again (an edit saves as you type). */
const SETTLE_MS = 1500

export type AreasWork =
  | { state: 'idle' }
  | { state: 'working'; progress: { done: number; total: number } | null }
  | { state: 'problem'; message: string }

export interface Areas {
  /** Life areas read the numbers search by meaning works out, so they need it on. Undefined while loading. */
  meaning: MeaningSearch | undefined
  /** Each finished entry's areas; null until the areas are first worked out, undefined while loading. */
  byEntry: ReadonlyMap<string, readonly AreaId[]> | null | undefined
  work: AreasWork
}

const NOTHING: Areas = { meaning: undefined, byEntry: undefined, work: { state: 'idle' } }
const AreasContext = createContext<Areas>(NOTHING)

/**
 * Keeps life areas and the provoker's open loops in step with the journal while the app is open: when finished entries
 * change (and when it starts), the model works out what's new, in its worker, a moment after the last change. Nothing
 * runs while you write a new entry: a draft isn't read.
 */
export function AreasProvider({ children }: { children: ReactNode }) {
  const meaning = useMeaningSearch()
  const on = meaning === 'on'
  const finished = useLiveQuery(
    async () => (on ? (await db.entries.toArray()).filter(isDone).map((e) => `${e.id}:${e.updatedAt}`).sort().join('|') : ''),
    [on],
  )
  const byEntry = useLiveQuery(() => (on ? lifeAreas(db) : null), [on])
  const [work, setWork] = useState<AreasWork>({ state: 'idle' })

  useEffect(() => {
    if (!on || finished === undefined) return
    let live = true
    const timer = setTimeout(() => {
      ensureAreas(embed, db, (done, total) => {
        if (live) setWork({ state: 'working', progress: { done, total } })
      })
        // Then the provoker's open loops, which read the same numbers.
        .then(() => ensureLoopVectors(embed, db))
        .then(() => {
          if (live) setWork({ state: 'idle' })
        })
        .catch((error: unknown) => {
          if (live) setWork({ state: 'problem', message: error instanceof MeaningError ? error.message : MEANING_PROBLEMS.start })
        })
    }, SETTLE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [on, finished])

  // Turned off, titles lose their areas at once (the query's last answer may still be the areas').
  const known = on ? byEntry : meaning === undefined ? undefined : null
  return <AreasContext.Provider value={{ meaning, byEntry: known, work }}>{children}</AreasContext.Provider>
}

export const useAreas = (): Areas => useContext(AreasContext)

/** What an entry is called, with free writing named by its areas once they're known. */
export function useEntryTitle(): (entry: Entry) => string {
  const { byEntry } = useAreas()
  return useCallback((entry: Entry) => entryTitle(entry, byEntry?.get(entry.id)), [byEntry])
}
