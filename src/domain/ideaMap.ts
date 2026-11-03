import type { Entry } from '../db/types'
import { addDays, formatDateKey } from '../lib/dates'
import { jsonIn } from './aiReading'
import { writtenParts } from './search'

// The map of your ideas (v0.23, owner: "visualise what and how I think and how they connect"). Your AI reads your
// writing from a period, on a tap, and names the ideas you come back to and the links you wrote between them; the
// phone keeps only what it can check in your words: an idea's label must share a word with its entries, and a link
// must quote the entry it came from, its joining words inside the quote. An arrow is your own sentence, never the
// app's claim of a cause. v0.22's map of life areas joined by days in common was dropped: on the owner's journal,
// mostly one area, it drew three dots and no lines ("useless", 2026-11-03).

/** How you wrote of an idea: as weighing on you, as helping you, or neither. */
export type IdeaKind = 'weighs' | 'helps' | 'idea'
export type MapRange = '30' | '90' | 'all'

export interface MapIdea {
  id: string
  label: string
  kind: IdeaKind
  /** The entries it comes up in, oldest first. */
  entryIds: string[]
}

/** A link you wrote: `from` → `words` → `to`, in the entry `entryId`, whose words `quote` copies. */
export interface MapLink {
  from: string
  to: string
  words: string
  entryId: string
  quote: string
}

/** What the phone left out: not in your words (ideas, links), or over the caps to keep the map readable (cut). */
export interface MapDropped {
  ideas: number
  links: number
  cut: number
}

export interface ParsedMap {
  ideas: MapIdea[]
  links: MapLink[]
  dropped: MapDropped
}

/** What goes to your AI, and what the phone needs to check what comes back. */
export interface MapPackage {
  instructions: string
  data: string
  /** Exactly what's sent, as "See what's sent" shows it. */
  text: string
  /** Each short ref sent (E1…) and its entry. */
  refs: Record<string, string>
  /** Each short ref and the words sent for it. */
  texts: Record<string, string>
  entryCount: number
  words: number
}

export const MAX_IDEAS = 12
export const MAX_LINKS = 16
const MAX_LABEL_WORDS = 5
const MAX_LABEL_CHARS = 40
const MIN_QUOTE_WORDS = 3
const MAX_LINK_WORDS = 3
/** Letters a label's word must share with a word in its entries to count as yours ("worries" and "worried"). */
const STEM = 4

// The example is made up, never anyone's writing. OpenAI and Groq ask for the word JSON with JSON replies.
export const IDEA_MAP_INSTRUCTIONS = [
  "You're drawing a map of the ideas in my own journal, from the entries below. Reply with JSON only, in this shape:",
  '{"ideas": [{"id": "i1", "label": "Rushing", "kind": "weighs", "entries": ["E2", "E7"]}, {"id": "i2", "label": "Tension", "kind": "weighs", "entries": ["E2"]}, {"id": "i3", "label": "A short walk", "kind": "helps", "entries": ["E4"]}],',
  ' "links": [{"from": "i1", "to": "i2", "words": "makes", "entry": "E2", "quote": "rushing the morning makes everything tense"}]}',
  `Ideas: at most ${MAX_IDEAS}, the ones I come back to in two or more entries first. label: at most 4 words, taken from my own words in those entries; never a diagnosis, a trait or a judgement of me. kind: "weighs" when I wrote of it as weighing on me (a worry, a pressure, something hard), "helps" when I wrote of it as helping me (a practice, an attitude, advice to myself), otherwise "idea". entries: the id of every entry (like E2) where it comes up.`,
  `Links: at most ${MAX_LINKS}, and only where I joined two ideas myself, in one entry. from and to: the ideas, in the direction I wrote. entry: that entry's id. quote: the words in that entry that join them, copied exactly, 3 to 25 words, nothing changed or added. words: the joining words from the quote, 1 to 3 of them, exactly as written ("makes", "comes from", "come out of").`,
  'Never add a link I didn\'t write, a cause I didn\'t state, advice, a score or a rating. With no links, give "links": [].',
].join('\n')

