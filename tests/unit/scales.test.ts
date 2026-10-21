import { describe, expect, it } from 'vitest'
import {
  asksAboutFlow,
  ENERGY_LEVELS,
  type Engagement,
  ENGAGEMENT_LEVELS,
  energyFromV1,
  engagementFromV1,
  followUpQuestion,
  isEnergy,
  isEngagement,
} from '../../src/domain/scales'

describe('v1 scale conversion', () => {
  it('maps every v1 energy value (−5…+5) to −2…+2', () => {
    expect([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map(energyFromV1)).toEqual([-2, -2, -1, -1, 0, 0, 0, 1, 1, 2, 2])
  })

  it('never produces −0', () => {
    expect(Object.is(energyFromV1(-1), 0)).toBe(true)
  })

  it('maps every v1 engagement value (0…10) to 1…5', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(engagementFromV1)).toEqual([1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5])
  })

  it('clamps out-of-range values', () => {
    expect(energyFromV1(9)).toBe(2)
    expect(energyFromV1(-9)).toBe(-2)
    expect(engagementFromV1(-3)).toBe(1)
    expect(engagementFromV1(14)).toBe(5)
  })
})

describe('scale guards', () => {
  it('accept only the five values of each scale', () => {
    expect([-2, -1, 0, 1, 2].every(isEnergy)).toBe(true)
    expect([3, -3, 0.5, '1', null].some(isEnergy)).toBe(false)
    expect([1, 2, 3, 4, 5].every(isEngagement)).toBe(true)
    expect([0, 6, 2.5, '3'].some(isEngagement)).toBe(false)
  })
})

describe('plain-language questions', () => {
  it('words every answer, from the lowest value to the highest', () => {
    expect(ENERGY_LEVELS.map((l) => [l.value, l.label])).toEqual([
      [-2, 'Took a lot'],
      [-1, 'Took a little'],
      [0, 'Neither'],
      [1, 'Gave a little'],
      [2, 'Gave a lot'],
    ])
    expect(ENGAGEMENT_LEVELS.map((l) => [l.value, l.label])).toEqual([
      [1, 'Not at all'],
      [2, 'A little'],
      [3, 'Somewhat'],
      [4, 'Very'],
      [5, 'Fully'],
    ])
  })

  it('asks "Did time fly?" only after Very or Fully', () => {
    expect(([1, 2, 3, 4, 5] as Engagement[]).map(asksAboutFlow)).toEqual([false, false, false, true, true])
  })

  it('words the follow-up from the answers just given', () => {
    expect(followUpQuestion(-2, 5)).toBe('What took your energy?')
    expect(followUpQuestion(1, 2)).toBe('What gave you energy?')
    expect(followUpQuestion(0, 4)).toBe('What kept you into it?')
    expect(followUpQuestion(0, 3)).toBe('Anything that stood out?')
  })
})
