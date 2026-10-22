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

  // Measured in the iOS Simulator (iPhone 17, iOS 27.0), v0.12.2: for a box low in a sheet, iOS shrinks the page
  // itself (innerHeight) and reports its scroll as the offset. Counting that offset lifted the sheet by 0, so it
  // slid down by the offset: the page showed above it and Save went under the keyboard.
  it('leaves the offset out when iOS has shrunk the page: Home Screen app, the writing box', () => {
    expect(keyboardInset(568, 416, 244, 812)).toBe(152)
  })

  it('leaves the offset out when iOS has shrunk the page: Safari, the writing box', () => {
    expect(keyboardInset(478, 384, 236, 714)).toBe(94)
  })

  it('still counts the offset when the page kept its height (iOS moved only the visible area)', () => {
    expect(keyboardInset(714, 384, 192, 714)).toBe(138)
  })
})
