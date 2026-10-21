import { describe, expect, it } from 'vitest'
import { AWAY_DAYS, isBackAfterBreak, shouldWelcome } from '../../src/app/welcome'

describe('shouldWelcome: the short welcome shows once, on a first open', () => {
  it('shows when the app opens at its start page with an empty journal', () => {
    expect(shouldWelcome({ hash: '', welcomed: false, hasData: false })).toBe(true)
    expect(shouldWelcome({ hash: '#/', welcomed: false, hasData: false })).toBe(true)
  })

  it('never shows twice, over a journal with data, or on a link to a page', () => {
    expect(shouldWelcome({ hash: '', welcomed: true, hasData: false })).toBe(false)
    expect(shouldWelcome({ hash: '', welcomed: false, hasData: true })).toBe(false)
    expect(shouldWelcome({ hash: '#/today', welcomed: false, hasData: false })).toBe(false)
    expect(shouldWelcome({ hash: '#/more/backup', welcomed: false, hasData: false })).toBe(false)
  })
})

describe('isBackAfterBreak: "Missed days don\'t matter" after a few days away', () => {
  it(`shows after ${AWAY_DAYS} or more days since the last entry`, () => {
    expect(isBackAfterBreak('2026-10-18', '2026-10-21')).toBe(true)
    expect(isBackAfterBreak('2026-09-30', '2026-10-21')).toBe(true)
  })

  it('stays quiet after a day or two off, and for a brand-new journal', () => {
    expect(isBackAfterBreak('2026-10-19', '2026-10-21')).toBe(false)
    expect(isBackAfterBreak('2026-10-20', '2026-10-21')).toBe(false)
    expect(isBackAfterBreak(null, '2026-10-21')).toBe(false)
  })
})
