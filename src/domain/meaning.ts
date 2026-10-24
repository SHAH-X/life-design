import type { Entry } from '../db/types'
import { ENERGY_OPTIONS } from './feelings'
import { writtenParts } from './search'

// Search by meaning (v0.14): finds entries that are about the same thing as a question, even with none of its words
// ("times I felt burned out" finds "running on empty"). The model on the phone turns each entry into numbers once
// (src/db/vectors.ts); a question is compared with all of them. How close is never shown, only the order.

const sentence = (text: string) => {
  const t = text.trim()
  return !t || /[.!?…]$/.test(t) ? t : `${t}.`
}

/** What search by meaning reads in an entry: what you wrote, the feeling words and the energy answer. Not the
 *  questions (the same on many entries), places or people. */
export function meaningText(entry: Entry): string {
  const felt = [...entry.during, ...entry.after].map((w) => w.toLowerCase())
  const energy = ENERGY_OPTIONS.find((o) => o.value === entry.energyEffect)?.label ?? ''
  return [...writtenParts(entry), felt.length ? `Felt ${felt.join(', ')}` : '', energy].map(sentence).filter(Boolean).join(' ')
}

/** Long writing in pieces of at most `max` words, cut at sentence ends, so a passage deep in it can still be found. */
export function meaningChunks(text: string, max = 120): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*/g) ?? []
  const chunks: string[] = []
  let current: string[] = []
  let words = 0
  for (const raw of sentences) {
    const s = raw.trim()
    if (!s) continue
    const n = s.split(/\s+/).length
    if (current.length && words + n > max) {
      chunks.push(current.join(' '))
      current = []
      words = 0
    }
    current.push(s)
    words += n
  }
  if (current.length) chunks.push(current.join(' '))
  return chunks
}

/** A short fingerprint of a model and a text, to see whether an entry's numbers are still up to date (FNV-1a). */
export function meaningHash(model: string, text: string): string {
  const s = `${model}\n${text}`
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return `${(h >>> 0).toString(16)}-${s.length}`
}

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!
  return s
}

/** How close each entry is to the question: its closest piece. */
export function closeness(query: Float32Array, rows: readonly { entryId: string; vector: Float32Array }[]): Map<string, number> {
  const best = new Map<string, number>()
  for (const row of rows) {
    const s = dot(query, row.vector)
    if (s > (best.get(row.entryId) ?? -Infinity)) best.set(row.entryId, s)
  }
  return best
}

/** Phase A: no fixed cut-off told the right entries from the rest (no model passed F1 0.57). What worked was taking
 *  those that stand out from the rest for this question: 1.5 standard deviations above the mean. */
const STAND_OUT = 1.5
/** Below this many entries there's no telling what stands out: the closest few instead. */
const FEW = 10
const CLOSEST_FEW = 3

/** The entries that stand out as closest to the question, closest first, at most `max`. */
export function standOut(scores: ReadonlyMap<string, number>, max: number): string[] {
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length < FEW) return ranked.slice(0, Math.min(CLOSEST_FEW, max)).map(([id]) => id)
  const values = ranked.map(([, s]) => s)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
  const picked = ranked.filter(([, s]) => s >= mean + STAND_OUT * sd)
  return (picked.length ? picked : ranked.slice(0, CLOSEST_FEW)).slice(0, max).map(([id]) => id)
}
