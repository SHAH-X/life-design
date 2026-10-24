import type { Entry } from '../db/types'

/** What you wrote in an entry: what you did, your words, your answers, your take and what to remember. */
export function writtenParts(entry: Entry): string[] {
  return [entry.activity, entry.note, ...entry.reflections.map((r) => r.text), entry.take, entry.intention?.text ?? '']
}

/** Whether an entry mentions the search words anywhere: what you did, your words, answers, next step. */
export function matchesSearch(entry: Entry, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = [...writtenParts(entry), ...entry.during, ...entry.after, ...entry.reflections.map((r) => r.question)]
    .join(' ')
    .toLowerCase()
  return words.every((w) => text.includes(w))
}
