import { describe, expect, it } from 'vitest'
import { addMonths } from '../../src/lib/dates'
import {
  defaultReminderPlan,
  firstMonthlyWeekday,
  firstWeekday,
  normalizeReminderPlan,
  normalizeReviewSchedule,
  planReminders,
  remindersIcs,
  type ReminderPlan,
} from '../../src/reminders/schedule'

const APP = 'https://shah-x.github.io/life-design/'
const unfold = (ics: string) => ics.replace(/\r\n /g, '')
const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1)
const line = (event: string, name: string) => event.split('\r\n').find((l) => l.startsWith(`${name}:`))

// 21 Oct 2026 is a Wednesday; 25 Oct a Sunday; 1 Nov 2026 is the first Sunday of November.
const plan = (over: Partial<ReminderPlan> = {}): ReminderPlan => ({ ...defaultReminderPlan('2026-10-21'), ...over })

describe('dates for reminders', () => {
  it('adds months, clamping to the end of shorter months', () => {
    expect(addMonths('2026-10-21', 12)).toBe('2027-10-21')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-10-21', 3)).toBe('2027-01-21')
  })

  it('finds the first given weekday on or after a date', () => {
    expect(firstWeekday('2026-10-21', 0)).toBe('2026-10-25') // next Sunday
    expect(firstWeekday('2026-10-25', 0)).toBe('2026-10-25') // already Sunday
    expect(firstWeekday('2026-10-21', 3)).toBe('2026-10-21') // already Wednesday
  })

  it('finds the first "first-weekday-of-the-month" on or after a date', () => {
    expect(firstMonthlyWeekday('2026-10-21', 0)).toBe('2026-11-01') // October's first Sunday (4th) has passed
    expect(firstMonthlyWeekday('2026-10-01', 0)).toBe('2026-10-04')
    expect(firstMonthlyWeekday('2026-11-01', 0)).toBe('2026-11-01')
  })
})

describe('planReminders', () => {
  it('describes each reminder in plain words', () => {
    const planned = planReminders(plan(), { kind: 'weekly', day: 0 }, APP, 'en-GB')
    expect(planned.map((p) => [p.kind, p.when])).toEqual([
      ['daily', 'Every day at 21:00'],
      ['review', 'Every Sunday at 18:00'],
      ['backup', 'Every Sunday at 18:30'],
      ['quarterly', 'Every 3 months on the first Sunday at 10:00'],
    ])
  })

  it('leaves out reminders that are switched off', () => {
    const planned = planReminders(plan({ backup: { ...plan().backup, on: false } }), { kind: 'weekly', day: 0 }, APP)
    expect(planned.map((p) => p.kind)).toEqual(['daily', 'review', 'quarterly'])
  })

  it('says when a reminder never falls inside the date range', () => {
    const shortRange = plan({ from: '2026-10-21', to: '2026-10-24' })
    const review = planReminders(shortRange, { kind: 'weekly', day: 0 }, APP).find((p) => p.kind === 'review')
    expect(review?.event).toBeNull()
  })
})

describe('the calendar file', () => {
  const ics = remindersIcs(
    planReminders(plan({ to: '2027-10-21' }), { kind: 'weekly', day: 0 }, APP),
    new Date(Date.UTC(2026, 9, 21, 12)),
  )
  const [daily, review, backup, quarterly] = events(ics)

  it('holds one repeating event per reminder, each with an alert', () => {
    expect(events(ics)).toHaveLength(4)
    for (const e of events(ics)) {
      expect(e).toContain('BEGIN:VALARM')
      expect(e).toContain('TRIGGER:PT0M')
    }
  })

  it('starts each series on its first real occurrence, at a floating local time', () => {
    expect(line(daily ?? '', 'DTSTART')).toBe('DTSTART:20261021T210000')
    expect(line(review ?? '', 'DTSTART')).toBe('DTSTART:20261025T180000')
    expect(line(backup ?? '', 'DTSTART')).toBe('DTSTART:20261025T183000')
    expect(line(quarterly ?? '', 'DTSTART')).toBe('DTSTART:20261101T100000')
  })

  it('repeats on the right pattern and stops at the end date (in local time, like the start)', () => {
    expect(line(daily ?? '', 'RRULE')).toBe('RRULE:FREQ=DAILY;UNTIL=20271021T235959')
    expect(line(review ?? '', 'RRULE')).toBe('RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20271021T235959')
    expect(line(quarterly ?? '', 'RRULE')).toBe('RRULE:FREQ=MONTHLY;INTERVAL=3;BYDAY=1SU;UNTIL=20271021T235959')
  })

  it('handles monthly and every-N-days reviews, and no end date', () => {
    const open = plan({ to: null })
    const monthly = events(remindersIcs(planReminders(open, { kind: 'monthly', day: 1 }, APP), new Date()))[1] ?? ''
    expect(line(monthly, 'RRULE')).toBe('RRULE:FREQ=MONTHLY;BYDAY=1MO')
    expect(line(monthly, 'DTSTART')).toBe('DTSTART:20261102T180000') // first Monday of November
    const everyTen = events(remindersIcs(planReminders(open, { kind: 'days', every: 10 }, APP), new Date()))[1] ?? ''
    expect(line(everyTen, 'RRULE')).toBe('RRULE:FREQ=DAILY;INTERVAL=10')
    expect(line(everyTen, 'DTSTART')).toBe('DTSTART:20261021T180000')
  })

  it('keeps every line within 75 bytes with CRLF endings', () => {
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
    for (const l of ics.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75)
  })
})

describe('stored settings are checked before use', () => {
  it('falls back to defaults for anything missing or invalid', () => {
    expect(normalizeReminderPlan(null, '2026-10-21')).toEqual(defaultReminderPlan('2026-10-21'))
    const messy = { from: 'yesterday', to: '2027-02-30', daily: { on: false, time: '25:00' }, review: 'x' }
    const fixed = normalizeReminderPlan(messy, '2026-10-21')
    expect(fixed.from).toBe('2026-10-21')
    expect(fixed.to).toBe('2027-10-21')
    expect(fixed.daily).toEqual({ on: false, time: '21:00' })
    expect(fixed.review).toEqual(defaultReminderPlan('2026-10-21').review)
  })

  it('keeps a valid review schedule and repairs a broken one', () => {
    expect(normalizeReviewSchedule({ kind: 'days', every: 14 })).toEqual({ kind: 'days', every: 14 })
    expect(normalizeReviewSchedule({ kind: 'days', every: 500 })).toEqual({ kind: 'weekly', day: 0 })
    expect(normalizeReviewSchedule({ kind: 'monthly', day: 9 })).toEqual({ kind: 'weekly', day: 0 })
  })
})
