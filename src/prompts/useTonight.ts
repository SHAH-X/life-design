import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { getSetting, isDone } from '../db/repo'
import { type Answer, OPTIONAL_PURPOSES, type OptionalPurpose, type Purpose } from '../db/types'
import { addDays } from '../lib/dates'
import { PURPOSES } from './bank'
import { findPatterns, PATTERN_WINDOW_DAYS } from './patterns'
import { PATTERN_METHOD, type PickInput, pickTonight, type TonightPrompt } from './pick'

/**
 * The evening question takes turns between Understand myself, your primary purpose and Everyday life (More →
 * Your purpose). Write freely asks no questions of its own.
 */
export function purposesFor(primary: unknown): OptionalPurpose[] {
  return (OPTIONAL_PURPOSES as readonly unknown[]).includes(primary) ? [primary as OptionalPurpose] : []
}

/** Until a primary purpose is chosen, the evening question keeps the rotation it had (Phase 2.5: all four). */
const EARLIER_PURPOSES: readonly OptionalPurpose[] = ['calm', 'grow', 'goal', 'learn']

export interface TonightChoice {
  date: string
  promptId: string
}

export interface Tonight {
  /** The question to show: the one already answered that day, or the day's pick. */
  prompt: TonightPrompt
  /** That day's saved answer, if any. */
  answer: Answer | null
  /** For "Another". */
  input: PickInput
}

function promptOf(answer: Answer): TonightPrompt {
  return {
    id: answer.promptId,
    purpose: answer.purpose,
    question: answer.question,
    method: answer.purpose === 'pattern' ? PATTERN_METHOD : PURPOSES[answer.purpose].method,
  }
}

/** The evening question for a date; undefined while loading. */
export function useTonight(date: string): Tonight | undefined {
  return useLiveQuery(async () => {
    const [primary, earlier, goal, chosen, answers, entries, reviews] = await Promise.all([
      getSetting<Purpose | null>('primaryPurpose', null),
      getSetting<readonly OptionalPurpose[]>('purposes', EARLIER_PURPOSES),
      getSetting<string>('goal', ''),
      getSetting<TonightChoice | null>('tonightPrompt', null),
      db.answers.toArray(),
      // Patterns come from the fortnight before this date, so they hold still all day.
      db.entries.where('date').between(addDays(date, -PATTERN_WINDOW_DAYS), date, true, false).filter(isDone).toArray(),
      db.reviews.toArray(),
    ])
    const answered = answers.filter((a) => a.text.trim()).map((a) => ({ promptId: a.promptId, date: a.date }))
    const answer = answers.filter((a) => a.date === date).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
    const purposes = primary === null ? earlier : purposesFor(primary)
    const input: PickInput = { date, purposes, goal, answered, patterns: findPatterns(date, entries, reviews, answered) }
    const prompt = answer?.text.trim() ? promptOf(answer) : pickTonight(input, chosen?.date === date ? chosen.promptId : null)
    return { prompt, answer, input }
  }, [date])
}
