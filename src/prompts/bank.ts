// The evening questions. Each purpose draws on a practice with research behind it; "{goal}" is replaced
// by the goal set in More → Evening question. Keep them short, plain, and ending in a question mark.
import type { Purpose } from '../db/types'

export interface BankPrompt {
  id: string
  purpose: Purpose
  text: string
}

export const PURPOSES: Record<Purpose, { label: string; method: string }> = {
  know: {
    label: 'Know myself',
    method: 'Designing Your Life: noticing what energises and engages you is how you find what fits.',
  },
  calm: {
    label: 'Feel calmer',
    method: 'Putting a feeling into words eases it, and writing out what weighs on you helps most on hard days.',
  },
  grow: {
    label: 'Grow',
    method: 'After Action Review: what you expected, what happened, why, and what you will do next.',
  },
  goal: {
    label: 'Reach a goal',
    method: 'Progress Principle: small steps on something that matters lift motivation. If-then plans help you follow through.',
  },
  learn: {
    label: 'Learn',
    method: 'What? So what? Now what?: what happened, why it matters, and what you will do with it.',
  },
  free: {
    label: 'Write freely',
    method: 'No questions: a blank page for whatever is on your mind.',
  },
  joy: {
    label: 'Joy',
    method: 'Three Good Things: noting what went well, and your part in it, lifts mood over the weeks.',
  },
}

export const BANK: readonly BankPrompt[] = [
  { id: 'know-1', purpose: 'know', text: 'When did you feel most like yourself today?' },
  { id: 'know-2', purpose: 'know', text: 'What surprised you about yourself today?' },
  { id: 'know-3', purpose: 'know', text: 'What did you want more of today, and what less of?' },
  { id: 'know-4', purpose: 'know', text: 'If you could repeat one part of today, which would it be?' },
  { id: 'know-5', purpose: 'know', text: 'What mattered most to you today, and why?' },

  { id: 'calm-1', purpose: 'calm', text: "What's on your mind tonight, and what would you call the feeling?" },
  { id: 'calm-2', purpose: 'calm', text: 'What felt heavy today?' },
  { id: 'calm-3', purpose: 'calm', text: "What's one thing in your control, and one that isn't?" },
  { id: 'calm-4', purpose: 'calm', text: 'What would you say to a friend who had your day?' },
  { id: 'calm-5', purpose: 'calm', text: 'What helped today, even a little?' },

  { id: 'grow-1', purpose: 'grow', text: 'What went as you hoped today, and why?' },
  { id: 'grow-2', purpose: 'grow', text: "What didn't go as planned, and what would you change?" },
  { id: 'grow-3', purpose: 'grow', text: "What's one thing you'd do differently tomorrow?" },
  { id: 'grow-4', purpose: 'grow', text: 'Where did you handle something better than before?' },
  { id: 'grow-5', purpose: 'grow', text: 'What feedback did you get today, and what do you make of it?' },

  { id: 'goal-1', purpose: 'goal', text: 'What moved you closer to {goal} today, even a little?' },
  { id: 'goal-2', purpose: 'goal', text: 'What got in the way of {goal} today?' },
  { id: 'goal-3', purpose: 'goal', text: 'If something gets in the way of {goal} tomorrow, what will you do?' },
  { id: 'goal-4', purpose: 'goal', text: "What's the next small step toward {goal}?" },
  { id: 'goal-5', purpose: 'goal', text: 'What small win toward {goal} can you note today?' },

  { id: 'learn-1', purpose: 'learn', text: 'What did you learn today, and how will you use it?' },
  { id: 'learn-2', purpose: 'learn', text: 'What idea stuck with you today, and why does it matter?' },
  { id: 'learn-3', purpose: 'learn', text: 'What confused or challenged you today, and what will you try next?' },
  { id: 'learn-4', purpose: 'learn', text: "What did you notice today that you hadn't before?" },
  { id: 'learn-5', purpose: 'learn', text: 'What did someone teach you today?' },

  { id: 'joy-1', purpose: 'joy', text: 'What went well today, and what was your part in it?' },
  { id: 'joy-2', purpose: 'joy', text: 'Who or what are you grateful for today?' },
  { id: 'joy-3', purpose: 'joy', text: 'What made you smile today?' },
  { id: 'joy-4', purpose: 'joy', text: 'What are you looking forward to?' },
  { id: 'joy-5', purpose: 'joy', text: 'What did you enjoy today that you might usually rush past?' },
]

export function promptsFor(purpose: Purpose): BankPrompt[] {
  return BANK.filter((p) => p.purpose === purpose)
}
