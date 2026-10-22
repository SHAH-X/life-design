// The Ikigai map: what you love, what you're good at, what the world needs, and what you could be paid for.
// Everything is in words. Each item sits in one group, and nothing is counted or scored (v1 ranked items "x/4").
import { activityStats, energisers, MIN_COUNT } from '../analysis/stats'
import { energyWords } from '../analysis/words'
import type { Entry, IkigaiItem } from '../db/types'
import { midSentence } from '../prompts/patterns'
import { times } from './feelings'

export type Circle = 'love' | 'goodAt' | 'worldNeeds' | 'paidFor'

/** The four circles in the classic order: the statement you tap, how a line says it, and the question a gap asks. */
export const CIRCLES: readonly { key: Circle; statement: string; you: string; notYet: string; ask: (thing: string) => string }[] = [
  { key: 'love', statement: 'I love it', you: 'you love it', notYet: 'love it', ask: (t) => `Would I enjoy ${t}?` },
  { key: 'goodAt', statement: "I'm good at it", you: "you're good at it", notYet: 'good at it', ask: (t) => `Could I get good at ${t}?` },
  { key: 'worldNeeds', statement: 'The world needs it', you: 'the world needs it', notYet: 'the world needs it', ask: (t) => `Who would value ${t}?` },
  { key: 'paidFor', statement: 'I could be paid for it', you: 'you could be paid for it', notYet: 'could be paid for it', ask: (t) => `Could I be paid for ${t}?` },
]

export const IKIGAI_INTRO = "Where what you love, what you're good at, what the world needs and what pays meet."

export type IkigaiGroupKey = 'ikigai' | 'close' | 'passion' | 'mission' | 'profession' | 'vocation' | 'forming'

export const IKIGAI_GROUPS: readonly { key: IkigaiGroupKey; title: string }[] = [
  { key: 'ikigai', title: 'Ikigai candidates' },
  { key: 'close', title: 'Close to Ikigai' },
  { key: 'passion', title: "Passion: you love it and you're good at it" },
  { key: 'mission', title: 'Mission: you love it and the world needs it' },
  { key: 'profession', title: "Profession: you're good at it and could be paid for it" },
  { key: 'vocation', title: 'Vocation: the world needs it and you could be paid for it' },
  { key: 'forming', title: 'Still taking shape' },
]

/** The named pairs of the Western Ikigai diagram; the other two pairs have no name. */
const PAIRS: Partial<Record<string, IkigaiGroupKey>> = {
  'love+goodAt': 'passion',
  'love+worldNeeds': 'mission',
  'goodAt+paidFor': 'profession',
  'worldNeeds+paidFor': 'vocation',
}

type Circles = Pick<IkigaiItem, Circle>

const circlesOf = (item: Circles) => CIRCLES.filter((c) => item[c.key])
const sentenceStart = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function ikigaiGroup(item: Circles): IkigaiGroupKey {
  const on = circlesOf(item).map((c) => c.key)
  if (on.length === 4) return 'ikigai'
  if (on.length === 3) return 'close'
  if (on.length === 2) return PAIRS[on.join('+')] ?? 'forming'
  return 'forming'
}

/** The words under an item: what's missing when it's close, what's true while it's taking shape, else nothing. */
export function ikigaiLine(item: Circles): string | null {
  const group = ikigaiGroup(item)
  if (group === 'close') return `Not yet: ${CIRCLES.find((c) => !item[c.key])?.notYet ?? ''}`
  if (group !== 'forming') return null
  const on = circlesOf(item)
  return on.length ? sentenceStart(on.map((c) => c.you).join(' · ')) : 'Nothing tapped yet'
}

/** For an item close to Ikigai, its missing circle as a question a prototype could answer. */
export function gapQuestion(item: Circles & Pick<IkigaiItem, 'text'>): string | null {
  if (ikigaiGroup(item) !== 'close') return null
  const missing = CIRCLES.find((c) => !item[c.key])
  return missing ? missing.ask(midSentence(item.text.trim())) : null
}

/** Evidence from your days, one line per linked activity that has been logged. Under 3 times it's too soon for "usually". */
export function ikigaiEvidence(item: IkigaiItem, entries: readonly Entry[]): string[] {
  const stats = new Map(activityStats(entries).map((row) => [row.label.trim().toLowerCase(), row]))
  return item.linkedActivities.flatMap((name) => {
    const row = stats.get(name.trim().toLowerCase())
    if (!row) return []
    const how = row.count >= MIN_COUNT ? energyWords(row, 'context') : `logged ${times(row.count)}`
    const flew = row.flow ? ` · time flew ${times(row.flow)}` : ''
    return [`${row.label}: ${how}${flew}`]
  })
}

export const SUGGESTIONS_MAX = 3

/** "Your days suggest": activities that keep giving energy and aren't on the map yet, by name or by link. */
export function ikigaiSuggestions(entries: readonly Entry[], items: readonly IkigaiItem[]): string[] {
  const onMap = new Set(items.flatMap((item) => [item.text, ...item.linkedActivities]).map((t) => t.trim().toLowerCase()))
  return energisers(entries, Number.POSITIVE_INFINITY)
    .map((row) => row.label)
    .filter((label) => !onMap.has(label.trim().toLowerCase()))
    .slice(0, SUGGESTIONS_MAX)
}
