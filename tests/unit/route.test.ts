import { describe, expect, it } from 'vitest'
import { DEFAULT_TAB, hashFor, parseHash, TABS } from '../../src/lib/route'

describe('parseHash', () => {
  it('opens Today when there is no route', () => {
    expect(parseHash('')).toBe('today')
    expect(parseHash('#')).toBe('today')
    expect(parseHash('#/')).toBe('today')
  })

  it('round-trips every tab', () => {
    for (const tab of TABS) expect(parseHash(hashFor(tab))).toBe(tab)
  })

  it('ignores sub-paths and query strings', () => {
    expect(parseHash('#/review/2026-10-19')).toBe('review')
    expect(parseHash('#/more?from=notification')).toBe('more')
  })

  it('falls back to the default tab for unknown routes', () => {
    expect(parseHash('#/settings')).toBe(DEFAULT_TAB)
    expect(parseHash('#today')).toBe('today')
  })
})

describe('parseRoute', () => {
  it('reads an optional second part, such as a review id', async () => {
    const { parseRoute, hashFor } = await import('../../src/lib/route')
    expect(parseRoute('#/review/abc-123')).toEqual({ tab: 'review', sub: 'abc-123' })
    expect(parseRoute('#/review')).toEqual({ tab: 'review', sub: null })
    expect(parseRoute('#/nope/abc')).toEqual({ tab: 'today', sub: null })
    expect(hashFor('review', 'a b')).toBe('#/review/a%20b')
    expect(parseRoute(hashFor('review', 'a b'))).toEqual({ tab: 'review', sub: 'a b' })
  })
})
