// Rating scales for Good Time Journal entries. Five taps each: quick to answer honestly on a phone.

export type Engagement = 1 | 2 | 3 | 4 | 5
export type Energy = -2 | -1 | 0 | 1 | 2

export interface Level<T> {
  value: T
  label: string
  short: string
}

export const ENGAGEMENT_LEVELS: readonly Level<Engagement>[] = [
  { value: 1, label: 'Bored', short: '1' },
  { value: 2, label: 'Low engagement', short: '2' },
  { value: 3, label: 'Some engagement', short: '3' },
  { value: 4, label: 'Engaged', short: '4' },
  { value: 5, label: 'Absorbed', short: '5' },
]

export const ENERGY_LEVELS: readonly Level<Energy>[] = [
  { value: -2, label: 'Drained', short: '−2' },
  { value: -1, label: 'A bit drained', short: '−1' },
  { value: 0, label: 'Neutral', short: '0' },
  { value: 1, label: 'A bit energised', short: '+1' },
  { value: 2, label: 'Energised', short: '+2' },
]

/** Shown behind the ⓘ buttons (Designing Your Life treats engagement and energy as two separate gauges). */
export const ENGAGEMENT_INFO =
  "How absorbed were you? 5 = fully focused and interested, time flew. 1 = bored, distracted or restless. It's about your attention, not whether it was pleasant."

export const ENERGY_INFO =
  'Did it give you energy or take it away? +2 = you came out lifted and motivated. −2 = you came out tired, flat or drained. Something can be engaging and still draining, like a tough but interesting meeting.'

export function isEngagement(x: unknown): x is Engagement {
  return x === 1 || x === 2 || x === 3 || x === 4 || x === 5
}

export function isEnergy(x: unknown): x is Energy {
  return x === -2 || x === -1 || x === 0 || x === 1 || x === 2
}

export function engagementLabel(value: Engagement): string {
  return ENGAGEMENT_LEVELS.find((l) => l.value === value)?.label ?? ''
}

export function energyLabel(value: Energy): string {
  return ENERGY_LEVELS.find((l) => l.value === value)?.label ?? ''
}

export function energyShort(value: Energy): string {
  return ENERGY_LEVELS.find((l) => l.value === value)?.short ?? String(value)
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
