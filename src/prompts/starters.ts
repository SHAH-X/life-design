// "Need a start?": a few openers under an empty writing box, for the blank-page moment. Tapping one types it in
// (with a space after it) and the rest is yours. Each set fits its question; keep them short and open-ended.
// On Write freely and the evening question; an activity's writing box has its purpose's questions instead (v0.9).
import type { Purpose } from '../db/types'

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