/** The dates a map covers: the last 30 or 90 days, or from the first entry you wrote. */
export function mapPeriod(range: MapRange, today: string, first: string | null): { start: string; end: string } {
  if (range === 'all') return { start: first && first < today ? first : today, end: today }
  return { start: addDays(today, -(Number(range) - 1)), end: today }
}

/** An entry's own words as one line: never its photos' text (as open loops, only what you wrote). */
export function ownWords(entry: Entry): string {
  return writtenParts(entry)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ')
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length

/** Your finished entries in the period with words of your own, oldest first, each as "[E1] 4 Aug 2026: …". */
export function buildMapPackage(entries: readonly Entry[], period: { start: string; end: string }): MapPackage {
  const chosen = entries
    .filter((e) => e.status !== 'draft' && e.date >= period.start && e.date <= period.end && ownWords(e))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const refs: Record<string, string> = {}
  const texts: Record<string, string> = {}
  const lines = chosen.map((e, i) => {
    const ref = `E${i + 1}`
    refs[ref] = e.id
    texts[ref] = ownWords(e)
    return `[${ref}] ${formatDateKey(e.date, 'en-GB')}: ${texts[ref]}`
  })
  const span = `${formatDateKey(period.start, 'en-GB')} to ${formatDateKey(period.end, 'en-GB')}`
  const data = [`My journal entries, ${span}, my own words only:`, ...lines].join('\n')
  return {
    instructions: IDEA_MAP_INSTRUCTIONS,
    data,
    text: `${IDEA_MAP_INSTRUCTIONS}\n\n---\n\n${data}`,
    refs,
    texts,
    entryCount: chosen.length,
    words: Object.values(texts).reduce((n, t) => n + wordCount(t), 0),
  }
}

/** Words as the phone compares them: lower case, quotes and dashes alike, anything not a letter or digit a space. */
export function normaliseWords(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Whether a quote is copied from a text: its parts in order, "…" allowed between them, whatever the case or spacing. */
export function quoteIn(quote: string, text: string): boolean {
  const parts = quote
    .split(/\.{3}|…/)
    .map(normaliseWords)
    .filter(Boolean)
  if (!parts.length) return false
  const hay = ` ${normaliseWords(text)} `
  let from = 0
  for (const part of parts) {
    const at = hay.indexOf(` ${part} `, from)
    if (at < 0) return false
    from = at + part.length + 1
  }
  return true
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'you', 'not', 'but', 'are', 'was', 'into', 'about', 'what', 'when'])

/** Whether a label is in your words: one of its words (not a small one) starts like a word in its entries. */
function labelIsYours(label: string, texts: readonly string[]): boolean {
  const stem = (w: string) => w.slice(0, STEM)
  const theirs = new Set(texts.flatMap((t) => normaliseWords(t).split(' ')).map(stem))
  return normaliseWords(label)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .some((w) => theirs.has(stem(w)))
}

const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** "[E3]", "e3" and "3" are all E3; null for anything that isn't a ref. */
function refOf(v: unknown): string | null {
  const s = (typeof v === 'number' ? String(v) : str(v)).replace(/^\[|\]$/g, '').toUpperCase()
  if (/^\d+$/.test(s)) return `E${Number(s)}`
  return /^E\d+$/.test(s) ? `E${Number(s.slice(1))}` : null
}

const kindOf = (v: unknown): IdeaKind => (v === 'weighs' || v === 'helps' ? v : 'idea')

/**
 * What's kept of your AI's map, or null when the reply isn't one. Only refs that were sent count; an idea goes when
 * none of its entries were sent or its label isn't in their words; a link goes unless it joins two kept ideas and its
 * quote is in its entry, its words in the quote. A kept link's entry counts for both its ideas. The most-written ideas
 * are kept first, at most MAX_IDEAS, and at most MAX_LINKS links. Nothing is guessed: an unknown kind is "idea".
 */
export function parseIdeaMap(reply: string, pack: Pick<MapPackage, 'refs' | 'texts'>): ParsedMap | null {
  const json = jsonIn(reply)
  if (!json || !Array.isArray(json.ideas)) return null
  const dropped: MapDropped = { ideas: 0, links: 0, cut: 0 }
  const sent = (ref: string | null): ref is string => ref !== null && ref in pack.refs

  /** The AI's id for each kept idea, and its refs (a set, so a link's entry is added once). */
  const byAiId = new Map<string, { label: string; kind: IdeaKind; refs: Set<string> }>()
  const byLabel = new Map<string, string>()
  for (const raw of json.ideas) {
    const idea = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const id = str(idea.id) || (typeof idea.id === 'number' ? String(idea.id) : '')
    const label = str(idea.label)
    const refs = (Array.isArray(idea.entries) ? idea.entries : []).map(refOf).filter(sent)
    const fits = label && wordCount(label) <= MAX_LABEL_WORDS && label.length <= MAX_LABEL_CHARS
    if (!id || byAiId.has(id) || !fits || !refs.length || !labelIsYours(label, refs.map((r) => pack.texts[r]!))) {
      dropped.ideas++
      continue
    }
    // The same idea twice is one, with the entries of both.
    const same = byLabel.get(normaliseWords(label))
    if (same) {
      for (const r of refs) byAiId.get(same)!.refs.add(r)
      byAiId.set(id, byAiId.get(same)!)
      continue
    }
    byLabel.set(normaliseWords(label), id)
    byAiId.set(id, { label, kind: kindOf(idea.kind), refs: new Set(refs) })
  }

  const links: { from: string; to: string; words: string; ref: string; quote: string }[] = []
  for (const raw of Array.isArray(json.links) ? json.links : []) {
    const link = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const from = byAiId.get(str(link.from) || String(link.from))
    const to = byAiId.get(str(link.to) || String(link.to))
    const ref = refOf(link.entry)
    const quote = str(link.quote)
    const words = str(link.words)
    const ok =
      from &&
      to &&
      from !== to &&
      sent(ref) &&
      wordCount(normaliseWords(quote)) >= MIN_QUOTE_WORDS &&
      quoteIn(quote, pack.texts[ref]!) &&
      words &&
      wordCount(words) <= MAX_LINK_WORDS &&
      quoteIn(words, quote)
    if (!ok) {
      dropped.links++
      continue
    }
    const key = (side: typeof from) => [...byAiId.entries()].find(([, v]) => v === side)![0]
    const fromId = key(from)
    const toId = key(to)
    if (links.some((l) => l.from === fromId && l.to === toId)) continue
    from.refs.add(ref)
    to.refs.add(ref)
    links.push({ from: fromId, to: toId, words, ref, quote })
  }

  // Most-written first, then by name; ids renumbered i1… in that order.
  const order = (ref: string) => Number(ref.slice(1))
  const kept = [...new Set(byAiId.values())]
    .map((v) => ({ aiId: [...byAiId.entries()].find(([, x]) => x === v)![0], ...v }))
    .sort((a, b) => b.refs.size - a.refs.size || a.label.localeCompare(b.label))
  dropped.cut += Math.max(0, kept.length - MAX_IDEAS)
  const shown = kept.slice(0, MAX_IDEAS)
  const newId = new Map(shown.map((idea, i) => [idea.aiId, `i${i + 1}`]))
  const ideas: MapIdea[] = shown.map((idea) => ({
    id: newId.get(idea.aiId)!,
    label: idea.label,
    kind: idea.kind,
    entryIds: [...idea.refs].sort((a, b) => order(a) - order(b)).map((r) => pack.refs[r]!),
  }))
  const joined = links.filter((l) => newId.has(l.from) && newId.has(l.to))
  dropped.cut += links.length - joined.length + Math.max(0, joined.length - MAX_LINKS)
  return {
    ideas,
    links: joined.slice(0, MAX_LINKS).map((l) => ({ from: newId.get(l.from)!, to: newId.get(l.to)!, words: l.words, entryId: pack.refs[l.ref]!, quote: l.quote })),
    dropped,
  }
}

/** Finished entries with words of your own written or changed since a map was drawn, in its period. */
export function writtenSince(map: { createdAt: number; start: string }, entries: readonly Entry[]): number {
  return entries.filter((e) => e.status !== 'draft' && e.date >= map.start && e.updatedAt > map.createdAt && ownWords(e)).length
}
