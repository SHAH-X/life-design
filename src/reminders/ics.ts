// iCalendar (RFC 5545) files for repeating reminders in the iPhone Calendar app.
// Times are "floating" (no time zone), so an alert at 21:00 stays at 21:00 wherever the phone is.

export interface IcsEvent {
  uid: string
  summary: string
  description: string
  url: string
  /** YYYY-MM-DD */
  startDate: string
  /** HH:MM, 24-hour */
  startTime: string
  durationMinutes: number
  rrule: string
  alarm: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Reminder times on offer: every 15 minutes, 00:00 to 23:45. */
export const DAILY_TIMES: readonly string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`)

export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

const encoder = new TextEncoder()

/** Lines longer than 75 bytes continue on the next line after a space, never splitting a character. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let bytes = 0
  let limit = 75
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
      limit = 74 // continuation lines start with a space
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

const floating = (date: string, time: string) => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function buildIcs(events: readonly IcsEvent[], stamp: Date): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Design//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(stamp)}`,
      `DTSTART:${floating(e.startDate, e.startTime)}`,
      `DURATION:PT${e.durationMinutes}M`,
      `RRULE:${e.rrule}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      `DESCRIPTION:${escapeIcsText(e.description)}`,
      `URL:${e.url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(e.alarm)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`
}
