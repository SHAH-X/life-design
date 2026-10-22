import { type ReactNode, useId, useState } from 'react'
import { energySeries } from '../../analysis/stats'
import type { WeekSummary } from '../../analysis/week'
import { hasEnergy, saveWeek, setIntentionStatus } from '../../db/repo'
import type { Entry } from '../../db/types'
import { overallEnergyWord, times } from '../../domain/feelings'
import { intentionLabel } from '../../domain/intentions'
import { formatRecentPeriod, longDate, shortWeekday } from '../../lib/dates'
import { useAutosave } from '../../ui/useAutosave'
import { EntryRow, entryTitle } from '../today/EntryRow'
import { EnergyColumns } from './EnergyCharts'
import { Evidence } from './Evidence'

/** One line of the week that opens to show the entries behind it; the thin edge says which way it went. */
function Line({ children, ids, entries, edge }: { children: ReactNode; ids: readonly string[]; entries: ReadonlyMap<string, Entry>; edge?: 'gives' | 'takes' }) {
  return (
    <li>
      <details className="week-line">
        <summary data-energy={edge}>{children}</summary>
        <Evidence ids={ids} entries={entries} />
      </details>
    </li>
  )
}

const howMany = (count: number, of: number) => (count === of ? times(count) : `${count} of ${of} times`)

/**
 * The week, put together for you from what you wrote: nothing to fill in (v0.9 layout: the week's energy by day,
 * then one card per section). Every line opens to the entries behind it; a stand-out entry opens itself. Next steps
 * can be followed up; "Not yet" is fine. One optional box for what to carry into next week.
 */
export function WeekReview(props: {
  summary: WeekSummary
  entries: ReadonlyMap<string, Entry>
  title: string
  /** What you wrote to carry into next week (loaded with the rest, so nothing shifts). */
  carry: string
  onOpen: (entry: Entry) => void
}) {
  const { summary, entries, title, carry, onOpen } = props
  const headingId = useId()
  const pick = (ids: readonly string[]) => ids.map((id) => entries.get(id)).filter((e): e is Entry => e !== undefined)
  const standouts = pick(summary.standout)
  const steps = pick(summary.nextSteps).filter((e) => e.intention !== null)
  const remembered = pick(summary.remember)
  const week = [...entries.values()].filter((e) => e.date >= summary.start && e.date <= summary.end)

  return (
    <section className="week" aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        {title}
      </h2>
      <p className="muted small week-period">{formatRecentPeriod(summary.start, summary.end)}</p>

      <div className="card week-top">
        {summary.entries === 0 ? (
          <p className="muted">Nothing written this week yet. A few words about one thing is enough.</p>
        ) : (
          <>
            <p className="week-count">
              {summary.entries} {summary.entries === 1 ? 'entry' : 'entries'} on {summary.days} {summary.days === 1 ? 'day' : 'days'}
            </p>
            <WeekEnergy week={week} start={summary.start} end={summary.end} />
          </>
        )}
      </div>

      {standouts.length ? (
        <div className="card week-card">
          <h3 id={`${headingId}-stood`}>What stood out</h3>
          <ul className="entry-list" aria-labelledby={`${headingId}-stood`}>
            {standouts.map((e) => (
              <li key={e.id}>
                <EntryRow entry={e} onOpen={() => onOpen(e)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.gave.length || summary.used.length ? (
        <div className="card week-card">
          <h3>Your energy</h3>
          {summary.gave.length ? (
            <>
              <p className="week-sub">Gave you energy</p>
              <ul className="plain-list compact">
                {summary.gave.map((l) => (
                  <Line key={l.label} ids={l.entryIds} entries={entries} edge="gives">
                    {l.label} <span className="muted small">· {howMany(l.count, l.of)}</span>
                  </Line>
                ))}
              </ul>
            </>
          ) : null}
          {summary.used.length ? (
            <>
              <p className="week-sub">Used up your energy</p>
              <ul className="plain-list compact">
                {summary.used.map((l) => (
                  <Line key={l.label} ids={l.entryIds} entries={entries} edge="takes">
                    {l.label} <span className="muted small">· {howMany(l.count, l.of)}</span>
                  </Line>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {summary.feelings.length ? (
        <div className="card week-card">
          <h3>Feelings that came up most</h3>
          <FeelingChips feelings={summary.feelings} entries={entries} />
        </div>
      ) : null}

      {steps.length ? (
        <div className="card week-card">
          <h3>Your next steps</h3>
          <ul className="plain-list next-steps">
            {steps.map((e) => (
              <NextStepLine key={e.id} entry={e} />
            ))}
          </ul>
          <p className="muted small">Not yet is fine: it'll be here next time.</p>
        </div>
      ) : null}

      {remembered.length ? (
        <div className="card week-card remember">
          <h3>To remember</h3>
          <ul className="plain-list compact">
            {remembered.map((e) => (
              <li key={e.id}>{e.intention?.text || entryTitle(e)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="card week-card">
        <CarryField key={summary.start} weekStart={summary.start} initial={carry} />
      </div>
    </section>
  )
}

/** The week's energy by day, in words on tap (blue above the line gave energy, red below took it). */
function WeekEnergy({ week, start, end }: { week: readonly Entry[]; start: string; end: string }) {
  const series = energySeries(week, { start, end })
  if (!series.some((p) => p.avgEnergy !== null)) return null
  const columns = series.map((p) => ({ key: p.start, axisLabel: shortWeekday(p.start), title: longDate(p.start), value: p.avgEnergy, count: p.count }))
  return <EnergyColumns title="Energy by day" columns={columns} overall={overallEnergyWord(week.filter(hasEnergy).map((e) => e.energy))} />
}

/** The feelings that came up most, as chips; one tapped shows the entries behind it. */
function FeelingChips({ feelings, entries }: { feelings: WeekSummary['feelings']; entries: ReadonlyMap<string, Entry> }) {
  const panelId = useId()
  const [open, setOpen] = useState<string | null>(null)
  const shown = feelings.find((f) => f.word === open)
  return (
    <>
      <div className="chip-row" role="group" aria-label="Feelings">
        {feelings.map((f) => (
          <button
            key={f.word}
            type="button"
            className="chip"
            aria-expanded={open === f.word}
            aria-controls={panelId}
            onClick={() => setOpen(open === f.word ? null : f.word)}
          >
            {f.word.toLowerCase()} <span className="muted">· {times(f.count)}</span>
          </button>
        ))}
      </div>
      <div id={panelId}>{shown ? <Evidence ids={shown.entryIds} entries={entries} /> : null}</div>
    </>
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
          <button type="button" onClick={() => void setIntentionStatus(entry, 'done')}>
            Done it
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
