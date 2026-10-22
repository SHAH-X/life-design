// "Need a start?": a few openers under an empty writing box, for the blank-page moment. Tapping one types it in
// (with a space after it) and the rest is yours. Each set fits its question; keep them short and open-ended.
import type { Purpose } from '../db/types'
import type { Energy, Engagement } from '../domain/scales'

/** Follows the evening question's purpose (see the question bank), plus questions drawn from your patterns. */
const EVENING: Record<Purpose | 'pattern', readonly string[]> = {
  know: ['I felt most like myself when', "I'd like more of", 'What mattered most was'],
  calm: ['Right now I feel', 'What felt heavy was', 'What helped a little was'],
  grow: ['What went well was', "What I'd change is", "Next time I'll"],
  goal: ['One small step was', 'What got in the way was', "Tomorrow I'll"],
  learn: ['I learned that', 'It matters because', "Next I'll try"],
  joy: ["I'm grateful for", 'A good moment was', "I'm looking forward to"],
  pattern: ["I think it's because", 'What stands out is', 'One small thing could be'],
  free: ['Today I', 'I keep thinking about', 'Something I want to remember is'],
}

export function eveningStarters(purpose: Purpose | 'pattern'): readonly string[] {
  return EVENING[purpose]
}

/** Follows the note's question (followUpQuestion): what took your energy, what gave it, what kept you into it, or anything. */
export function noteStarters(energy: Energy | number, engagement: Engagement | number): readonly string[] {
  if (energy < 0) return ['It took energy because', 'The hard part was', "Next time I'll"]
  if (energy > 0) return ['What I liked was', 'It worked because', "I'd like more of"]
  if (engagement >= 4) return ['I was into it because', 'What kept me going was', 'I noticed']
  return ['I noticed', 'It felt', "Next time I'll"]
}
