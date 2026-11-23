// Your documents (step 5, 2026-11-23, owner-approved plan): kept on the phone, found by their words, with the dates in them
// suggested and tracked only when you say so. Worked out on the phone, never an AI. A document's type and dates are guesses
// from its words, for you to confirm: nothing is tracked, reminded or linked on its own.

import type { DocumentRecord, TrackKind } from '../db/types'
import type { IcsEvent } from '../reminders/ics'
import type { TextPiece } from './statements'

export const DOC_TYPES = ['Tenancy', 'Insurance', 'Utility bill', 'Vehicle', 'Warranty', 'Certificate', 'Correspondence', 'Receipt', 'Other'] as const
export type DocType = (typeof DOC_TYPES)[number]

/** Words that say what a document is, for each type: a word in the title counts three times. */
const CUES: Record<Exclude<DocType, 'Other'>, RegExp> = {
  Tenancy: /\b(tenancy|tenant|landlord|assured shorthold|lease|letting|deposit protection)\b/gi,
  Insurance: /\b(insurance|insurer|insured|policy|premium|excess|underwriter)\b/gi,
  'Utility bill': /\b(electricity|gas|water|broadband|council tax|kwh|meter reading|energy bill|tariff)\b/gi,
  Vehicle: /\b(mot|v5c|vehicle|registration number|dvla|logbook|driving licence|number plate)\b/gi,
  Warranty: /\b(warranty|guarantee|guaranteed)\b/gi,
  Certificate: /\b(certificate|certify|certified|qualification|awarded)\b/gi,
  Correspondence: /\b(dear|yours sincerely|yours faithfully|kind regards|letter)\b/gi,
  Receipt: /\b(receipt|vat)\b/gi,
}

/** What kind of document it is, from its title and the first of its words; Other when nothing is clear (two cues at least). */
export function guessType(title: string, text: string): DocType {
  let best: DocType = 'Other'
  let most = 1
  for (const [type, cue] of Object.entries(CUES) as [Exclude<DocType, 'Other'>, RegExp][]) {
    const score = (title.match(cue)?.length ?? 0) * 3 + (text.slice(0, 4000).match(cue)?.length ?? 0)
    if (score > most) {
      most = score
      best = type
    }
  }
  return best
}

/** The words of a PDF in reading order: pieces at the same height are one line, left to right; lines top to bottom; a blank
 *  line between pages. */
