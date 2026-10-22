// Prototypes (Designing Your Life): small, cheap tests of a possible future. A conversation with someone who lives
// it, or an experience of trying it. Planned until done; a date in the past is just a date, never "overdue".
import type { IkigaiItem, OdysseyPlan, Prototype, PrototypeHow, PrototypeNext } from '../db/types'
import { gapQuestion } from './ikigai'
import type { PlanSlot } from './lifeDesign'

export const PROTOTYPES_INTRO = 'Small, quick ways to test a future: talk to someone, or try it.'
export const QUESTION_TEXT = 'What do you want to find out?'
export const QUESTION_INFO =
  'Designing Your Life: a good prototype is cheap, fast and teaches you something. Talk to someone who lives it ("What\'s it like?", never asking for a job), or try a small piece of it.'
export const HOW_TEXT = 'How will you find out?'
export const HOW_OPTIONS: readonly { value: PrototypeHow; label: string; ask: string; placeholder: string }[] = [
  { value: 'talk', label: 'Talk to someone', ask: 'Who?', placeholder: 'e.g. Maria, a design tutor' },
  { value: 'try', label: 'Try it out', ask: 'What?', placeholder: 'e.g. a weekend pottery class' },
]
export const WHEN_TEXT = 'When?'
export const LEARNED_TEXT = 'What did you learn?'
export const NEXT_TEXT = 'What next?'
export const NEXT_OPTIONS: readonly { value: PrototypeNext; label: string }[] = [
  { value: 'more', label: 'Keep exploring' },
  { value: 'other', label: 'Try something else' },
  { value: 'enough', label: 'Enough for now' },
]

export function newPrototype(now: number): Prototype {
  return {
    id: crypto.randomUUID(),
    question: '',
    planSlot: null,
    how: 'talk',
    withWhat: '',
    when: null,
    doneAt: null,
    learned: '',
    after: [],
    next: null,
    createdAt: now,
    updatedAt: now,
  }
}

/** "Talk to Maria, a design tutor" or "Try: a weekend pottery class". */
export function howLine(prototype: Pick<Prototype, 'how' | 'withWhat'>): string {
  const what = prototype.withWhat.trim()
  if (prototype.how === 'talk') return what ? `Talk to ${what}` : 'Talk to someone'
  return what ? `Try: ${what}` : 'Try it out'
}

export const nextLabel = (next: PrototypeNext | null) => NEXT_OPTIONS.find((o) => o.value === next)?.label ?? null

export interface QuestionSuggestion {
  question: string
  /** The plan it came from, or null for a gap on the Ikigai map. */
  planSlot: PlanSlot | null
}

export const SUGGESTED_QUESTIONS_MAX = 6

/** Questions worth testing: your plans' questions, plan by plan, then the gaps on your Ikigai map. No repeats. */
export function questionSuggestions(plans: readonly OdysseyPlan[], items: readonly IkigaiItem[]): QuestionSuggestion[] {
  const seen = new Set<string>()
  const out: QuestionSuggestion[] = []
  const add = (question: string, planSlot: PlanSlot | null) => {
    const key = question.trim().toLowerCase()
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push({ question: question.trim(), planSlot })
  }
  for (const plan of [...plans].sort((a, b) => a.slot - b.slot)) for (const question of plan.questions) add(question, plan.slot)
  for (const item of items) {
    const question = gapQuestion(item)
    if (question) add(question, null)
  }
  return out.slice(0, SUGGESTED_QUESTIONS_MAX)
}
