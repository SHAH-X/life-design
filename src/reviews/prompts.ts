// Wording for the review, following Designing Your Life (Burnett & Evans).
import type { AeiouNote, BalanceArea } from '../db/types'

export const BALANCE_INFO: Record<BalanceArea, { label: string; info: string }> = {
  health: { label: 'Health', info: 'Your physical, mental and emotional wellbeing: body, mind and feelings.' },
  work: { label: 'Work', info: 'Your contribution: paid or unpaid work, study, volunteering, caring for others.' },
  play: { label: 'Play', info: 'Things you do just for the joy of it, not to win or achieve anything.' },
  love: { label: 'Love', info: 'Connection: family, friends, a partner, community. The love you give and receive.' },
}

export type AeiouField = Exclude<keyof AeiouNote, 'entryId' | 'why'>

export const AEIOU: readonly { field: AeiouField; letter: string; label: string; prompt: string }[] = [
  { field: 'activities', letter: 'A', label: 'Activities', prompt: 'What exactly were you doing? Leading, or part of a team?' },
  { field: 'environments', letter: 'E', label: 'Environment', prompt: 'Where were you, and how did the place feel?' },
  { field: 'interactions', letter: 'I', label: 'Interactions', prompt: 'Who or what were you dealing with? New or familiar?' },
  { field: 'objects', letter: 'O', label: 'Objects', prompt: 'Any objects or devices that made it better or worse?' },
  { field: 'users', letter: 'U', label: 'Users', prompt: 'Who else was there? Did they add to it or take away?' },
]

/** One question per moment first; AEIOU is there to zoom in further. */
export const MOMENT_QUESTIONS = {
  best: { pick: 'Which moment gave you the most energy?', why: 'What made it so good?' },
  worst: { pick: 'Which moment took the most energy?', why: 'What made it so draining?' },
} as const

/** Placeholder for the reflection box. */
export const REFLECTION_PROMPT = 'Patterns, surprises, what you want more or less of…'
