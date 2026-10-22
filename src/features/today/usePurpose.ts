import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from '../../db/repo'
import type { Purpose } from '../../db/types'
import { PURPOSE_KEYS } from '../../domain/purposes'

export interface PurposeSettings {
  /** What journaling is mostly for; each entry can choose another. */
  primary: Purpose
  /** "What are you working towards?" (kept under its own key since Phase 2.5). */
  goal: string
  /** The other purposes' follow-up answers. */
  focus: Partial<Record<Purpose, string>>
}

export const DEFAULT_PURPOSE: Purpose = 'know'

/** Your purpose settings; undefined while loading. A backup could hold anything, so the purpose is checked. */
export function usePurposeSettings(): PurposeSettings | undefined {
  return useLiveQuery(async () => {
    const [primary, goal, focus] = await Promise.all([
      getSetting<unknown>('primaryPurpose', DEFAULT_PURPOSE),
      getSetting<unknown>('goal', ''),
      getSetting<unknown>('purposeFocus', {}),
    ])
    return {
      primary: PURPOSE_KEYS.includes(primary as Purpose) ? (primary as Purpose) : DEFAULT_PURPOSE,
      goal: typeof goal === 'string' ? goal : '',
      focus: typeof focus === 'object' && focus !== null ? (focus as Partial<Record<Purpose, string>>) : {},
    }
  }, [])
}
