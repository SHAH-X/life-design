// Natural responses instead of ratings (Phase 2.6). You describe an activity with feeling words; the app works out
// how into it you were (1–5), whether it gave or took energy (−2…+2) and whether time flew, here on the phone.
// Those values are never shown: results are put back into words. Naming feelings precisely is linked to better
// coping (emotional granularity), and app reviews ask for your own words alongside a list.
// The weights below are a judgment call: tune them here, and the tests say what each word does.
import type { Duration, EnergyEffect, Measure } from '../db/types'
import type { Energy, Engagement } from './scales'

/** What the words describe: an activity while doing it, how it left you, or how a possible future feels. */
export type FeelingKind = 'during' | 'after' | 'plan'

export interface FeelingWord {
  word: string
  kind: FeelingKind
  /** during: how into it (1–5); after: energy given (+) or taken (−). */
  weight: number
  /** Everyday ways of saying it, for picking it out of a note. */
  phrases: readonly string[]
  flow?: boolean
}

/** A word you added, with the answer you gave once ("Were you into it?" / "Did it give you energy or take it?"). */
export interface OwnWord {
  word: string
  kind: FeelingKind
  weight: number
}

export const DURING_QUESTION = 'What was it like?'
export const AFTER_QUESTION = 'How did you feel?'
export const ENERGY_QUESTION = 'What did it do to your energy?'

/** Behind the ⓘ: what each question is after (Designing Your Life's engagement and energy, in plain words). */
export const DURING_INFO =
  'Where was your attention while you did it? Tap all the words that fit. "Time flew" means so absorbed you lost track of time.'
export const AFTER_INFO = 'How you felt, during it or after. Tap all that fit, add your own words, or skip.'
export const ENERGY_INFO =
  "Noticing what gives you energy and what takes it is the heart of Designing Your Life's Good Time Journal. Something absorbing can still use up your energy, like a tough meeting."

export const DURING_WORDS: readonly FeelingWord[] = [
  { word: 'Absorbed', kind: 'during', weight: 5, phrases: ['absorbed', 'engrossed', 'immersed', 'lost in it', 'in the zone', 'gripped'] },
  { word: 'Focused', kind: 'during', weight: 4, phrases: ['focused', 'focussed', 'concentrated', 'locked in'] },
  { word: 'Curious', kind: 'during', weight: 4, phrases: ['curious', 'intrigued', 'interested', 'fascinated'] },
  { word: 'Challenged', kind: 'during', weight: 4, phrases: ['challenged', 'challenging', 'stretched'] },
  {
    word: 'Time flew',
    kind: 'during',
    weight: 5,
    flow: true,
    phrases: ['time flew', 'lost track of time', 'flew by', "didn't notice the time", 'hours flew'],
  },
  { word: 'Fine', kind: 'during', weight: 3, phrases: ['fine', 'okay', 'alright', 'all right', 'so-so'] },
  {
    word: 'Distracted',
    kind: 'during',
    weight: 2,
    phrases: ['distracted', 'unfocused', 'scattered', "couldn't focus", 'could not focus', 'interrupted', 'interruptions'],
  },
  { word: 'Restless', kind: 'during', weight: 2, phrases: ['restless', 'fidgety', 'antsy', 'impatient'] },
  { word: 'Bored', kind: 'during', weight: 1, phrases: ['bored', 'boring', 'dull', 'tedious', 'monotonous', 'going through the motions'] },
]

/** "How did you feel?" (v0.8). Weights only matter when the energy question is skipped. */
export const AFTER_WORDS: readonly FeelingWord[] = [
  { word: 'Calm', kind: 'after', weight: 1, phrases: ['calm', 'relaxed', 'peaceful', 'at ease', 'serene'] },
  { word: 'Happy', kind: 'after', weight: 1, phrases: ['happy', 'glad', 'joyful', 'cheerful', 'delighted'] },
  { word: 'Fulfilled', kind: 'after', weight: 1, phrases: ['fulfilled', 'satisfied', 'content', 'worthwhile', 'meaningful'] },
  { word: 'Connected', kind: 'after', weight: 1, phrases: ['connected', 'close to', 'belonging', 'understood', 'supported'] },
  { word: 'Inspired', kind: 'after', weight: 2, phrases: ['inspired', 'motivated', 'excited', 'energised', 'energized', 'buzzing', 'refreshed'] },
  { word: 'Proud', kind: 'after', weight: 1, phrases: ['proud', 'accomplished'] },
  { word: 'Neutral', kind: 'after', weight: 0, phrases: ['neutral', 'meh', 'indifferent'] },
  {
    word: 'Tired',
    kind: 'after',
    weight: -1,
    phrases: ['tired', 'sleepy', 'fatigued', 'worn out', 'weary', 'drained', 'exhausted', 'wiped out', 'knackered', 'burnt out', 'burned out'],
  },
  { word: 'Frustrated', kind: 'after', weight: -1, phrases: ['frustrated', 'frustrating', 'annoyed', 'irritated', 'fed up'] },
  { word: 'Anxious', kind: 'after', weight: -1, phrases: ['anxious', 'worried', 'nervous', 'uneasy'] },
  { word: 'Stressed', kind: 'after', weight: -1, phrases: ['stressed', 'stressful', 'tense', 'overwhelmed', 'under pressure'] },
  { word: 'Sad', kind: 'after', weight: -1, phrases: ['sad', 'down', 'low', 'disappointed', 'lonely'] },
]

