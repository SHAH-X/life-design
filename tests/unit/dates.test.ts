import { afterEach, describe, expect, it } from 'vitest'
import { addDays, DAY_MS, dayHeading, dayMonthLong, dayNumber, formatRecentPeriod, isDateKey, loggedAt, partOfDay, toDateKey, wholeDaysBetween } from '../../src/lib/dates'

describe('dates', () => {
  it('keys days by the local calendar date', () => {
    expect(toDateKey(new Date(2026, 9, 21, 23, 59))).toBe('2026-10-21')
    expect(toDateKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  describe('around a daylight-saving change', () => {
    const original = process.env.TZ
    afterEach(() => {
      process.env.TZ = original
    })

    it('still moves by whole days (London, clocks change 29 Mar and 25 Oct 2026)', () => {
      process.env.TZ = 'Europe/London'
      // Prove the zone switch took effect: British Summer Time is UTC+1 in July.
      expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-60)
      expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
      expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
      expect(addDays('2026-10-26', -1)).toBe('2026-10-25')
      expect(addDays('2026-10-25', -1)).toBe('2026-10-24')
    })
  })

  it('validates date keys', () => {
    expect(isDateKey('2026-02-28')).toBe(true)
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('2026-2-3')).toBe(false)
    expect(isDateKey(20261021)).toBe(false)
  })

  it('splits the day into morning, afternoon and evening', () => {
    const at = (h: number, m = 0) => partOfDay(new Date(2026, 9, 21, h, m))
    expect(at(4, 59)).toBe('evening')
    expect(at(5)).toBe('morning')
    expect(at(11, 59)).toBe('morning')
    expect(at(12)).toBe('afternoon')
    expect(at(16, 59)).toBe('afternoon')
    expect(at(17)).toBe('evening')
  })

  it('names nearby days', () => {
    expect(dayHeading('2026-10-21', '2026-10-21')).toBe('Today')
    expect(dayHeading('2026-10-20', '2026-10-21')).toBe('Yesterday')
    expect(dayHeading('2026-10-18', '2026-10-21', 'en-GB')).toBe('Sunday')
  })

  it('counts whole days', () => {
    expect(wholeDaysBetween(0, 7 * DAY_MS - 1)).toBe(6)
    expect(wholeDaysBetween(0, 7 * DAY_MS)).toBe(7)
  })
})

describe('dayNumber', () => {
  it('counts calendar days, one per date, even across a daylight-saving change', () => {
    expect(dayNumber('1970-01-02')).toBe(1)
    expect(dayNumber('2026-10-21') - dayNumber('2026-10-20')).toBe(1)
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-28')).toBe(2)
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-24')).toBe(2)
  })
})

describe('short date wording', () => {
  it('leaves out what the screen already says: the weekday under a day heading, the year of a recent period', () => {
    expect(dayMonthLong('2026-10-22', 'en-GB')).toBe('22 October')
    expect(formatRecentPeriod('2026-10-18', '2026-10-22', 'en-GB')).toMatch(/^18\s*–\s*22 Oct$/)
    expect(formatRecentPeriod('2026-10-22', '2026-10-22', 'en-GB')).toBe('22 Oct')
  })
})

describe('loggedAt: when an entry was written', () => {
  it('gives the time it was logged, in the phone’s own format', () => {
    const at = new Date(2026, 9, 22, 21, 14).getTime()
    expect(loggedAt(at, '2026-10-22', 'en-GB')).toBe('21:14')
    // Newer systems put a narrow no-break space before PM.
    expect(loggedAt(at, '2026-10-22', 'en-US').replace(/\s/g, ' ')).toBe('9:14 PM')
  })

  it('adds the day when it was logged on another day than the one it is about', () => {
    const nextMorning = new Date(2026, 9, 23, 9, 2).getTime()
    expect(loggedAt(nextMorning, '2026-10-22', 'en-GB')).toBe('Fri 09:02')
  })
})