export function textFromPieces(pieces: readonly TextPiece[]): string {
  const pages = new Map<number, TextPiece[]>()
  for (const p of pieces) pages.set(p.page, [...(pages.get(p.page) ?? []), p])
  return [...pages]
    .sort(([a], [b]) => a - b)
    .map(([, list]) => {
      const rows = new Map<number, TextPiece[]>()
      for (const p of list) {
        const key = Math.round(p.y / 3)
        rows.set(key, [...(rows.get(key) ?? []), p])
      }
      return [...rows]
        .sort(([a], [b]) => b - a)
        .map(([, row]) => row.sort((a, b) => a.x - b.x).map((p) => p.str.trim()).filter(Boolean).join(' '))
        .filter(Boolean)
        .join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

export interface DateMention {
  /** YYYY-MM-DD. */
  date: string
  kind: TrackKind
  /** The words before it that say what it is: "Policy renewal date". */
  label: string
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const MONTH_WORDS = `${MONTHS.join('|')}|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec`
/** "1 March 2027", "12th Jan 2027"; "03/08/2027", "3.8.27" (day first); "2027-06-30". Not after a digit or a separator, so a part of a longer date is never one. */
const DATE_WORDS = new RegExp(String.raw`(?<![\d/.\-])(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_WORDS})\.?,?\s+(\d{4})\b`, 'gi')
const DATE_SLASH = /(?<![\d/.\-])(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?![\d/.\-])/g
const DATE_ISO = /(?<![\d/.\-])(\d{4})-(\d{2})-(\d{2})(?![\d/.\-])/g

/** A date as YYYY-MM-DD when it is on the calendar and in a year a document could mean; else null. */
function calendarDate(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100) return null
  const at = new Date(Date.UTC(y, m - 1, d))
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== m - 1 || at.getUTCDate() !== d) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const monthNumber = (word: string) => MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().slice(0, 3))) + 1

/** Each cue, the kind it says, and the words that make it: the nearest to the date wins. */
const KIND_CUES: [TrackKind, RegExp][] = [
  ['renews', /renew\w*/gi],
  ['expires', /expir\w*|valid\s+(?:until|to|through)|good\s+until/gi],
  ['due', /\bdue\b|pay(?:ment)?\s+by/gi],
  ['ends', /\bends?\b|\bending\b|terminat\w*/gi],
  ['starts', /\bstart\w*|commenc\w*|effective\s+from|\bbegins?\b/gi],
]

/** The dates a document gives with a word that says what they are (renews, expires, ends, due, starts), soonest first, each
 *  once. A date with no such word is left out: nothing here is tracked until you say so. */
export function datesIn(text: string): DateMention[] {
  const found: { at: number; date: string }[] = []
  for (const m of text.matchAll(DATE_WORDS)) {
    const date = calendarDate(Number(m[3]), monthNumber(m[2]!), Number(m[1]))
    if (date) found.push({ at: m.index!, date })
  }
  for (const m of text.matchAll(DATE_SLASH)) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const date = calendarDate(y, Number(m[2]), Number(m[1]))
    if (date) found.push({ at: m.index!, date })
  }
  for (const m of text.matchAll(DATE_ISO)) {
    const date = calendarDate(Number(m[1]), Number(m[2]), Number(m[3]))
    if (date) found.push({ at: m.index!, date })
  }
  const out = new Map<string, DateMention>()
  for (const { at, date } of found.sort((a, b) => a.at - b.at)) {
    // The words before it on its line, back to the last full stop: what it says it is.
    const line = text.slice(text.lastIndexOf('\n', at - 1) + 1, at)
    const sentence = line.split(/[.;!?]\s+/).at(-1) ?? ''
    const words = sentence.replace(/[\s:\-–]+$/, '').trim()
    let kind: TrackKind | null = null
    let nearest = -1
    for (const [k, cue] of KIND_CUES) for (const c of words.matchAll(cue)) if (c.index! > nearest) [kind, nearest] = [k, c.index!]
    if (!kind) continue
    const label = words.split(/\s+/).slice(-6).join(' ')
    const key = `${date}|${kind}`
    if (!out.has(key)) out.set(key, { date, kind, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
}

/** A piece of a snippet, and whether it is one of the words searched for. */
export interface Segment {
  text: string
  hit: boolean
}

export interface SearchResult {
  doc: DocumentRecord
  /** Up to two places in its words, each with the matches marked. */
  snippets: Segment[][]
}

const AROUND = { before: 50, after: 90 }
const MAX_SNIPPETS = 2

/** The words you typed: lower case, at least two letters, each once. */
const termsOf = (query: string) => [...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2))]

function segments(text: string, from: number, to: number, terms: readonly string[]): Segment[] {
  const part = text.slice(from, to)
  const lower = part.toLowerCase()
  const marks: [number, number][] = []
  for (const t of terms) for (let at = lower.indexOf(t); at >= 0; at = lower.indexOf(t, at + t.length)) marks.push([at, at + t.length])
  marks.sort((a, b) => a[0] - b[0])
  const out: Segment[] = []
  let pos = 0
  for (const [s, e] of marks) {
    if (s < pos) continue
    if (s > pos) out.push({ text: part.slice(pos, s), hit: false })
    out.push({ text: part.slice(s, e), hit: true })
    pos = e
  }
  if (pos < part.length) out.push({ text: part.slice(pos), hit: false })
  return [{ text: from > 0 ? '…' : '', hit: false }, ...out, { text: to < text.length ? '…' : '', hit: false }].filter((s) => s.text)
}

/** Your documents that have every word you typed, in their title or their words, whatever the capitals: a title match first, then
 *  the most matches. The letters you type, matched anywhere in a word. Nothing for fewer than two letters. */
export function searchDocuments(docs: readonly DocumentRecord[], query: string): SearchResult[] {
  const terms = termsOf(query)
  if (terms.length === 0) return []
  return docs
    .map((doc) => {
      const text = doc.text ?? ''
      const lowerText = text.toLowerCase()
      const hay = `${doc.title.toLowerCase()}\n${lowerText}`
      if (!terms.every((t) => hay.includes(t))) return null
      const count = terms.reduce((n, t) => n + hay.split(t).length - 1, 0)
      const inTitle = terms.every((t) => doc.title.toLowerCase().includes(t))
      const places: number[] = []
      for (const t of terms) for (let at = lowerText.indexOf(t); at >= 0; at = lowerText.indexOf(t, at + t.length)) places.push(at)
      places.sort((a, b) => a - b)
      const snippets: Segment[][] = []
      let end = -1
      for (const p of places) {
        if (snippets.length >= MAX_SNIPPETS) break
        if (p < end) continue
        const [from, to] = [Math.max(0, p - AROUND.before), Math.min(text.length, p + AROUND.after)]
        snippets.push(segments(text, from, to, terms))
        end = to + 30
      }
      return { doc, snippets, score: (inTitle ? 1000 : 0) + count }
    })
    .filter((r): r is SearchResult & { score: number } => r !== null)
    .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
    .map(({ doc, snippets }) => ({ doc, snippets }))
}

const days = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000)

/** Dates you tracked, from today to `within` days on (the last day included), soonest first, with how many days off. */
export function needsLook(docs: readonly DocumentRecord[], today: string, within: number): { doc: DocumentRecord; date: string; kind: TrackKind; label: string; days: number }[] {
  return docs
    .flatMap((doc) => doc.tracked.map((t) => ({ doc, date: t.date, kind: t.kind, label: t.label, days: days(today, t.date) })))
    .filter((n) => n.days >= 0 && n.days <= within)
    .sort((a, b) => a.date.localeCompare(b.date) || a.doc.title.localeCompare(b.doc.title))
}

export const KIND_WORDS: Record<TrackKind, string> = { renews: 'renews', expires: 'expires', ends: 'ends', due: 'is due', starts: 'starts' }

const APP = 'https://shah-x.github.io/life-design/#/more/documents'

/** Calendar events for the dates you tracked that are still to come: one-off, with alerts 30 and 2 days before. */
export function docEvents(docs: readonly DocumentRecord[], today: string): IcsEvent[] {
  return docs.flatMap((doc) =>
    doc.tracked
      .filter((t) => t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(
        (t): IcsEvent => ({
          uid: `doc-${doc.id}-${t.date}-${t.kind}@life-design`,
          summary: `${doc.title} ${KIND_WORDS[t.kind]}`,
          description: [t.label, doc.notes].filter(Boolean).join('. '),
          url: APP,
          startDate: t.date,
          startTime: '09:00',
          durationMinutes: 15,
          alarm: `${doc.title} ${KIND_WORDS[t.kind]} soon`,
          alarmBefore: ['-P30D', '-P2D'],
        }),
      ),
  )
}
