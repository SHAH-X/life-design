// After an entry (Stage E): what happened, what you noticed, and a possible insight. No AI and no guessing: it
// only repeats what the entry says, and an insight needs evidence from 3+ entries, each one listed. Your own take
// always wins.
import type { EnergyEffect, Entry } from '../db/types'
import { spotFeelings } from './feelings'

export interface EntrySummary {
  /** In your words: what you did (or free writing's first line), and the first sentence you wrote. */
  happened: { title: string; quote: string | null }
  /** Only what the entry says: the energy answer, the words you tapped, and feelings found in your writing. */
  noticed: string[]
  /** An observation and a question, with the entries behind it; null without enough evidence. */
  insight: { text: string; question: string; entryIds: string[] } | null
}

/** Entries needed before the app says anything about a pattern. */
export const INSIGHT_MIN_ENTRIES = 3
/** The share that counts as "mostly one way". */
const MOSTLY = 0.6

const ENERGY_NOTICED: Record<EnergyEffect, string> = {
  gave: 'It gave you energy',
  used: 'It used up your energy',
  little: 'It made little difference to your energy',
  mixed: 'It was a mix of both',
}

function firstSentence(text: string): string | null {
  const tidy = text.trim().replace(/\s+/g, ' ')
  if (!tidy) return null
  return (tidy.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? tidy).trim()
}

const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function joinAnd(words: readonly string[]): string {
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

export function summarize(entry: Entry, all: readonly Entry[]): EntrySummary {
  const free = entry.kind === 'free'
  const lines = entry.note.split('\n')
  const written = free ? lines.slice(1).join(' ') : entry.note
  const happened = {
    title: free ? lines[0]?.trim() || 'Free writing' : entry.activity,
    quote: firstSentence(written) ?? firstSentence(entry.reflections.find((r) => r.text.trim())?.text ?? ''),
  }

  const noticed: string[] = []
  if (entry.energyEffect) noticed.push(ENERGY_NOTICED[entry.energyEffect])
  if (entry.after.length) noticed.push(`You felt ${joinAnd(entry.after.map((w) => w.toLowerCase()))}`)
  if (entry.during.length) noticed.push(`While doing it: ${entry.during.map((w) => w.toLowerCase()).join(' · ')}`)
  const text = [entry.note, ...entry.reflections.map((r) => r.text)].join('\n')
  const spotted = spotFeelings(text, { during: entry.during, after: entry.after })
  const found = [...spotted.during, ...spotted.after].map((w) => w.toLowerCase())
  if (found.length) noticed.push(`In your words: ${found.join(', ')}`)

  return { happened, noticed, insight: free ? null : insightFor(entry, all) }
}

/** "X has used up your energy in 4 of your 5 entries about it": finished entries for the same activity, energy answered. */
function insightFor(entry: Entry, all: readonly Entry[]): EntrySummary['insight'] {
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
    return { text: `${name} has used up your energy in ${used} of your ${same.length} entries about it.`, question: 'What would make it easier?', entryIds }
  }
  if (gave / same.length >= MOSTLY) {
    return { text: `${name} has given you energy in ${gave} of your ${same.length} entries about it.`, question: 'What makes it work so well?', entryIds }
  }
  return null
}
