import { useId, useState } from 'react'
import { APP_URL } from '../../config'
import { setSetting } from '../../db/repo'
import { addMonths, formatClockTime, formatDateKey, isDateKey, shortDate, weekdayName } from '../../lib/dates'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { DAILY_TIMES } from '../../reminders/ics'
import {
  type BackupSchedule,
  planReminders,
  REMINDERS_FILE_NAME,
  type ReminderPlan,
  remindersIcs,
  REVIEW_EVERY_MAX,
  REVIEW_EVERY_MIN,
  type ReviewSchedule,
  WEEKDAYS,
  type Weekday,
} from '../../reminders/schedule'
import { Switch } from '../../ui/Switch'
import type { ReminderSettings } from './useReminderSettings'

const RANGES = [
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
  { label: 'No end date', months: null },
] as const

/** A short visible label ("Time") with its context spoken too ("Daily log time"). */
function FieldLabel({ context, label }: { context: string; label: string }) {
  return (
    <span>
      <span className="visually-hidden">{context} </span>
      {label}
    </span>
  )
}

function TimeSelect({ context, value, onChange }: { context: string; value: string; onChange: (time: string) => void }) {
  return (
    <label className="inline-field">
      <FieldLabel context={context} label="Time" />
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {DAILY_TIMES.map((t) => (
          <option key={t} value={t}>
            {formatClockTime(t)}
          </option>
        ))}
      </select>
    </label>
  )
}

