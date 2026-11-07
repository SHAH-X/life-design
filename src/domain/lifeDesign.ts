// Designing Your Life's "imagine" tools: three Odyssey Plans (five-year lives) and the Workview and
// Lifeview behind them. As everywhere in this app, nothing is rated: the plan "dashboard" (resources,
// likeability, confidence, coherence) is asked as plain questions answered in words.
import type { Need, OdysseyPlan } from '../db/types'
import { DAY_MS } from '../lib/dates'
import type { FeelingWord } from './feelings'

export const PLAN_SLOTS = [
  {
    slot: 1,
    label: 'Your current path',
    about: 'Your life as it’s heading now…',
  },
  {
    slot: 2,
    label: 'If that path vanished',
    about: 'If your current path disappeared tomorrow…',
  },
  {
    slot: 3,
    label: "If money and image didn't matter",
    about: 'If money and what people think didn’t matter…',
  },
] as const

export type PlanSlot = 1 | 2 | 3

export const PLAN_STEPS = [
  "What's this life about?",
  'Year by year',
  'A six-word title',
  'What would living it help you find out?',
  'How do you feel about this future?',
  'What would it take?',
  'Does it fit your Workview and Lifeview?',
] as const

export const PLAN_QUESTION = 'How do you feel about this future?'

/** "How do you feel about this future?": covers Designing Your Life's likeability and confidence, in words. */
export const PLAN_WORDS: readonly FeelingWord[] = (
  ['Excited', 'Curious', 'Hopeful', 'Confident', 'Calm', 'Unsure', 'Anxious', 'Scared', 'Trapped', 'Bored'] as const
).map((word) => ({ word, kind: 'plan', weight: 0, phrases: [] }))

/** "What would it take?": what's missing, from Designing Your Life's resources gauge (time, money, skills, contacts). */
export const NEEDS: readonly { value: Need; label: string }[] = [
  { value: 'time', label: 'Time' },
  { value: 'money', label: 'Money' },
  { value: 'skills', label: 'Skills' },
  { value: 'people', label: 'People' },
]

/** A change made this long after the last one keeps the earlier version (plans, Workview and Lifeview). */
export const VERSION_AFTER_DAYS = 7

export function keepsVersion(lastChange: number, now: number): boolean {
  return now - lastChange >= VERSION_AFTER_DAYS * DAY_MS
}

export function emptyPlan(slot: PlanSlot, now: number): OdysseyPlan {
  return {
    id: `plan-${slot}`,
    slot,
    title: '',
    description: '',
    years: [[], [], [], [], []],
    questions: [],
    feelings: [],
    needs: [],
    needsNote: '',
    fit: '',
    notes: '',
    writtenAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** Where a half-written plan picks up: the first guided screen not yet answered. */
export function resumeStep(plan: OdysseyPlan): number {
  const answered = [
    plan.description.trim() !== '',
    plan.years.some((year) => year.length > 0),
    plan.title.trim() !== '',
    plan.questions.some((q) => q.trim() !== ''),
    plan.feelings.length > 0,
    plan.needs.length > 0 || plan.needsNote.trim() !== '',
    plan.fit.trim() !== '',
  ]
  const first = answered.indexOf(false)
  return first === -1 ? PLAN_STEPS.length - 1 : first
}
