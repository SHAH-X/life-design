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
