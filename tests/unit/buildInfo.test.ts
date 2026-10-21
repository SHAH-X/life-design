import { describe, expect, it } from 'vitest'
import { formatBuildInfo } from '../../src/lib/buildInfo'

describe('formatBuildInfo', () => {
  it('shows version, commit and build date', () => {
    const text = formatBuildInfo({ version: '0.1.0', commit: 'abc1234', builtAt: '2026-10-21T12:03:00Z' }, 'en-GB')
    expect(text).toBe('v0.1.0 · abc1234 · 21 Oct 2026, 12:03')
  })

  it('says so when the build date is unreadable', () => {
    expect(formatBuildInfo({ version: '0.1.0', commit: 'local', builtAt: 'not-a-date' })).toBe('v0.1.0 · local · unknown date')
  })
})
