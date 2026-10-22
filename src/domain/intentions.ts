// "Anything you'd like to do with this?" (Stage F): an optional next step on an entry. Never forced: journaling
// is also for understanding, accepting, or simply remembering.
import type { Intention, IntentionKind } from '../db/types'

export const NEXT_STEP_QUESTION = "Anything you'd like to do with this?"
export const NEXT_STEP_DETAIL = 'What exactly?'
export const NOTHING_FOR_NOW = 'Nothing for now'

export const INTENTION_OPTIONS: readonly { value: IntentionKind; label: string; placeholder: string }[] = [
  { value: 'differently', label: 'Try something differently', placeholder: 'e.g. Ask for an agenda first' },
  { value: 'again', label: 'Do it again', placeholder: 'e.g. Walk with Sam on Saturday' },
  { value: 'time', label: 'Make time for something important', placeholder: 'e.g. An hour for drawing on Sunday' },
  { value: 'explore', label: 'Explore a question', placeholder: 'e.g. Why do Mondays feel heavy?' },
  { value: 'remember', label: 'Remember this', placeholder: 'e.g. Small steps beat big plans' },
]

export const intentionLabel = (kind: IntentionKind) => INTENTION_OPTIONS.find((o) => o.value === kind)?.label ?? kind

/** A next step to follow up ("Did you?"). "Remember this" is kept, not followed up. */
export const isFollowUp = (intention: Intention) => intention.kind !== 'remember'
