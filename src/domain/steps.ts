// Next steps you can manage (v0.11). What you decide to do or try after reflecting ("Now what?", Kolb's active
// experimentation) works best tied to a moment ("after dinner": if-then plans, Gollwitzer & Sheeran) and tried again
// in the same kind of situation. So a step keeps its activity and comes back when you write about that activity
// again: nothing nags on a schedule, and nothing asks to be ticked daily (habits form from a steady cue; a missed
// day doesn't undo them, Lally 2010).
import type { IntentionKind, Step, StepKind, StepStatus } from '../db/types'
import { intentionLabel } from './intentions'

/** "Do it again" and "Make time for…" carry on; trying something or exploring a question is done once. */
export function kindFor(kind: IntentionKind): StepKind {
  return kind === 'again' || kind === 'time' ? 'ongoing' : 'once'
}

const FOLLOW_UP: readonly unknown[] = ['differently', 'again', 'time', 'explore']
const STATUS: Record<string, StepStatus> = { open: 'active', done: 'done', dropped: 'stopped' }

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const key = (activity: string) => activity.trim().toLowerCase()

/**
 * Next steps kept on entries before v0.11 (Done it / Let it go), as steps: used by the database upgrade and when
 * restoring an older backup. The id comes from the entry, so doing it twice never makes a second step.
 */
export function stepsFromIntentions(entries: readonly unknown[]): Step[] {
  const steps: Step[] = []
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue
    const intention = entry.intention
    if (!isRecord(intention) || !FOLLOW_UP.includes(intention.kind) || typeof intention.text !== 'string') continue
    const status = STATUS[String(intention.status)]
    if (!status) continue
    const at = typeof intention.updatedAt === 'number' ? intention.updatedAt : Number(entry.updatedAt) || 0
    const kind = intention.kind as IntentionKind
    steps.push({
      id: `from-${entry.id}`,
      text: intention.text.trim() || intentionLabel(kind),
      when: '',
      kind: kindFor(kind),
      status,
      entryIds: [entry.id],
      activity: typeof entry.activity === 'string' ? key(entry.activity) : '',
      createdAt: at,
      updatedAt: at,
      finishedAt: status === 'active' ? null : at,
    })
  }
  return steps
}

// Small words that don't change what a step is about, including "do", "try" and "go" ("try yoga" is "do yoga").
const SMALL = new Set(
  'a an the and or but to of for in on at by with from into my me i it its this that these those be is are was were am do does did done doing try go get have has had make take keep start more less some every each again after before when then than so just really very also'.split(
    ' ',
  ),
)

/** The words that carry a step's meaning, with plain-English endings trimmed ("walking", "walks" → "walk"). */
function contentWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const kept = new Set<string>()
  for (const word of words) {
    if (SMALL.has(word)) continue
    let stem = word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
    if (stem.length > 5 && stem.endsWith('ing')) stem = stem.slice(0, -3)
    else if (stem.length > 4 && stem.endsWith('ed')) stem = stem.slice(0, -2)
    kept.add(stem)
  }
  return kept
}

/** Look alike: most of their words are the same (60% or more), or one says all the other does. */
export function lookAlike(a: string, b: string): boolean {
  const x = contentWords(a)
  const y = contentWords(b)
  if (x.size === 0 || y.size === 0) return false
  const shared = [...x].filter((w) => y.has(w)).length
  if (shared === Math.min(x.size, y.size)) return true
  return shared / (x.size + y.size - shared) >= 0.6
}

/** A step you're working on that says much the same, most recently touched first. */
export function findLookAlike(text: string, steps: readonly Step[]): Step | undefined {
  return [...steps].filter((s) => s.status === 'active').sort((a, b) => b.updatedAt - a.updatedAt).find((s) => lookAlike(text, s.text))
}

/** Pairs of steps you're working on that look alike, each step in one pair at most. */
export function lookAlikePairs(steps: readonly Step[]): [Step, Step][] {
  const active = steps.filter((s) => s.status === 'active')
  const pairs: [Step, Step][] = []
  const used = new Set<string>()
  for (const [i, a] of active.entries()) {
    if (used.has(a.id)) continue
    const b = active.slice(i + 1).find((other) => !used.has(other.id) && lookAlike(a.text, other.text))
    if (!b) continue
    pairs.push([a, b])
    used.add(a.id).add(b.id)
  }
  return pairs
}

/** "After dinner: Walk 10 minutes", or just the step. */
export function stepLine(step: Pick<Step, 'text' | 'when'>): string {
  const when = step.when.trim()
  return when ? `${when.charAt(0).toUpperCase()}${when.slice(1)}: ${step.text}` : step.text
}

/** The steps you're working on for an activity: they come back when you write about it again. */
export function stepsForActivity(steps: readonly Step[], activity: string): Step[] {
  const wanted = key(activity)
  return wanted ? steps.filter((s) => s.status === 'active' && s.activity === wanted) : []
}

/** After this long untouched, a step you're working on asks whether to keep it. */
export const STALE_DAYS = 28

export function isStale(step: Step, now: number): boolean {
  return step.status === 'active' && now - step.updatedAt > STALE_DAYS * 86_400_000
}
