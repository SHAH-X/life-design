// What journaling is for (Stage A) and the reflection questions each purpose asks (Stage C). Plain words, a
// few questions at a time, and gentle with hard times: nothing pushes for a lesson (Pennebaker; "What? So what?
// Now what?" for the rest).
import type { EnergyEffect, Purpose } from '../db/types'
import { midSentence } from '../prompts/patterns'
import { HARD_FEELINGS } from './feelings'

export const PURPOSE_KEYS: readonly Purpose[] = ['know', 'grow', 'learn', 'goal', 'calm', 'joy', 'free']

export interface EntryQuestion {
  id: string
  text: string
  /** 'hard': comes first when it used up your energy or felt hard. 'flow': only asked when time flew. */
  when?: 'hard' | 'flow'
}

interface PurposeInfo {
  label: string
  hint: string
  /** The optional follow-up when you choose it: what you'd like it to help with. */
  focus: { question: string; placeholder: string } | null
  /** A line shown with the questions, for a hard time. */
  gentle: string | null
  questions: readonly EntryQuestion[]
}

const INFO: Record<Purpose, PurposeInfo> = {
  know: {
    label: 'Understand myself',
    hint: 'Notice what you enjoy, value and need.',
    focus: { question: 'What would you most like to understand about yourself?', placeholder: 'e.g. What kind of work suits me' },
    gentle: null,
    questions: [
      { id: 'know-a', text: 'What stood out to you about it?' },
      { id: 'know-b', text: 'How did you feel, and what might have influenced that?', when: 'hard' },
      { id: 'know-c', text: 'What did it show you about what you like, value or need?' },
      { id: 'know-d', text: 'Have you noticed something like this before?' },
      { id: 'know-e', text: 'What made it so absorbing?', when: 'flow' },
    ],
  },
  grow: {
    label: 'Improve myself',
    hint: 'Learn from what happens and try things differently.',
    focus: { question: 'What would you like to change or improve?', placeholder: 'e.g. Staying calm in meetings' },
    gentle: null,
    questions: [
      { id: 'grow-a', text: 'What went well?' },
      { id: 'grow-b', text: 'What could you have handled differently?' },
      { id: 'grow-c', text: 'What made it easier or harder?', when: 'hard' },
      { id: 'grow-d', text: 'What would you like to try next time?' },
    ],
  },
  learn: {
    label: 'Learn something',
    hint: "Make sense of what you're learning, and use it.",
    focus: { question: 'What are you learning, and what would you like to understand better?', placeholder: 'e.g. Spanish, or data analysis' },
    gentle: null,
    questions: [
      { id: 'learn-a', text: 'What did you learn or understand?' },
      { id: 'learn-b', text: 'What confused or challenged you?', when: 'hard' },
      { id: 'learn-c', text: 'What helped you understand it?' },
      { id: 'learn-d', text: 'How could you use what you learned?' },
    ],
  },
  goal: {
    label: 'Achieve a goal',
    hint: 'See your progress and the next useful step.',
    focus: { question: 'What are you working towards?', placeholder: 'e.g. Run a half marathon' },
    gentle: null,
    questions: [
      { id: 'goal-a', text: 'What progress did you make{ toward goal}?' },
      { id: 'goal-b', text: 'What helped, or got in the way?', when: 'hard' },
      { id: 'goal-c', text: "What's the main obstacle right now?" },
      { id: 'goal-d', text: "What's the next useful step?" },
    ],
  },
  calm: {
    label: 'Make sense of a hard time',
    hint: 'Write through something difficult, at your own pace.',
    focus: null,
    gentle: "Write only what feels okay. There doesn't have to be a lesson.",
    questions: [
      { id: 'calm-a', text: 'What happened, from your point of view?' },
      { id: 'calm-b', text: 'What thoughts or feelings did you notice?' },
      { id: 'calm-c', text: "What was within your control, and what wasn't?" },
      { id: 'calm-d', text: 'What might help you respond differently, or move forward?' },
    ],
  },
  joy: {
    label: 'Reflect on everyday life',
    hint: 'Notice what made the day meaningful.',
    focus: null,
    gentle: null,
    questions: [
      { id: 'joy-a', text: 'What was meaningful, interesting or unusual?' },
      { id: 'joy-b', text: 'What would you like to remember?' },
      { id: 'joy-c', text: 'What did you appreciate, or find hard?', when: 'hard' },
      { id: 'joy-d', text: "Is there anything you'd like to explore further?" },
    ],
  },
  free: {
    label: 'Write freely',
    hint: 'No questions: a blank page for whatever is on your mind.',
    focus: null,
    gentle: null,
    questions: [],
  },
}

export const purposeInfo = (purpose: Purpose) => INFO[purpose]

/** What choosing a purpose changes (More → Your purpose, behind ⓘ). */
export const PURPOSE_EFFECT =
  'It picks the questions shown above the box when you write about an activity, and the evening question on Today. Your answer to its follow-up shows with those questions. Each entry can still use another purpose.'

/** What the entry said so far, so the questions can fit it. `turn` moves the starting question from entry to entry. */
export interface QuestionContext {
  energyEffect: EnergyEffect | null
  during: readonly string[]
  after: readonly string[]
  /** e.g. how many entries you've already written for this purpose. */
  turn: number
  goal: string
}

const isOneOf = (words: readonly string[], list: readonly string[]) => words.some((w) => list.some((l) => l.toLowerCase() === w.toLowerCase()))

/**
 * The questions for one entry, best first: helpers shown above the one writing box (v0.9), a few at a time. They
 * take turns between entries; a hard moment brings "what made it harder" forward, and "what made it so absorbing"
 * only comes up when time flew.
 */
export function questionsFor(purpose: Purpose, context: QuestionContext): EntryQuestion[] {
  const flow = isOneOf(context.during, ['Time flew'])
  const hard = context.energyEffect === 'used' || isOneOf(context.after, HARD_FEELINGS)
  const bank = INFO[purpose].questions.filter((q) => q.when !== 'flow' || flow)
  if (bank.length === 0) return []
  const start = context.turn % bank.length
  const inTurn = bank.map((_, i) => bank[(start + i) % bank.length] as EntryQuestion)
  const first = inTurn.filter((q) => (q.when === 'flow' && flow) || (q.when === 'hard' && hard))
  const goal = context.goal.trim()
  return [...first, ...inTurn.filter((q) => !first.includes(q))].map((q) => ({
    ...q,
    text: q.text.replace('{ toward goal}', goal ? ` toward ${midSentence(goal)}` : ''),
  }))
}

/** How many helper questions show at once above the writing box. */
export const HELPERS_SHOWN = 3

/** The helpers on screen: three at a time from the best-first list; each page moves on by three, wrapping round. */
export function helpersPage(candidates: readonly EntryQuestion[], page: number): EntryQuestion[] {
  if (candidates.length <= HELPERS_SHOWN) return [...candidates]
  const start = (page * HELPERS_SHOWN) % candidates.length
  return Array.from({ length: HELPERS_SHOWN }, (_, i) => candidates[(start + i) % candidates.length] as EntryQuestion)
}

/**
 * Your own focus for a purpose (More → Your purpose), shown with its helper questions. Not for a goal: its
 * questions already name it.
 */
export function focusFor(purpose: Purpose, focus: Partial<Record<Purpose, string>>): string {
  if (purpose === 'goal' || !purposeInfo(purpose).focus) return ''
  return focus[purpose]?.trim() ?? ''
}
