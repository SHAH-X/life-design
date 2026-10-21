import { describe, expect, it } from 'vitest'
import { buildIcs, DAILY_TIMES, dailyLogEvent, dailyLogFileName, escapeIcsText, foldIcsLine } from '../../src/reminders/ics'

const bytes = (s: string) => new TextEncoder().encode(s).length
const ics = buildIcs([dailyLogEvent('21:00', '2026-10-21', 'https://shah-x.github.io/life-design/')], new Date(Date.UTC(2026, 9, 21, 12)))
const unfolded = ics.replace(/\r\n /g, '')

describe('calendar file', () => {
  it('holds one daily repeating event at a floating local time, with an alert', () => {
    expect(unfolded.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(unfolded).toContain('\r\nDTSTART:20261021T210000\r\n')
    expect(unfolded).toContain('\r\nRRULE:FREQ=DAILY\r\n')
    expect(unfolded).toContain('\r\nDTSTAMP:20261021T120000Z\r\n')
    expect(unfolded).toContain('\r\nUID:life-design-daily-log-2100@shah-x.github.io\r\n')
    expect(unfolded).toContain('\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\n')
    expect(unfolded).toContain('\r\nTRIGGER:PT0M\r\n')
    expect(unfolded).toContain('\r\nURL:https://shah-x.github.io/life-design/#/today\r\n')
    expect(unfolded.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('uses CRLF everywhere and keeps every line within 75 bytes', () => {
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
    for (const line of ics.split('\r\n')) expect(bytes(line)).toBeLessThanOrEqual(75)
  })

  it('escapes commas, semicolons, backslashes and line breaks in text', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('folds long lines without splitting a character', () => {
    const long = `DESCRIPTION:${'é'.repeat(80)}`
    const folded = foldIcsLine(long)
    expect(folded.split('\r\n ').join('')).toBe(long)
    for (const part of folded.split('\r\n')) expect(bytes(part)).toBeLessThanOrEqual(75)
  })

  it('offers a time every 15 minutes', () => {
    expect(DAILY_TIMES).toHaveLength(96)
    expect(DAILY_TIMES[0]).toBe('00:00')
    expect(DAILY_TIMES[DAILY_TIMES.length - 1]).toBe('23:45')
    expect(dailyLogFileName('07:30')).toBe('daily-log-0730.ics')
  })
})