/** Words from "How did it leave you?" (v0.5–v0.7): no longer offered, still read and counted on older entries. */
const LEGACY_AFTER_WORDS: readonly FeelingWord[] = [
  { word: 'Energised', kind: 'after', weight: 2, phrases: [] },
  { word: 'Satisfied', kind: 'after', weight: 1, phrases: [] },
  { word: 'Same as before', kind: 'after', weight: 0, phrases: [] },
  { word: 'Drained', kind: 'after', weight: -2, phrases: [] },
]

/** Feelings that make "what made it harder?" the better first question. */
export const HARD_FEELINGS: readonly string[] = ['Tired', 'Frustrated', 'Anxious', 'Stressed', 'Sad', 'Drained']

/** The energy question's answers: words, not a scale. Energy for analysis is worked out from them. */
export const ENERGY_OPTIONS: readonly { value: EnergyEffect; label: string; short: string; energy: Energy }[] = [
  { value: 'gave', label: 'It gave me energy', short: 'gave energy', energy: 2 },
  { value: 'used', label: 'It used up my energy', short: 'used up energy', energy: -2 },
  { value: 'little', label: 'Little difference', short: 'little difference', energy: 0 },
  { value: 'mixed', label: 'A mix of both', short: 'a mix of both', energy: 0 },
]

/** "How long?", roughly, in words. */
export const DURATION_OPTIONS: readonly { value: Duration; label: string }[] = [
  { value: 'minutes', label: 'A few minutes' },
  { value: 'hour', label: 'About an hour' },
  { value: 'hours', label: 'A few hours' },
  { value: 'day', label: 'Most of the day' },
]
export const DURATION_LABELS = Object.fromEntries(DURATION_OPTIONS.map((o) => [o.value, o.label])) as Record<Duration, string>

/** Up to this many of your own words per question, so the screens stay short. */
export const OWN_WORDS_MAX = 6

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function weightOf(word: string, kind: 'during' | 'after', own: readonly OwnWord[]): number | null {
  const preset = (kind === 'during' ? DURING_WORDS : [...AFTER_WORDS, ...LEGACY_AFTER_WORDS]).find((w) => same(w.word, word))
  if (preset) return preset.weight
  const mine = own.find((w) => w.kind === kind && same(w.word, word))
  return mine ? mine.weight : null
}

/** How into it you were: the average of the words, rounded; Fine (3) when nothing is known. */
export function deriveEngagement(during: readonly string[], own: readonly OwnWord[] = []): Engagement {
  const weights = during.map((w) => weightOf(w, 'during', own)).filter((w): w is number => w !== null)
  if (weights.length === 0) return 3
  const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length
  return Math.min(5, Math.max(1, Math.floor(mean + 0.5))) as Engagement
}

/** Energy given or taken: the words added up, within −2 and +2. */
export function deriveEnergy(after: readonly string[], own: readonly OwnWord[] = []): Energy {
  const total = after.reduce((sum, w) => sum + (weightOf(w, 'after', own) ?? 0), 0)
  const clamped = Math.min(2, Math.max(-2, total))
  return (clamped === 0 ? 0 : clamped) as Energy // avoid −0
}

export function deriveFlow(during: readonly string[]): boolean {
  return during.some((w) => same(w, 'Time flew'))
}

/**
 * Energy for analysis: from the energy answer, or, if that was skipped, from the feeling words. With neither,
 * `answered` is false and the entry stays out of anything about energy.
 */
export function energyFrom(effect: EnergyEffect | null, after: readonly string[], own: readonly OwnWord[] = []): { energy: Energy; answered: boolean } {
  const option = ENERGY_OPTIONS.find((o) => o.value === effect)
  if (option) return { energy: option.energy, answered: true }
  const known = after.some((w) => weightOf(w, 'after', own) !== null)
  return { energy: known ? deriveEnergy(after, own) : 0, answered: known }
}

