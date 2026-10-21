import { describe, expect, it } from 'vitest'
import { emptyPlan, keepsVersion, NEEDS, PLAN_SLOTS, PLAN_WORDS, resumeStep } from '../../src/domain/lifeDesign'
import { DAY_MS } from '../../src/lib/dates'

describe('Odyssey Plans', () => {
  it('are three five-year lives, as Designing Your Life frames them', () => {
    expect(PLAN_SLOTS.map((s) => s.label)).toEqual(['Your current path', 'If that path vanished', "If money and image didn't matter"])
  })

  it('are judged in words, never on gauges: how the future feels, and what it would take', () => {
    expect(PLAN_WORDS.map((w) => w.word)).toEqual(['Excited', 'Curious', 'Hopeful', 'Confident', 'Calm', 'Unsure', 'Anxious', 'Scared', 'Trapped', 'Bored'])
    expect(NEEDS.map((n) => n.label)).toEqual(['Time', 'Money', 'Skills', 'People'])
  })

  it('start empty, with nothing chosen for you', () => {
    expect(emptyPlan(3, 5)).toMatchObject({ id: 'plan-3', slot: 3, title: '', years: [[], [], [], [], []], feelings: [], needs: [], writtenAt: null })
  })

  it('resume the guided flow at the first screen not yet answered', () => {
    const plan = emptyPlan(2, 0)
    expect(resumeStep(plan)).toBe(0)
    expect(resumeStep({ ...plan, description: 'Teaching', years: [['Move to Lisbon'], [], [], [], []] })).toBe(2)
    expect(resumeStep({ ...plan, description: 'Teaching', years: [['Move'], [], [], [], []], title: 'Teaching design by the Lisbon sea' })).toBe(3)
    const done = {
      ...plan,
      description: 'x',
      years: [['a'], [], [], [], []],
      title: 't',
      questions: ['q'],
      feelings: ['Calm'],
      needs: ['money' as const],
      fit: 'yes',
    }
    expect(resumeStep(done)).toBe(6)
  })
})

describe('versions', () => {
  it('are kept when a change comes 7 or more days after the last one', () => {
    expect(keepsVersion(0, 6 * DAY_MS)).toBe(false)
    expect(keepsVersion(0, 7 * DAY_MS)).toBe(true)
  })
})
