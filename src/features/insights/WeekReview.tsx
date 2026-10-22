import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useId } from 'react'
import type { WeekSummary } from '../../analysis/week'
import { db } from '../../db/db'
import { saveWeek, setIntentionStatus } from '../../db/repo'
import type { Entry } from '../../db/types'
import { times } from '../../domain/feelings'
import { intentionLabel } from '../../domain/intentions'
import { formatRecentPeriod } from '../../lib/dates'
import { useAutosave } from '../../ui/useAutosave'
import { entryTitle } from '../today/EntryRow'
import { Evidence } from './Evidence'

/** One line of the week that opens to show the entries behind it. */
function Line({ children, ids, entries }: { children: ReactNode; ids: readonly string[]; entries: ReadonlyMap<string, Entry> }) {
  return (
    <li>
      <details className="week-line">
        <summary>{children}</summary>
        <Evidence ids={ids} entries={entries} />
      </details>
    </li>
  )
}

/**
 * The week, put together for you from what you wrote: nothing to fill in. Each line opens to the entries behind
 * it. Next steps can be followed up; "Not yet" is fine. One optional box for what to carry into next week.
 */
export function WeekReview({ summary, entries, title }: { summary: WeekSummary; entries: ReadonlyMap<string, Entry>; title: string }) {
  const headingId = useId()
  const steps = summary.nextSteps.map((id) => entries.get(id)).filter((e): e is Entry => e?.intention !== undefined && e.intention !== null)

  return (
    <section className="card week" aria-labelledby={headingId}>
      <h2 id={headingId}>{title}</h2>
      <p className="muted small">{formatRecentPeriod(summary.start, summary.end)}</p>
      {summary.entries === 0 ? (
        <p className="muted">Nothing written this week yet. A few words about one thing is enough.</p>
      ) : (
        <>
          <p>
            {summary.entries} {summary.entries === 1 ? 'entry' : 'entries'} on {summary.days} {summary.days === 1 ? 'day' : 'days'}
          </p>
          {summary.standout.length ? (
            <>
              <h3>What stood out</h3>
              <ul className="plain-list compact">
                {summary.standout.map((id) => {
                  const e = entries.get(id)
                  return e ? (
                    <li key={id}>
                      {entryTitle(e)}
                      {e.intention?.kind === 'remember' ? <span className="muted small"> · to remember</span> : null}
                      {e.flow ? <span className="muted small"> · time flew</span> : null}
                    </li>
                  ) : null
                })}
              </ul>
            </>
          ) : null}
          {summary.gave.length ? (
            <>
              <h3>Gave you energy</h3>
              <ul className="plain-list compact">
                {summary.gave.map((l) => (
                  <Line key={l.label} ids={l.entryIds} entries={entries}>
                    {l.label} <span className="muted small">· {l.count === l.of ? times(l.count) : `${l.count} of ${l.of} times`}</span>
                  </Line>
                ))}
              </ul>
            </>
          ) : null}
          {summary.used.length ? (
            <>
              <h3>Used up your energy</h3>
              <ul className="plain-list compact">
                {summary.used.map((l) => (
                  <Line key={l.label} ids={l.entryIds} entries={entries}>
                    {l.label} <span className="muted small">· {l.count === l.of ? times(l.count) : `${l.count} of ${l.of} times`}</span>
                  </Line>
                ))}
              </ul>
            </>
          ) : null}
          {summary.feelings.length ? (
            <>
              <h3>Feelings that came up most</h3>
              <ul className="plain-list compact">
                {summary.feelings.map((f) => (
                  <Line key={f.word} ids={f.entryIds} entries={entries}>
                    {f.word.toLowerCase()} <span className="muted small">· {times(f.count)}</span>
                  </Line>
                ))}
              </ul>
            </>
          ) : null}
          {steps.length ? (
            <>
              <h3>Your next steps</h3>
              <ul className="plain-list compact next-steps">
                {steps.map((e) => (
                  <NextStepLine key={e.id} entry={e} />
                ))}
              </ul>
              <p className="muted small">Not yet is fine: it'll be here next time.</p>
            </>
          ) : null}
          {summary.remember.length ? (
            <>
              <h3>To remember</h3>
              <ul className="plain-list compact">
                {summary.remember.map((id) => {
                  const e = entries.get(id)
                  return e ? <li key={id}>{e.intention?.text || entryTitle(e)}</li> : null
                })}
              </ul>
            </>
          ) : null}
        </>
      )}
      <CarryNote weekStart={summary.start} />
    </section>
  )
}

function NextStepLine({ entry }: { entry: Entry }) {
  const intention = entry.intention
  if (!intention) return null
  return (
    <li>
      <span>
        {intention.text || intentionLabel(intention.kind)} <span className="muted small">· {entryTitle(entry)}</span>
      </span>
      {intention.status === 'open' ? (
        <span className="row">
          <span className="muted small">Did you?</span>
          <button type="button" onClick={() => void setIntentionStatus(entry, 'done')}>
            Yes
          </button>
          <button type="button" className="link" onClick={() => void setIntentionStatus(entry, 'dropped')}>
            Let it go
          </button>
        </span>
      ) : (
        <span className="muted small">{intention.status === 'done' ? ' ✓ Done' : ' Let go'}</span>
      )}
    </li>
  )
}

/** "Anything to carry into next week?": optional, saved as you type, kept with the week. */
function CarryNote({ weekStart }: { weekStart: string }) {
  const saved = useLiveQuery(() => db.weeks.get(weekStart).then((w) => w?.carry ?? ''), [weekStart])
  if (saved === undefined) return null
  return <CarryField key={weekStart} weekStart={weekStart} initial={saved} />
}

function CarryField({ weekStart, initial }: { weekStart: string; initial: string }) {
  const id = useId()
  const field = useAutosave(initial, (value) => saveWeek(weekStart, value))
  return (
    <div className="carry">
      <label className="question-text" htmlFor={id}>
        Anything to carry into next week?
      </label>
      <textarea id={id} rows={2} maxLength={1000} placeholder="Optional" value={field.text} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} />
      <p className="save-status" aria-live="polite">
        {field.status === 'saving' ? 'Saving…' : field.status === 'saved' ? 'Saved' : ''}
      </p>
    </div>
  )
}
