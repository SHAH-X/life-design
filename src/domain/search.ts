import type { Entry } from '../db/types'

/** What you wrote in an entry: what you did, your words, your answers, your take and what to remember. */
export function writtenParts(entry: Entry): string[] {
  return [entry.activity, entry.note, ...entry.reflections.map((r) => r.text), entry.take, entry.intention?.text ?? '']
}

/** The text read from an entry's photos (v0.16), those read so far: as your AI read it when it did (with what the photo
 *  shows, v0.18, and what it took a receipt's items for, v0.19.3), else as the phone did. Not what you wrote: open loops
 *  never read it. */
export function photoTexts(entry: Entry): string[] {
  return (entry.photos ?? [])
    .map((p) => {
      const plain = (p.ai?.receipt?.items ?? []).filter((item) => item.plain && item.plain !== item.name).map((item) => item.plain!)
      return [p.ai?.description ?? '', (p.ai?.text || p.text || '').trim(), ...plain].filter(Boolean).join('\n')
    })
    .filter(Boolean)
}

/** Whether an entry mentions the search words anywhere: what you did, your words, answers, next step, its photos. */
export function matchesSearch(entry: Entry, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const text = [...writtenParts(entry), ...photoTexts(entry), ...entry.during, ...entry.after, ...entry.reflections.map((r) => r.question)]
    .join(' ')
    .toLowerCase()
  return words.every((w) => text.includes(w))
}
