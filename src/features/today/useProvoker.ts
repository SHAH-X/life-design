import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { openLoops } from '../../db/loops'
import { loadProvokerState } from '../../db/provoker'
import { type Ask, pickAsk, quietAreas } from '../../prompts/provoke'
import { useAreas } from '../areas/AreasProvider'

export interface Provoker {
  /** Today's question, or null. */
  ask: Ask | null
  /** Shown already today (held), so it needn't be marked again. */
  held: boolean
  /** "Not now", "Done already" or answered: nothing more today. */
  resting: boolean
}

/**
 * Today's question from your own writing; undefined while loading. Open loops and quiet areas read search by meaning's
 * numbers, so with it off only next steps not touched lately are asked about.
 */
export function useProvoker(today: string): Provoker | undefined {
  const { meaning, byEntry } = useAreas()
  const ready = meaning !== undefined && (meaning !== 'on' || byEntry !== undefined)
  return useLiveQuery(async (): Promise<Provoker | undefined> => {
    if (!ready) return undefined
    const state = await loadProvokerState()
    if (state.restDay === today) return { ask: null, held: false, resting: true }
    if (state.held?.date === today) return { ask: state.held.ask, held: true, resting: false }
    const on = meaning === 'on'
    const [steps, entries, loops] = await Promise.all([db.steps.toArray(), on ? db.entries.toArray() : [], on ? openLoops(today) : []])
    const quiet = on && byEntry ? quietAreas(today, entries, byEntry) : []
    return { ask: pickAsk({ today, now: Date.now(), loops, steps, quiet, state }), held: false, resting: false }
  }, [today, ready, meaning, byEntry])
}
