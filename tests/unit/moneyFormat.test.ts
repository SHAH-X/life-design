import { describe, expect, it } from 'vitest'
import { money, moneyPlain } from '../../src/lib/money'

// Amounts are read with thousands separators (audit 2026-11-20: "£5000.00 in all" next to "£1,234.56" in a message). What Ask is
// sent stays plain, as the phone's sums it checks an answer against.
describe('money: pence as money', () => {
  it('writes thousands with a comma, and keeps pence and the sign', () => {
    expect(money(355, '£')).toBe('£3.55')
    expect(money(-50, '£')).toBe('-£0.50')
    expect(money(500000, '£')).toBe('£5,000.00')
    expect(money(-123456, '€')).toBe('-€1,234.56')
    expect(money(100000000, '£')).toBe('£1,000,000.00')
  })
  it('has a plain form with no separators, for what is sent to an AI', () => {
    expect(moneyPlain(500000, '£')).toBe('£5000.00')
    expect(moneyPlain(-50, '£')).toBe('-£0.50')
  })
})
