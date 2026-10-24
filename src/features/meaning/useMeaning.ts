import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '../../db/repo'
import { findByMeaning } from '../../db/vectors'
import { embed, MEANING_PROBLEMS, MeaningError, meaningReady } from '../../lib/embedder'

/** Search by meaning on this phone: on, off, or not asked yet (Logs offers it the first time you search; Insights'
 *  life areas, which read its numbers, offer it while it's off). The setting stays on this phone, like its download. */
export type MeaningSearch = 'on' | 'off' | 'unasked'

export function useMeaningSearch(): MeaningSearch | undefined {
  return useLiveQuery(async () => {
    const value = await getSetting<unknown>('meaningSearch', null)
    return value === true ? 'on' : value === false ? 'off' : 'unasked'
  }, [])
}

export const setMeaningSearch = (on: boolean) => setSetting('meaningSearch', on)

/** Typing pauses this long before the model is asked. */
const PAUSE_MS = 400

export type MeaningResults =
  | { state: 'idle' }
  | { state: 'working'; progress: { done: number; total: number } | null }
  | { state: 'done'; ids: string[] }
  | { state: 'problem'; message: string }

/** What a status line says while search by meaning works: the first time it downloads, then catches up. */
export function workingText(result: Extract<MeaningResults, { state: 'working' }>): string {
  if (result.progress) return `Getting search ready: ${result.progress.done} of ${result.progress.total}`
  return meaningReady() ? 'Looking by meaning…' : 'Getting search by meaning ready…'
}

const IDLE: MeaningResults = { state: 'idle' }
const WORKING: MeaningResults = { state: 'working', progress: null }

/**
 * The entries among `among` that stand out as closest in meaning to `query` (at most `max`), once typing pauses.
 * A result is only ever given for the question it answers: just after a change it's "working", never the last
 * question's entries (which could otherwise be copied or sent in that moment).
 */
export function useMeaningResults(
  query: string,
  { enabled, among, max, pick = 'standOut' }: { enabled: boolean; among: readonly string[]; max: number; pick?: 'standOut' | 'closest' },
): MeaningResults {
  const question = query.trim()
  const amongKey = among.join('|')
  const key = `${pick}\n${max}\n${question}\n${amongKey}`
  const active = enabled && question !== ''
  const [latest, setLatest] = useState<{ key: string; result: MeaningResults }>({ key: '', result: IDLE })
  useEffect(() => {
    if (!active) return
    let live = true
    const settle = (result: MeaningResults) => {
      if (live) setLatest({ key, result })
    }
    const timer = setTimeout(() => {
      findByMeaning(question, embed, {
        among: amongKey ? amongKey.split('|') : [],
        max,
        pick,
        onProgress: (done, total) => settle({ state: 'working', progress: { done, total } }),
      })
        .then((ids) => settle({ state: 'done', ids }))
        .catch((error: unknown) => settle({ state: 'problem', message: error instanceof MeaningError ? error.message : MEANING_PROBLEMS.start }))
    }, PAUSE_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [active, key, question, amongKey, max, pick])
  if (!active) return IDLE
  return latest.key === key ? latest.result : WORKING
}
