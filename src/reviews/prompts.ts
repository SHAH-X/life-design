// Wording for the review, following Designing Your Life (Burnett & Evans).
import type { AeiouNote, BalanceArea } from '../db/types'

export const BALANCE_INFO: Record<BalanceArea, { label: string; info: string }> = {
  health: { label: 'Health', info: 'Your physical, mental and emotional wellbeing: body, mind and feelings.' },
  work: { label: 'Work', info: 'Your contribution: paid or unpaid work, study, volunteering, caring for others.' },
  play: { label: 'Play', info: 'Things you do just for the joy of it, not to win or achieve anything.' },
  love: { label: 'Love', info: 'Connection: family, friends, a partner, community. The love you give and receive.' },
}

export type AeiouField = Exclude<keyof AeiouNote, 'entryId'>

export const AEIOU: readonly { field: AeiouField; letter: string; label: string; prompt: string }[] = [
  {
    field: 'activities',
    letter: 'A',
    label: 'Activities',
    prompt: 'What exactly were you doing? Was it structured or loose? Were you leading, or part of a team?',
  },
  { field: 'environments', letter: 'E', label: 'Environment', prompt: 'Where were you, and how did the place make you feel?' },
  {
    field: 'interactions',
    letter: 'I',
    label: 'Interactions',
    prompt: 'What or who were you dealing with? Was it new or familiar, formal or informal?',
  },
  { field: 'objects', letter: 'O', label: 'Objects', prompt: 'Were you using any objects or devices that made it better or worse?' },
  { field: 'users', letter: 'U', label: 'Users', prompt: 'Who else was there, and did they add to it or take away from it?' },
]

export const REFLECTION_PROMPT =
  'What patterns do you notice? What gave you the most energy, and what drained it? Any surprises? What would you like more of, or less of?'
