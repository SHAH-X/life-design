import { howOften, times } from '../domain/feelings'
import type { GroupStat } from './stats'

/** What a group of entries says, in words: how often it went that way, and how many times it was logged. */
export function energyWords(row: GroupStat, direction: 'gives' | 'takes' | 'context'): string {
  const gave = row.gave / row.count
  const took = row.took / row.count
  if (direction === 'gives') return `${howOften(gave)} · ${times(row.count)}`
  if (direction === 'takes') return `${howOften(took)} · ${times(row.count)}`
  if (gave >= 0.4 && row.gave >= row.took) return `${howOften(gave)} gives energy · ${times(row.count)}`
  if (took >= 0.4) return `${howOften(took)} takes energy · ${times(row.count)}`
  return `mixed · ${times(row.count)}`
}
