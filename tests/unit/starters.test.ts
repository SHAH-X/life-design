import { describe, expect, it } from 'vitest'
import type { Purpose } from '../../src/db/types'
import { PURPOSES } from '../../src/prompts/bank'
import { eveningStarters, noteStarters } from '../../src/prompts/starters'

const PURPOSE_KEYS = [...(Object.keys(PURPOSES) as Purpose[]), 'pattern'] as const
const NOTE_SETS = [noteStarters(-1, 3), noteStarters(1, 3), noteStarters(0, 4), noteStarters(0, 3)]
const ALL_SETS = [...PURPOSE_KEYS.map((p) => eveningStarters(p)), ...NOTE_SETS]

describe('sentence starters ("Need a start?")', () => {
  it('offers three openers for every evening purpose, pattern questions included', () => {
    for (const purpose of PURPOSE_KEYS) expect(eveningStarters(purpose)).toHaveLength(3)
  })

  it('fit the note question: what took energy, what gave it, what kept you into it, or anything', () => {
    expect(noteStarters(-2, 5)[0]).toBe('It took energy because')
    expect(noteStarters(2, 1)[0]).toBe('What I liked was')
    expect(noteStarters(0, 4)[0]).toBe('I was into it because')
    expect(noteStarters(0, 3)[0]).toBe('I noticed')
    for (const set of NOTE_SETS) expect(set).toHaveLength(3)
  })

  it('are short and open-ended, so one can be typed in and carried on from', () => {
    for (const set of ALL_SETS) {
      expect(new Set(set).size).toBe(set.length)
      for (const opener of set) {
        expect(opener.split(' ').length).toBeLessThanOrEqual(6)
        expect(opener).toMatch(/^[A-Z]/)
        expect(opener).not.toMatch(/[.…?!,:;\s]$/)
      }
    }
  })
})
