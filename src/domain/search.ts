import type { Entry } from '../db/types'

/** Whether an entry mentions the search words anywhere: what you did, your words, answers, next step. */
export function matchesSearch(entry: Entry, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = [
    entry.activity,
    entry.note,
    entry.take,
    entry.intention?.text ?? '',
    ...entry.during,
    ...entry.after,
    ...entry.reflections.flatMap((r) => [r.question, r.text]),
  ]
    .join(' ')
    .toLowerCase()
  return words.every((w) => text.includes(w))
}
