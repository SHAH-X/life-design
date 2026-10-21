import { useLiveQuery } from 'dexie-react-hooks'
import { useId } from 'react'
import { APP_URL } from '../../config'
import { getSetting, setSetting } from '../../db/repo'
import { formatClockTime, shortDate, toDateKey } from '../../lib/dates'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { buildIcs, DAILY_TIMES, dailyLogEvent, dailyLogFileName, DEFAULT_DAILY_TIME, isDailyTime } from '../../reminders/ics'

export function RemindersCard() {
  const selectId = useId()
  const stored = useLiveQuery(() => getSetting<string>('reminderDailyTime', DEFAULT_DAILY_TIME), [], DEFAULT_DAILY_TIME)
  const addedAt = useLiveQuery(() => getSetting<number | null>('calendarAddedAt', null), [], null)
  const time = isDailyTime(stored) ? stored : DEFAULT_DAILY_TIME
  const clock = formatClockTime(time)

  // Pre-built file on the website: Safari opens these reliably as "Add to Calendar".
  const href = `${import.meta.env.BASE_URL}reminders/${dailyLogFileName(time)}`

  // Plan B: the same calendar file made on the phone, saved via the share sheet. Built synchronously so the tap still counts.
  function saveFile() {
    const ics = buildIcs([dailyLogEvent(time, toDateKey(new Date()), APP_URL)], new Date())
    const file = new File([ics], dailyLogFileName(time), { type: 'text/calendar' })
    if (canShareFile(file)) void shareFile(file).catch(() => downloadFile(file))
    else downloadFile(file)
  }

  return (
    <section className="card">
      <h2>Daily reminder</h2>
      <p className="muted">An alert in your iPhone Calendar every day, reminding you to log your day.</p>
      <label className="field" htmlFor={selectId}>
        <span>Time</span>
      </label>
      <select id={selectId} value={time} onChange={(e) => void setSetting('reminderDailyTime', e.target.value)}>
        {DAILY_TIMES.map((t) => (
          <option key={t} value={t}>
            {formatClockTime(t)}
          </option>
        ))}
      </select>
      <div className="stack top-gap">
        <a
          className="button primary wide"
          href={href}
          target="_blank"
          rel="noopener"
          onClick={() => void setSetting('calendarAddedAt', Date.now())}
        >
          Add to Calendar
        </a>
        <p className="muted small">
          A calendar file opens: tap <strong>Add All</strong>. To change the time later, first delete the old “Life Design” event in
          Calendar.
        </p>
        <p className="muted small">{addedAt ? `Last added on ${shortDate(addedAt)}.` : 'Not added yet.'}</p>
      </div>
      <details className="more-ways">
        <summary>Calendar didn't open?</summary>
        <p>Save the calendar file, then open it from the Files app and tap Add All:</p>
        <button type="button" className="wide" onClick={saveFile}>
          Save calendar file…
        </button>
        <p className="top-gap">
          Or use the Reminders app: add a reminder called “Log my day”, switch on Date and Time ({clock}), and set Repeat to Daily.
        </p>
      </details>
    </section>
  )
}
