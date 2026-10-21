// Questions drawn from your own last two weeks, worked out on the phone (no AI). They only ask about
// real patterns (groups of 3+ entries, see MIN_COUNT), never about today, which is still in progress.
import { balanceSummary, drainers, energisers, flowFinder, inPeriod } from '../analysis/stats'
import type { Entry, Review } from '../db/types'
import { addDays } from '../lib/dates'
import { BALANCE_INFO } from '../reviews/prompts'

export const PATTERN_WINDOW_DAYS = 14

export type PatternKind = 'drain' | 'energy' | 'flow' | 'balance'

export interface PatternPrompt {
  id: string
  kind: PatternKind
  question: string
}

/** An earlier answer: which question it answered, and when. */
export interface AnsweredRef {
  promptId: string
  date: string
}

const keyOf = (label: string) => label.trim().toLowerCase()

const sentenceStart = (label: string) => label.charAt(0).toUpperCase() + label.slice(1)

/** "Deep work" reads "deep work" mid-sentence; "AI course" stays as it is. */
export const midSentence = (label: string) => (/^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label)

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

export function findPatterns(
  today: string,
  entries: readonly Entry[],
  reviews: readonly Review[],
  answered: readonly AnsweredRef[],
): PatternPrompt[] {
  const fortnight = { start: addDays(today, -PATTERN_WINDOW_DAYS), end: addDays(today, -1) }
  const recent = inPeriod(entries, fortnight)
  const askedLately = new Set(answered.filter((a) => a.date >= fortnight.start && a.date < today).map((a) => a.promptId))
  const found: PatternPrompt[] = []
  const offer = (prompt: PatternPrompt) => {
    if (!askedLately.has(prompt.id)) found.push(prompt)
  }

  const drain = drainers(recent, 1)[0]
  if (drain) {
    const drained = recent.filter((e) => keyOf(e.activity) === keyOf(drain.label) && e.energy < 0).length
    offer({
      id: `pattern:drain:${keyOf(drain.label)}`,
      kind: 'drain',
      question: `${sentenceStart(drain.label)} took your energy ${times(drained)} lately. What about it drains you?`,
    })
  }

  const lift = energisers(recent, 1)[0]
  if (lift) {
    offer({
      id: `pattern:energy:${keyOf(lift.label)}`,
      kind: 'energy',
      question: `${sentenceStart(lift.label)} keeps giving you energy. What is it about it?`,
    })
  }

  const flow = flowFinder(recent, 1)[0]
  if (flow && flow.flow >= 2) {
    offer({
      id: `pattern:flow:${keyOf(flow.label)}`,
      kind: 'flow',
      question: `Time flew during ${midSentence(flow.label)} ${times(flow.flow)} lately. What made that possible?`,
    })
  }

  const low = balanceSummary(reviews).lowest
  if (low && low.avg <= 4) {
    offer({
      id: `pattern:balance:${low.area}`,
      kind: 'balance',
      question: `${BALANCE_INFO[low.area].label} has been low in your reviews. What's one small thing that would help?`,
    })
  }

  return found
}
