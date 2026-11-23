import { describe, expect, it } from 'vitest'
import { amountField, money, moneyPlain, parseMoney } from '../../src/lib/money'

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


describe('parseMoney: what you type as an amount (step 2)', () => {
  it('reads pounds and pence however they are typed, and says nothing for what is not an amount', () => {
    expect(['3.20', '3,20', '£3.20', ' 5 ', '0.5', '-0.50', '−1.25', '1234.50'].map(parseMoney)).toEqual([320, 320, 320, 500, 50, -50, -125, 123450])
    expect(['', 'cheap', '3.205', '1,234.50', '£', '3.2.1', '1e3'].map(parseMoney)).toEqual([null, null, null, null, null, null, null])
  })
  it('shows an amount as a form field does, and reads it back', () => {
    expect([320, -50, 123450, 5].map(amountField)).toEqual(['3.20', '-0.50', '1234.50', '0.05'])
    expect([320, -50, 123450, 5].map((n) => parseMoney(amountField(n)))).toEqual([320, -50, 123450, 5])
  })
})
