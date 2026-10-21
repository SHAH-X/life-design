// The two Good Time Journal values. Since Phase 2.6 nobody rates them: they are worked out from the feeling
// words you choose (see feelings.ts) and only ever shown back in words.

export type Engagement = 1 | 2 | 3 | 4 | 5
export type Energy = -2 | -1 | 0 | 1 | 2

/** The optional note, asked in words that follow on from how it was. */
export function followUpQuestion(energy: Energy, engagement: Engagement): string {
  if (energy < 0) return 'What took your energy?'
  if (energy > 0) return 'What gave you energy?'
  if (engagement >= 4) return 'What kept you into it?'
  return 'Anything that stood out?'
}

export function isEngagement(x: unknown): x is Engagement {
  return x === 1 || x === 2 || x === 3 || x === 4 || x === 5
}

export function isEnergy(x: unknown): x is Energy {
  return x === -2 || x === -1 || x === 0 || x === 1 || x === 2
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
