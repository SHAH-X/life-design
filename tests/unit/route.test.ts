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
    expect(parseHash('#/insights/week-2026-10-19')).toBe('insights')
    expect(parseHash('#/more?from=notification')).toBe('more')
  })

  it('falls back to the default tab for unknown routes', () => {
    expect(parseHash('#/settings')).toBe(DEFAULT_TAB)
    expect(parseHash('#today')).toBe('today')
  })
})

describe('parseRoute', () => {
  it('reads an optional second part, such as a week on Insights', async () => {
    const { parseRoute, hashFor } = await import('../../src/lib/route')
    expect(parseRoute('#/insights/week-2026-10-19')).toEqual({ tab: 'insights', sub: 'week-2026-10-19' })
    expect(parseRoute('#/insights')).toEqual({ tab: 'insights', sub: null })
    expect(parseRoute('#/money/2026-09')).toEqual({ tab: 'money', sub: '2026-09' })
    // Shopping became Money (v0.20): old links still open it.
    expect(parseRoute('#/shopping/2026-09')).toEqual({ tab: 'money', sub: '2026-09' })
    expect(parseRoute('#/nope/abc')).toEqual({ tab: 'today', sub: null })
    expect(hashFor('insights', 'a b')).toBe('#/insights/a%20b')
    expect(parseRoute(hashFor('insights', 'a b'))).toEqual({ tab: 'insights', sub: 'a b' })
  })

  it('opens Today for the removed Review and Life Design tabs, so old links and reminders still work', async () => {
    const { parseRoute } = await import('../../src/lib/route')
    expect(parseRoute('#/review/abc-123')).toEqual({ tab: 'today', sub: null })
    expect(parseRoute('#/design/odyssey')).toEqual({ tab: 'today', sub: null })
  })
})
