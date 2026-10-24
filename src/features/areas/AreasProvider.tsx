import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { ensureAreas, lifeAreas } from '../../db/areas'
import { db } from '../../db/db'
import { ensureLoopVectors } from '../../db/loops'
import { ensureAiReadings, photoReaderSettings, waitingForAi } from '../../db/aiReading'
import { ensurePhotoText } from '../../db/photoText'
import { isDone } from '../../db/repo'
import type { Entry } from '../../db/types'
import { type AreaId, entryTitle } from '../../domain/areas'
import { AI_PROBLEMS, AiError } from '../../lib/ai'
import { embed, MEANING_PROBLEMS, MeaningError } from '../../lib/embedder'
import { photoReader } from '../photos/photoReader'
import { OCR_PROBLEMS, OcrError, readPhoto } from '../../lib/reader'
import { type MeaningSearch, useMeaningSearch } from '../meaning/useMeaning'
import { usePhotoText } from '../photos/usePhotoText'

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
  /** Why photos couldn't be read lately, in the app's words; null when they could (or reading is off). */
  photoProblem: string | null
  /** Why receipts couldn't go to your AI lately (v0.18); null when they could. */
  aiProblem: string | null
}

const NOTHING: Areas = { meaning: undefined, byEntry: undefined, work: { state: 'idle' }, photoProblem: null, aiProblem: null }
const AreasContext = createContext<Areas>(NOTHING)

/**
 * The app's work on the phone while it's open, a moment after the last change: the text in photos not read yet (with
 * reading photos on), then life areas and the provoker's open loops (with search by meaning on), each model in its own
 * worker. Search by meaning reads only finished entries: nothing is worked out from writing in progress.
 */
export function AreasProvider({ children }: { children: ReactNode }) {
  const meaning = useMeaningSearch()
  const on = meaning === 'on'
  const reading = usePhotoText() === 'on'
  const changes = useLiveQuery(async () => {
    if (!on && !reading) return ''
    const entries = await db.entries.toArray()
    const finished = on ? entries.filter(isDone).map((e) => `${e.id}:${e.updatedAt}`).sort().join('|') : ''
    const unread = reading ? entries.flatMap((e) => (e.photos ?? []).filter((p) => p.text === null).map((p) => p.id)).sort().join('|') : ''
    // Receipts the AI hasn't read yet (v0.18), once the phone has read them, and the AI set up for them (a new key or
    // service tries again).
    const ai = reading ? await photoReaderSettings(db) : null
    const forAi = ai?.auto ? `${ai.provider}:${ai.model}:${ai.keyAt}:${waitingForAi(entries).sort().join('|')}` : ''
    return `${finished}#${unread}#${forAi}`
  }, [on, reading])
  const byEntry = useLiveQuery(() => (on ? lifeAreas(db) : null), [on])
  const [work, setWork] = useState<AreasWork>({ state: 'idle' })
  const [photoProblem, setPhotoProblem] = useState<string | null>(null)
  const [aiProblem, setAiProblem] = useState<string | null>(null)

  useEffect(() => {
    if ((!on && !reading) || changes === undefined) return
    let live = true
    const timer = setTimeout(() => {
      void (async () => {
        if (reading) {
          try {
            await ensurePhotoText(readPhoto, db)
            if (live) setPhotoProblem(null)
          } catch (error) {
            if (live) setPhotoProblem(error instanceof OcrError ? error.message : OCR_PROBLEMS.start)
          }
          // Then what the phone takes for receipts, to your AI (owner's choice, v0.18), when it can read photos.
          try {
            const ai = await photoReaderSettings(db)
            if (ai?.auto) await ensureAiReadings(photoReader(ai), db)
            if (live) setAiProblem(null)
          } catch (error) {
            if (live) setAiProblem(error instanceof AiError ? error.message : AI_PROBLEMS.other)
          }
        }
        if (!on) return
        try {
          await ensureAreas(embed, db, (done, total) => {
            if (live) setWork({ state: 'working', progress: { done, total } })
          })
          // Then the provoker's open loops, which read the same numbers.
          await ensureLoopVectors(embed, db)
          if (live) setWork({ state: 'idle' })
        } catch (error) {
          if (live) setWork({ state: 'problem', message: error instanceof MeaningError ? error.message : MEANING_PROBLEMS.start })
        }
      })()
    }, SETTLE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [on, reading, changes])

  // Turned off, titles lose their areas at once (the query's last answer may still be the areas').
  const known = on ? byEntry : meaning === undefined ? undefined : null
  return (
    <AreasContext.Provider value={{ meaning, byEntry: known, work, photoProblem: reading ? photoProblem : null, aiProblem: reading ? aiProblem : null }}>
      {children}
    </AreasContext.Provider>
  )
}

export const useAreas = (): Areas => useContext(AreasContext)

/** What an entry is called, with free writing named by its areas once they're known. */
export function useEntryTitle(): (entry: Entry) => string {
  const { byEntry } = useAreas()
  return useCallback((entry: Entry) => entryTitle(entry, byEntry?.get(entry.id)), [byEntry])
}