const NEGATIONS = new Set(['not', 'no', 'never', 'without', 'hardly', 'barely', "wasn't", "isn't", "didn't", "don't", "wasnt", "didnt"])

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether `phrase` appears in `text` as whole words, with no "not", "never"… just before it. */
function mentions(text: string, phrase: string): boolean {
  const pattern = new RegExp(`(^|[^\\p{L}'])${escape(phrase)}(?=$|[^\\p{L}'])`, 'giu')
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(0, match.index ?? 0).split(/[^\p{L}']+/u).filter(Boolean).slice(-3)
    if (!before.some((w) => NEGATIONS.has(w))) return true
  }
  return false
}

/**
 * Feeling words a note mentions that aren't chosen yet, in the order the lists show them. Only ever a
 * suggestion: you tap to add them.
 */
export function spotFeelings(
  text: string,
  chosen: { during: readonly string[]; after: readonly string[] },
  own: readonly OwnWord[] = [],
): { during: string[]; after: string[] } {
  const clean = text.toLowerCase().replace(/[’‘]/g, "'")
  const find = (kind: 'during' | 'after') => {
    const taken = kind === 'during' ? chosen.during : chosen.after
    const words = [
      ...(kind === 'during' ? DURING_WORDS : AFTER_WORDS).map((w) => ({ word: w.word, phrases: [w.word.toLowerCase(), ...w.phrases] })),
      ...own.filter((w) => w.kind === kind).map((w) => ({ word: w.word, phrases: [w.word.toLowerCase()] })),
    ]
    return words
      .filter((w) => !taken.some((t) => same(t, w.word)))
      .filter((w) => w.phrases.some((p) => mentions(clean, p)))
      .map((w) => w.word)
  }
  // Order by where they appear in the note, which reads more naturally than list order.
  const byPosition = (words: string[], kind: 'during' | 'after') => {
    const all = kind === 'during' ? DURING_WORDS : AFTER_WORDS
    const firstAt = (word: string) => {
      const phrases = [word.toLowerCase(), ...(all.find((w) => w.word === word)?.phrases ?? [])]
      const positions = phrases.map((p) => clean.indexOf(p)).filter((i) => i >= 0)
      return positions.length ? Math.min(...positions) : Number.MAX_SAFE_INTEGER
    }
    return [...words].sort((a, b) => firstAt(a) - firstAt(b))
  }
  return { during: byPosition(find('during'), 'during'), after: byPosition(find('after'), 'after') }
}

const ENGAGEMENT_WORD: Record<Engagement, string> = { 5: 'Absorbed', 4: 'Focused', 3: 'Fine', 2: 'Distracted', 1: 'Bored' }
const ENERGY_WORD: Record<Energy, string> = { 2: 'Energised', 1: 'Satisfied', 0: 'Same as before', [-1]: 'Tired', [-2]: 'Drained' }

/**
 * The words for an entry: as chosen, or, for entries logged before feeling words existed, read from their values.
 * Never for a question that was skipped, and never a feeling for an energy answer (that has its own words).
 */
export function wordsFor(entry: {
  during: readonly string[]
  after: readonly string[]
  energy: Energy
  engagement: Engagement
  flow: boolean
  skipped?: readonly Measure[]
  energyEffect?: EnergyEffect | null
}): {
  during: string[]
  after: string[]
} {
  if (entry.during.length || entry.after.length) return { during: [...entry.during], after: [...entry.after] }
  const skipped = entry.skipped ?? []
  return {
    during: skipped.includes('engagement') ? [] : [ENGAGEMENT_WORD[entry.engagement], ...(entry.flow ? ['Time flew'] : [])],
    after: skipped.includes('energy') || entry.energyEffect ? [] : [ENERGY_WORD[entry.energy]],
  }
}

/** One line for an entry, in words: what it was like, what it did to your energy, how you felt. */
export function entryWords(entry: Parameters<typeof wordsFor>[0]): string {
  const { during, after } = wordsFor(entry)
  const energy = ENERGY_OPTIONS.find((o) => o.value === entry.energyEffect)?.short
  return [...during.map((w) => w.toLowerCase()), ...(energy ? [energy] : []), ...after.map((w) => w.toLowerCase())].join(' · ')
}

/** Which way an activity left you, for the thin coloured edge beside it (blue gave, red took). The words say it too. */
export function energyEdge(energy: number): 'gives' | 'takes' | undefined {
  return energy > 0 ? 'gives' : energy < 0 ? 'takes' : undefined
}

export type HowOften = 'almost always' | 'usually' | 'often' | 'sometimes'

/** How often something happens, from its share of the times (0–1). */
export function howOften(share: number): HowOften {
  if (share >= 0.8) return 'almost always'
  if (share >= 0.6) return 'usually'
  if (share >= 0.4) return 'often'
  return 'sometimes'
}

/** A period's energy in words: 60% or more of activities one way, otherwise mixed. */
export function overallEnergyWord(energies: readonly number[]): 'Mostly energising' | 'Mostly draining' | 'Mixed' | null {
  if (energies.length === 0) return null
  const gave = energies.filter((e) => e > 0).length / energies.length
  const took = energies.filter((e) => e < 0).length / energies.length
  if (gave >= 0.6) return 'Mostly energising'
  if (took >= 0.6) return 'Mostly draining'
  return 'Mixed'
}

/** One day's (or week's) average energy in words, for chart readouts. */
export function energyWordFor(average: number): string {
  if (average >= 0.5) return 'mostly energising'
  if (average <= -0.5) return 'mostly draining'
  return 'mixed'
}

/** How into things you were, in words, from an average of 1–5. */
export function intoItWord(average: number): 'absorbed' | 'into it' | 'fine' | 'distracted' | 'bored' {
  if (average >= 4.5) return 'absorbed'
  if (average >= 3.5) return 'into it'
  if (average >= 2.5) return 'fine'
  if (average >= 1.5) return 'distracted'
  return 'bored'
}

/** "once", "twice", "3 times". */
export function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`
}
