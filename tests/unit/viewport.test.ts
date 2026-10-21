import { describe, expect, it } from 'vitest'
import { keyboardInset } from '../../src/lib/viewport'

// iPhone 16 in portrait: 852 px tall; the keyboard with its suggestion bar takes 336.
describe('keyboardInset: how much of the screen the keyboard covers', () => {
  it('is 0 with no keyboard', () => {
    expect(keyboardInset(852, 852, 0)).toBe(0)
  })

  it('is the keyboard height when it opens', () => {
    expect(keyboardInset(852, 516, 0)).toBe(336)
  })

  it('leaves out the part iOS scrolled away when it panned the page to show a field', () => {
    expect(keyboardInset(852, 516, 100)).toBe(236)
  })

  it('never goes below 0, even when iOS leaves a stale offset after the keyboard closes', () => {
    expect(keyboardInset(852, 852, 40)).toBe(0)
  })

  it('rounds to whole pixels', () => {
    expect(keyboardInset(852, 515.6, 0)).toBe(336)
  })
})
