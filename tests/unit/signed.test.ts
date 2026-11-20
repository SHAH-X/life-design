import { describe, expect, it } from 'vitest'
import { signed } from '../../src/features/money/Investing'

// A result is a sign and its figure (owner, 2026-11-20: "'made' written doesn't look good, + or − would look better").
describe('signed: what a sale made or lost', () => {
  it('puts + before a gain and a true minus before a loss', () => {
    expect(signed(3757)).toBe('+£37.57')
    expect(signed(-1230)).toBe('−£12.30')
  })
  it('leaves nothing at all as plain £0.00, with no sign', () => {
    expect(signed(0)).toBe('£0.00')
  })
})