function DaySelect({ context, label, value, onChange }: { context: string; label: string; value: Weekday; onChange: (day: Weekday) => void }) {
  return (
    <label className="inline-field">
      <FieldLabel context={context} label={label} />
      <select value={value} onChange={(e) => onChange(Number(e.target.value) as Weekday)}>
        {WEEKDAYS.map((d) => (
          <option key={d} value={d}>
            {weekdayName(d)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function RemindersCard({ settings }: { settings: ReminderSettings }) {
  const { sentAt } = settings
  const fromId = useId()
  const toId = useId()

  // The screen keeps its own copy so every tap shows at once; saving happens in the background.
  const [plan, setPlan] = useState(settings.plan)
  const [review, setReview] = useState(settings.review)
  const [everyDraft, setEveryDraft] = useState(settings.review.kind === 'days' ? String(settings.review.every) : '14')

  const savePlan = (next: ReminderPlan) => {
    setPlan(next)
    void setSetting('reminders', next)
  }
  const saveReview = (next: ReviewSchedule) => {
    setReview(next)
    if (next.kind === 'days') setEveryDraft(String(next.every))
    void setSetting('reviewSchedule', next)
  }

  const planned = planReminders(plan, review, APP_URL)
  const events = planned.filter((p) => p.event)
  const rangeText = plan.to
    ? `From ${formatDateKey(plan.from)} to ${formatDateKey(plan.to)}.`
    : `From ${formatDateKey(plan.from)}, with no end date.`

  // Built synchronously inside the tap, because iPhone only opens the share menu straight from a tap.
  function getFile() {
    const file = new File([remindersIcs(planned, new Date())], REMINDERS_FILE_NAME, { type: 'text/calendar' })
    const sent = () => void setSetting('remindersSentAt', Date.now())
    if (canShareFile(file)) {
      void shareFile(file)
        .then((result) => {
          if (result === 'shared') sent()
        })
        .catch(() => undefined)
    } else {
      downloadFile(file)
      sent()
    }
  }

  const reviewKind = review.kind
  const backupSchedule = plan.backup.schedule

  return (
    <section className="card">
      <fieldset className="range">
        <legend>Date range</legend>
        <div className="range-row">
          <div>
            <label className="inline-field" htmlFor={fromId}>
              <span>From</span>
            </label>
            <input
              id={fromId}
              type="date"
              value={plan.from}
              onChange={(e) => {
                const from = e.target.value
                if (!isDateKey(from)) return
                savePlan({ ...plan, from, to: plan.to && plan.to < from ? addMonths(from, 12) : plan.to })
              }}
            />
          </div>
          <div>
            <label className="inline-field" htmlFor={toId}>
              <span>To</span>
            </label>
            <input
              id={toId}
              type="date"
              value={plan.to ?? ''}
              min={plan.from}
              disabled={plan.to === null}
              onChange={(e) => {
                const to = e.target.value
                if (isDateKey(to) && to >= plan.from) savePlan({ ...plan, to })
              }}
            />
          </div>
        </div>
        <div className="chip-row">
          {RANGES.map((r) => {
            const target = r.months === null ? null : addMonths(plan.from, r.months)
            return (
              <button
                key={r.label}
                type="button"
                className="chip"
                aria-pressed={plan.to === target}
                onClick={() => savePlan({ ...plan, to: target })}
              >
                {r.label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="reminder-list">
        <div className="reminder-row">
          <Switch
            label="Daily log"
            checked={plan.daily.on}
            onChange={(on) => savePlan({ ...plan, daily: { ...plan.daily, on } })}
          />
          {plan.daily.on ? (
            <div className="reminder-settings">
              <TimeSelect context="Daily log" value={plan.daily.time} onChange={(time) => savePlan({ ...plan, daily: { ...plan.daily, time } })} />
            </div>
          ) : null}
        </div>

        <div className="reminder-row">
          <Switch
            label="Look back"
            checked={plan.review.on}
            onChange={(on) => savePlan({ ...plan, review: { ...plan.review, on } })}
          />
          {plan.review.on ? (
            <div className="reminder-settings">
              <label className="inline-field full">
                <FieldLabel context="Look back" label="Repeats" />
                <select
                  value={reviewKind}
                  onChange={(e) => {
                    const kind = e.target.value
                    if (kind === 'days') saveReview({ kind: 'days', every: review.kind === 'days' ? review.every : 14 })
                    else saveReview({ kind: kind === 'monthly' ? 'monthly' : 'weekly', day: review.kind === 'days' ? 0 : review.day })
                  }}
                >
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                  <option value="days">Every few days</option>
                </select>
              </label>
              {review.kind === 'days' ? (
                <label className="inline-field">
                  <FieldLabel context="Look back" label="Every (days)" />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={REVIEW_EVERY_MIN}
                    max={REVIEW_EVERY_MAX}
                    value={everyDraft}
                    onChange={(e) => {
                      // Accept anything while typing ("1" on the way to "14"); save once it's a valid number.
                      setEveryDraft(e.target.value)
                      const every = Number(e.target.value)
                      if (Number.isInteger(every) && every >= REVIEW_EVERY_MIN && every <= REVIEW_EVERY_MAX) {
                        setReview({ kind: 'days', every })
                        void setSetting('reviewSchedule', { kind: 'days', every })
                      }
                    }}
                    onBlur={() => setEveryDraft(String(review.kind === 'days' ? review.every : 14))}
                  />
                  <span className="field-help">
                    {REVIEW_EVERY_MIN}–{REVIEW_EVERY_MAX} days
                  </span>
                </label>
              ) : (
                <DaySelect
                  context="Look back"
                  label={review.kind === 'monthly' ? 'On the first' : 'Day'}
                  value={review.day}
                  onChange={(day) => saveReview({ kind: review.kind, day })}
                />
              )}
              <TimeSelect context="Look back" value={plan.review.time} onChange={(time) => savePlan({ ...plan, review: { ...plan.review, time } })} />
            </div>
          ) : null}
        </div>

        <div className="reminder-row">
          <Switch
            label="Backup"
            checked={plan.backup.on}
            onChange={(on) => savePlan({ ...plan, backup: { ...plan.backup, on } })}
          />
          {plan.backup.on ? (
            <div className="reminder-settings">
              <label className="inline-field full">
                <FieldLabel context="Backup" label="Repeats" />
                <select
                  value={backupSchedule.kind}
                  onChange={(e) => {
                    const schedule: BackupSchedule = { kind: e.target.value === 'monthly' ? 'monthly' : 'weekly', day: backupSchedule.day }
                    savePlan({ ...plan, backup: { ...plan.backup, schedule } })
                  }}
                >
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </label>
              <DaySelect
                context="Backup"
                label={backupSchedule.kind === 'monthly' ? 'On the first' : 'Day'}
                value={backupSchedule.day}
                onChange={(day) => savePlan({ ...plan, backup: { ...plan.backup, schedule: { ...backupSchedule, day } } })}
              />
              <TimeSelect context="Backup" value={plan.backup.time} onChange={(time) => savePlan({ ...plan, backup: { ...plan.backup, time } })} />
            </div>
          ) : null}
        </div>

        <div className="reminder-row">
          <Switch
            label="Quarterly check-in"
            checked={plan.quarterly.on}
            onChange={(on) => savePlan({ ...plan, quarterly: { ...plan.quarterly, on } })}
          />
          {plan.quarterly.on ? (
            <div className="reminder-settings">
              <DaySelect
                context="Check-in"
                label="On the first"
                value={plan.quarterly.day}
                onChange={(day) => savePlan({ ...plan, quarterly: { ...plan.quarterly, day } })}
              />
              <TimeSelect
                context="Check-in"
                value={plan.quarterly.time}
                onChange={(time) => savePlan({ ...plan, quarterly: { ...plan.quarterly, time } })}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="summary" aria-live="polite">
        <p>
          <strong>Your calendar file</strong>
        </p>
        {planned.length > 0 ? (
          <ul>
            {planned.map((p) => (
              <li key={p.kind}>
                {p.title}: {p.when}
                {p.event ? '' : ' (none falls in this date range)'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No reminders switched on.</p>
        )}
        <p>{rangeText}</p>
      </div>

      <button type="button" className="primary wide top-gap" disabled={events.length === 0} onClick={getFile}>
        Get calendar file…
      </button>
      {sentAt ? <p className="muted small top-gap">Last calendar file: {shortDate(sentAt)}.</p> : null}

      <details className="more-ways">
        <summary>How to add it to Calendar</summary>
        <ol className="steps">
          <li>
            <strong>Mail</strong> it to yourself, open the email, tap the file, then <strong>Add All</strong>.
          </li>
          <li>
            <strong>AirDrop</strong> it to your Mac: it opens in Calendar, and iCloud brings it to your iPhone.
          </li>
          <li>
            <strong>Save to Files</strong>, then tap it in the Files app (newer iOS offers Add All).
          </li>
        </ol>
        <p className="field-help">
          To change them later: in Calendar, open an old “Life Design” event → Delete Event → Delete All Future Events, then get a new
          file here.
        </p>
      </details>

      <details className="more-ways">
        <summary>Or use the Reminders app</summary>
        <ol className="steps">
          {planned.map((p) => (
            <li key={p.kind}>{p.remindersApp}</li>
          ))}
        </ol>
      </details>
    </section>
  )
}
