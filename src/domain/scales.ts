// The two Good Time Journal ratings, asked in plain words. Every answer is a phrase, not a number:
// fully worded scales are answered more reliably. The wording stays the same every day so patterns compare.

export type Engagement = 1 | 2 | 3 | 4 | 5
export type Energy = -2 | -1 | 0 | 1 | 2

export interface Level<T> {
  value: T
  /** The answer as you tap it. */
  label: string
  /** How a list reads it out, e.g. "gave a lot of energy". */
  phrase: string
}

export const ENERGY_QUESTION = 'Did it give you energy, or take it?'
export const ENGAGEMENT_QUESTION = 'How into it were you?'
export const FLOW_QUESTION = 'Did time fly?'

export const ENERGY_LEVELS: readonly Level<Energy>[] = [
  { value: -2, label: 'Took a lot', phrase: 'took a lot of energy' },
  { value: -1, label: 'Took a little', phrase: 'took a little energy' },
  { value: 0, label: 'Neither', phrase: 'neither gave nor took energy' },
  { value: 1, label: 'Gave a little', phrase: 'gave a little energy' },
  { value: 2, label: 'Gave a lot', phrase: 'gave a lot of energy' },
]

export const ENGAGEMENT_LEVELS: readonly Level<Engagement>[] = [
  { value: 1, label: 'Not at all', phrase: 'not at all into it' },
  { value: 2, label: 'A little', phrase: 'a little into it' },
  { value: 3, label: 'Somewhat', phrase: 'somewhat into it' },
  { value: 4, label: 'Very', phrase: 'very into it' },
  { value: 5, label: 'Fully', phrase: 'fully into it' },
]

/** Behind the ⓘ buttons. Designing Your Life treats engagement and energy as two separate gauges. */
export const ENERGY_INFO =
  'How did you come out of it: lifted, or flat? Something absorbing can still take energy, like a tough meeting.'

export const ENGAGEMENT_INFO = "Where was your attention? It's about attention, not whether you liked it."

/** Flow only happens when you're deeply into something, so the question is asked only then. */
export function asksAboutFlow(engagement: Engagement): boolean {
  return engagement >= 4
}

/** The optional note, asked in words that follow on from the two answers. */
export function followUpQuestion(energy: Energy, engagement: Engagement): string {
  if (energy < 0) return 'What took your energy?'
  if (energy > 0) return 'What gave you energy?'
  if (asksAboutFlow(engagement)) return 'What kept you into it?'
  return 'Anything that stood out?'
}

export function isEngagement(x: unknown): x is Engagement {
  return x === 1 || x === 2 || x === 3 || x === 4 || x === 5
}

export function isEnergy(x: unknown): x is Energy {
  return x === -2 || x === -1 || x === 0 || x === 1 || x === 2
}

export function energyLevel(value: Energy): Level<Energy> {
  return ENERGY_LEVELS.find((l) => l.value === value) ?? { value, label: String(value), phrase: '' }
}

export function engagementLevel(value: Engagement): Level<Engagement> {
  return ENGAGEMENT_LEVELS.find((l) => l.value === value) ?? { value, label: String(value), phrase: '' }
}

/** ▲▲ ▲ – ▼ ▼▼: energy at a glance in lists (always shown with its colour and a spoken phrase). */
export function energySymbol(value: Energy): string {
  return value > 0 ? '▲'.repeat(value) : value < 0 ? '▼'.repeat(-value) : '–'
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** v1 energy slider (−5…+5) → −2…+2. */
export function energyFromV1(e: number): Energy {
  const v = Math.round(clamp(e, -5, 5) * 0.4)
  return (v === 0 ? 0 : v) as Energy // avoid −0
}

/** v1 engagement slider (0…10) → 1…5. */
export function engagementFromV1(g: number): Engagement {
  return (1 + Math.round(clamp(g, 0, 10) * 0.4)) as Engagement
}
