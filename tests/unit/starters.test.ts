import { describe, expect, it } from 'vitest'
import type { Purpose } from '../../src/db/types'
import { PURPOSES } from '../../src/prompts/bank'
import { eveningStarters } from '../../src/prompts/starters'

const PURPOSE_KEYS = [...(Object.keys(PURPOSES) as Purpose[]), 'pattern'] as const
const ALL_SETS = PURPOSE_KEYS.map((p) => eveningStarters(p))

describe('sentence starters ("Need a start?")', () => {
  it('offers three openers for every evening purpose, pattern questions included', () => {
    for (const purpose of PURPOSE_KEYS) expect(eveningStarters(purpose)).toHaveLength(3)
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
