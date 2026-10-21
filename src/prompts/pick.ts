// Which evening question to ask. A pure function of the date and your history, so the question stays the
// same all day, the purposes take turns, and each purpose's questions come round before any repeats.
import { OPTIONAL_PURPOSES, type OptionalPurpose, type Purpose } from '../db/types'
import { addDays, dayNumber } from '../lib/dates'
import { type BankPrompt, PURPOSES, promptsFor } from './bank'
import { type AnsweredRef, midSentence, type PatternPrompt } from './patterns'

export interface PickInput {
  date: string
  purposes: readonly OptionalPurpose[]
  goal: string
  /** Earlier answers with text. Today's are ignored, so answering doesn't move the question. */
  answered: readonly AnsweredRef[]
  /** From findPatterns; offered first on every third evening. */
  patterns: readonly PatternPrompt[]
}

export interface TonightPrompt {
  id: string
  purpose: Purpose | 'pattern'
  question: string
  /** Shown behind ⓘ: where the question comes from. */
  method: string
}

const REPEAT_AFTER_DAYS = 30

export const PATTERN_METHOD = 'A pattern from your last two weeks, worked out on this phone.'

/** Know myself, then each chosen purpose (goal only once a goal is set), then joy. */
export function purposeCycle(purposes: readonly OptionalPurpose[], goal: string): Purpose[] {
  const chosen = OPTIONAL_PURPOSES.filter((p) => purposes.includes(p) && (p !== 'goal' || goal.trim() !== ''))
  return ['know', ...chosen, 'joy']
}

function fromBank(prompt: BankPrompt, goal: string): TonightPrompt {
  return {
    id: prompt.id,
    purpose: prompt.purpose,
    question: prompt.text.replace('{goal}', midSentence(goal.trim())),
    method: PURPOSES[prompt.purpose].method,
  }
}

/** Tonight's question first, then the ones "Another" moves through. */
export function tonightCandidates(input: PickInput): TonightPrompt[] {
  const day = dayNumber(input.date)
  const cycle = purposeCycle(input.purposes, input.goal)
  const round = Math.floor(day / cycle.length)
  const since = addDays(input.date, -REPEAT_AFTER_DAYS)
  const recent = new Set(input.answered.filter((a) => a.date >= since && a.date < input.date).map((a) => a.promptId))

  const fromPurposes = cycle.map((_, i) => {
    const purpose = cycle[(day + i) % cycle.length] as Purpose
    const bank = promptsFor(purpose)
    const inTurn = bank.map((_, j) => bank[(round + j) % bank.length] as BankPrompt)
    return fromBank(inTurn.find((p) => !recent.has(p.id)) ?? (inTurn[0] as BankPrompt), input.goal)
  })

  if (day % 3 !== 0 || input.patterns.length === 0) return fromPurposes
  const start = Math.floor(day / 3) % input.patterns.length
  const patterns = input.patterns.map((_, i) => input.patterns[(start + i) % input.patterns.length] as PatternPrompt)
  return [
    ...patterns.map((p): TonightPrompt => ({ id: p.id, purpose: 'pattern', question: p.question, method: PATTERN_METHOD })),
    ...fromPurposes,
  ]
}

/** Tonight's question, or the one chosen with "Another" earlier today if it's still on offer. */
export function pickTonight(input: PickInput, chosenId: string | null): TonightPrompt {
  const candidates = tonightCandidates(input)
  return candidates.find((c) => c.id === chosenId) ?? (candidates[0] as TonightPrompt)
}

export function nextTonight(input: PickInput, currentId: string): TonightPrompt {
  const candidates = tonightCandidates(input)
  const i = candidates.findIndex((c) => c.id === currentId)
  return candidates[(i + 1) % candidates.length] as TonightPrompt
}
