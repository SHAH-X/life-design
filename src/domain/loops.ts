import type { Entry } from '../db/types'
import { writtenParts } from './search'

// Open loops (step 3 of the owner's vision, 2026-10-24): sentences where you said you'd do something, are waiting on
// something, or haven't decided, found on the phone by their wording (no AI). The provoker asks about one only while
// you haven't written about it since (src/db/loops.ts). Tuned on fictional sentences: tests/fixtures/loops.ts.

export type LoopKind = 'do' | 'waiting' | 'decide'

export interface Loop {
  /** `<entry id>#<sentence>` */
  id: string
  entryId: string
  date: string
  createdAt: number
  kind: LoopKind
  /** The sentence as written. */
  text: string
  /** It with the sentence before, which says what "it" is: what's compared with later writing. */
  context: string
}

/** Sentences end at . ! ? or … before a space (so 4.2% and 49.99 stay whole), and at line breaks. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const DECIDE_QUESTION = /^(should i|shall i|do i|can i|could i|would i|will i|am i going to|is it time|is it worth|what if|how do i|how can i)\b/
const UNDECIDED = /\b(not sure (whether|if)|can'?t decide|undecided|torn between|in two minds|make up my mind|wondering (whether|if)|weighing up|thinking (about|of) \w+ing)\b/
const WAITING =
  /\b(still\s+)?waiting\s+(for|on|to hear)\b|\bhaven'?t heard\b|\bnot heard back\b|\bhoping to hear\b|\bstill hasn'?t (arrived|come|replied|answered|got back)\b/
/** Not done yet: "still haven't replied", "haven't booked it yet". */
const NOT_YET = /\b(still (haven'?t|hasn'?t|not|need)|haven'?t \w+ (it |them |that )?yet)\b/
const REGRET = /\b(should|must|would|could)(n'?t)?\s+have\b|\bshould'?ve\b/
/** Saying you'll do something; those that carry their own subject ("I'll") need no check of who's doing it. */
const WITH_SUBJECT = /\b(i'll|i will|we'll|we will|i'm going to|im going to|i am going to|i'd like to|i would like to|i'd love to)\b/g
const BARE =
  /\b(needs? to|need (a|an|new|some|more)|have to|has to|got to|gotta|must|should|gonna|going to|hoping to|aiming to|meaning to|planning to|plan to|wants? to|would like to|remember to|don'?t forget|promised?)\b/g
/** Before a bare marker: only you (or nobody, as notes leave it out), never "you", "they" or "this function". */
const OWN = new Set(['i', 'we', 'really', 'still', 'just', 'also', 'definitely', 'and', 'so', 'but', 'then', 'probably', 'honestly', 'seriously', 'actually', 'too'])
/** After a marker, words that make it something else: "I will never forget", "we'll see", "have to admit", "I want
 *  to scream". */
const NOT_AFTER = new Set(['never', 'always', 'see', 'admit', 'say', 'scream', 'cry', 'die', 'hide', 'disappear'])
/** A short note that starts with an errand ("Book the vet", "Call grandma"): a to-do. Not "Fix:" in notes on code. */
const ERRAND = /^(book|call|ring|phone|email|text|buy|order|pay|renew|cancel|send|return|post|print|collect|schedule|reply to|top up|pick up|sort out)\b(?!:)/
const ERRAND_MAX_WORDS = 12
/** "Should be fine", "should save": a guess about what happens, not something to do. */
const GUESS_AFTER_SHOULD = new Set(['be', 'save', 'help', 'work', 'last', 'arrive', 'come', 'take', 'fit', 'cost', 'mean', 'make', 'get'])

const wordsOf = (s: string) => s.match(/[a-z']+/g) ?? []

/** Long forms read as short ones, so "I have not" is "I haven't" (and curly apostrophes are straight). */
const SHORT_FORMS: readonly [RegExp, string][] = [
  [/[’‘]/g, "'"],
  [/\bhave not\b/g, "haven't"],
  [/\bhas not\b/g, "hasn't"],
  [/\bdo not\b/g, "don't"],
  [/\bcan ?not\b/g, "can't"],
  [/\bi am\b/g, "i'm"],
  [/\bi would\b/g, "i'd"],
]

/** What kind of open loop a sentence is, or null. */
export function loopKind(sentence: string): LoopKind | null {
  const s = SHORT_FORMS.reduce((t, [from, to]) => t.replace(from, to), sentence.trim().toLowerCase())
  if (!s || REGRET.test(s)) return null
  if ((s.endsWith('?') && DECIDE_QUESTION.test(s)) || UNDECIDED.test(s)) return 'decide'
  if (WAITING.test(s)) return 'waiting'
  if (/^to ?do\b/.test(s) || NOT_YET.test(s)) return 'do'
  if (ERRAND.test(s) && wordsOf(s).length <= ERRAND_MAX_WORDS) return 'do'
  for (const m of s.matchAll(WITH_SUBJECT)) {
    const after = wordsOf(s.slice(m.index + m[0].length))[0]
    if (!after || !NOT_AFTER.has(after)) return 'do'
  }
  for (const m of s.matchAll(BARE)) {
    const before = wordsOf(s.slice(0, m.index)).at(-1)
    const after = wordsOf(s.slice(m.index + m[0].length))[0]
    if (before !== undefined && !OWN.has(before)) continue
    if (after !== undefined && NOT_AFTER.has(after)) continue
    if (m[0] === 'should' && after !== undefined && GUESS_AFTER_SHOULD.has(after)) continue
    return 'do'
  }
  return null
}

/** The open loops in what an entry says (not its questions, and not a draft's). */
export function findLoops(entry: Entry): Loop[] {
  if (entry.status === 'draft') return []
  const sentences = writtenParts(entry).flatMap(sentencesOf)
  return sentences.flatMap((text, n) => {
    const kind = loopKind(text)
    const context = n > 0 ? `${sentences[n - 1]} ${text}` : text
    return kind ? [{ id: `${entry.id}#${n}`, entryId: entry.id, date: entry.date, createdAt: entry.createdAt, kind, text, context }] : []
  })
}
