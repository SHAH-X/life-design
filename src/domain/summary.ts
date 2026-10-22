// After an entry (Stage E): a possible insight, shown with the entry read back. No AI and no guessing: it needs
// evidence from 3+ entries, each one listed, and your own take always wins. What happened and what you noticed are
// the entry itself: your words and what you tapped (v0.9: shown as they are, not repeated in a summary).
import type { Entry } from '../db/types'

/** An observation and a question, with the entries behind it, and which way it goes (for the thin coloured edge). */
export interface PossibleInsight {
  text: string
  question: string
  entryIds: string[]
  direction: 'gives' | 'takes'
}

/** Entries needed before the app says anything about a pattern. */
export const INSIGHT_MIN_ENTRIES = 3
/** The share that counts as "mostly one way". */
const MOSTLY = 0.6

const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "X has used up your energy in 4 of your 5 entries about it": finished entries for the same activity, energy answered. */
export function possibleInsight(entry: Entry, all: readonly Entry[]): PossibleInsight | null {
  if (entry.kind === 'free') return null
  const key = entry.activity.trim().toLowerCase()
  if (!key) return null
  const same = all.filter(
    (e) => e.status !== 'draft' && e.kind !== 'free' && e.activity.trim().toLowerCase() === key && !e.skipped.includes('energy'),
  )
  if (same.length < INSIGHT_MIN_ENTRIES) return null
  const name = sentenceStart(entry.activity.trim())
  const used = same.filter((e) => e.energy < 0).length
  const gave = same.filter((e) => e.energy > 0).length
  const entryIds = same.map((e) => e.id)
  if (used / same.length >= MOSTLY) {
    return {
      text: `${name} has used up your energy in ${used} of your ${same.length} entries about it.`,
      question: 'What would make it easier?',
      entryIds,
      direction: 'takes',
    }
  }
  if (gave / same.length >= MOSTLY) {
    return {
      text: `${name} has given you energy in ${gave} of your ${same.length} entries about it.`,
      question: 'What makes it work so well?',
      entryIds,
      direction: 'gives',
    }
  }
  return null
}
