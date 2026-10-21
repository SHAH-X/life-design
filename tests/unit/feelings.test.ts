import { describe, expect, it } from 'vitest'
import {
  AFTER_WORDS,
  deriveEnergy,
  deriveEngagement,
  deriveFlow,
  DURING_WORDS,
  energyEdge,
  howOften,
  intoItWord,
  overallEnergyWord,
  type OwnWord,
  spotFeelings,
  wordsFor,
} from '../../src/domain/feelings'

const zen: OwnWord = { word: 'Zen', kind: 'after', weight: 1 }
const playful: OwnWord = { word: 'Playful', kind: 'during', weight: 4 }

describe('the feeling words', () => {
  it('offer nine words for what it was like and ten for how it left you, none preselected', () => {
    expect(DURING_WORDS.map((w) => w.word)).toEqual(['Absorbed', 'Focused', 'Curious', 'Challenged', 'Time flew', 'Fine', 'Distracted', 'Restless', 'Bored'])
    expect(AFTER_WORDS.map((w) => w.word)).toEqual([
      'Energised',
      'Inspired',
      'Proud',
      'Calm',
      'Satisfied',
      'Same as before',
      'Tired',
      'Frustrated',
      'Stressed',
      'Drained',
    ])
  })
})

describe('working out energy from how it left you', () => {
  it('adds the words up, within −2 to +2', () => {
    expect(deriveEnergy(['Energised'])).toBe(2)
    expect(deriveEnergy(['Energised', 'Tired'])).toBe(1)
    expect(deriveEnergy(['Proud', 'Tired'])).toBe(0)
    expect(deriveEnergy(['Stressed', 'Frustrated'])).toBe(-2)
    expect(deriveEnergy(['Drained', 'Frustrated'])).toBe(-2)
    expect(deriveEnergy(['Proud', 'Calm'])).toBe(2)
    expect(deriveEnergy(['Same as before'])).toBe(0)
  })

  it('ignores case, and counts your own words by their answer', () => {
    expect(deriveEnergy(['tired'])).toBe(-1)
    expect(deriveEnergy(['Zen'], [zen])).toBe(1)
    expect(deriveEnergy(['Unknown word'])).toBe(0)
  })
})

describe('working out how into it you were', () => {
  it('averages the words and rounds', () => {
    expect(deriveEngagement(['Absorbed'])).toBe(5)
    expect(deriveEngagement(['Absorbed', 'Bored'])).toBe(3)
    expect(deriveEngagement(['Focused', 'Curious'])).toBe(4)
    expect(deriveEngagement(['Time flew', 'Challenged'])).toBe(5)
    expect(deriveEngagement(['Distracted'])).toBe(2)
    expect(deriveEngagement(['Playful'], [playful])).toBe(4)
    expect(deriveEngagement([])).toBe(3)
  })

  it('notes time flying only when "Time flew" is chosen', () => {
    expect(deriveFlow(['Absorbed', 'Time flew'])).toBe(true)
    expect(deriveFlow(['time flew'])).toBe(true)
    expect(deriveFlow(['Absorbed'])).toBe(false)
  })
})

describe('picking feeling words out of a note', () => {
  it('finds the words and everyday phrases for them', () => {
    expect(spotFeelings('Got lost in it, came out tired but proud', { during: [], after: [] })).toEqual({
      during: ['Absorbed'],
      after: ['Tired', 'Proud'],
    })
    expect(spotFeelings('Lost track of time; totally wiped out after', { during: [], after: [] })).toEqual({
      during: ['Time flew'],
      after: ['Drained'],
    })
  })

  it('skips feelings that are negated, and ones already chosen', () => {
    expect(spotFeelings("Not bored at all, and I wasn't stressed", { during: [], after: [] })).toEqual({ during: [], after: [] })
    expect(spotFeelings('Tired and frustrated', { during: [], after: ['Tired'] })).toEqual({ during: [], after: ['Frustrated'] })
  })

  it('recognises your own words too', () => {
    expect(spotFeelings('Felt zen afterwards', { during: [], after: [] }, [zen])).toEqual({ during: [], after: ['Zen'] })
  })
})

describe('words for entries logged before feeling words existed', () => {
  const old = { during: [] as string[], after: [] as string[] }
  it('are worked out from the stored values', () => {
    expect(wordsFor({ ...old, energy: 2, engagement: 5, flow: true })).toEqual({ during: ['Absorbed', 'Time flew'], after: ['Energised'] })
    expect(wordsFor({ ...old, energy: -1, engagement: 2, flow: false })).toEqual({ during: ['Distracted'], after: ['Tired'] })
    expect(wordsFor({ ...old, energy: 0, engagement: 3, flow: false })).toEqual({ during: ['Fine'], after: ['Same as before'] })
  })

  it('while newer entries keep the words that were chosen', () => {
    expect(wordsFor({ during: ['Curious'], after: ['Calm', 'Proud'], energy: 2, engagement: 4, flow: false })).toEqual({
      during: ['Curious'],
      after: ['Calm', 'Proud'],
    })
  })
})

describe('results in words', () => {
  it('say how often, from the share of times', () => {
    expect([1, 0.8, 0.79, 0.6, 0.59, 0.4, 0.39, 0].map(howOften)).toEqual([
      'almost always',
      'almost always',
      'usually',
      'usually',
      'often',
      'often',
      'sometimes',
      'sometimes',
    ])
  })

  it('sum up a period: mostly energising, mostly draining, or mixed', () => {
    expect(overallEnergyWord([2, 1, 1, -1, 0])).toBe('Mostly energising')
    expect(overallEnergyWord([-2, -1, -1, 1, 0])).toBe('Mostly draining')
    expect(overallEnergyWord([2, -2, 0])).toBe('Mixed')
    expect(overallEnergyWord([])).toBeNull()
  })

  it('describe how into things you were', () => {
    expect([4.6, 4, 3, 2, 1.2].map(intoItWord)).toEqual(['absorbed', 'into it', 'fine', 'distracted', 'bored'])
  })
})

describe('energyEdge: the thin coloured edge beside an activity', () => {
  it('is blue for gave energy, red for took it, and none for neither', () => {
    expect(energyEdge(2)).toBe('gives')
    expect(energyEdge(1)).toBe('gives')
    expect(energyEdge(-1)).toBe('takes')
    expect(energyEdge(0)).toBeUndefined()
  })
})
