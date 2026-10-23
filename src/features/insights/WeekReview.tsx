import { type ReactNode, useId, useState } from 'react'
import { energyByDay } from '../../analysis/stats'
import type { WeekSummary } from '../../analysis/week'
import type { Entry } from '../../db/types'
import { times } from '../../domain/feelings'
import { formatRecentPeriod, longDate, shortDay, shortWeekday } from '../../lib/dates'
import { countWords, DayCountChart } from '../../ui/charts/DayCountChart'
import { EntryRow } from '../today/EntryRow'
import { Evidence } from './Evidence'

/** One line of the week that opens to show the entries behind it, each of which opens itself. */
function Line({ children, ids, entries, onOpen }: { children: ReactNode; ids: readonly string[]; entries: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  return (
    <li>
      <details className="week-line">
        <summary>{children}</summary>
        <Evidence ids={ids} entries={entries} onOpen={onOpen} />
      </details>
    </li>
  )
}

/**
 * The week, put together for you from what you wrote, with nothing to fill in. v0.13: a recap only (how much you
 * wrote, the energy of each day, what stood out, the feelings that came up most); what gives and uses up your energy
 * is in Insights' last 30 days, and what you keep to remember in What you're learning. A note written to carry into
 * the next week (the box until v0.13) still shows, read-only.
 */
export function WeekReview(props: {
  summary: WeekSummary
  entries: ReadonlyMap<string, Entry>
  title: string
  /** What you wrote, before v0.13, to carry into the next week. */
  carry: string
  onOpen: (entry: Entry) => void
}) {
  const { summary, entries, title, carry, onOpen } = props
  const headingId = useId()
  const standouts = summary.standout.map((id) => entries.get(id)).filter((e): e is Entry => e !== undefined)
  const week = [...entries.values()].filter((e) => e.date >= summary.start && e.date <= summary.end)
  const period = formatRecentPeriod(summary.start, summary.end)

  return (
    <section className="week" aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        {title}
      </h2>
      {/* An earlier week's title is its dates already: said once. */}
      {title === period ? null : <p className="muted small week-period">{period}</p>}

      <div className="card week-top">
        {summary.entries === 0 ? (
          <p className="muted">Nothing written this week yet. A few words about one thing is enough.</p>
        ) : (
          <>
            <p className="week-count">
              {summary.entries} {summary.entries === 1 ? 'entry' : 'entries'} on {summary.days} {summary.days === 1 ? 'day' : 'days'}
            </p>
            <WeekEnergy week={week} start={summary.start} end={summary.end} entries={entries} onOpen={onOpen} />
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

      {summary.feelings.length ? (
        <div className="card week-card">
          <h3>Feelings that came up most</h3>
          <ul className="plain-list compact">
            {summary.feelings.map((f) => (
              <Line key={f.word} ids={f.entryIds} entries={entries} onOpen={onOpen}>
                {f.word.toLowerCase()} <span className="muted small">· {times(f.count)}</span>
              </Line>
            ))}
          </ul>
        </div>
      ) : null}

      {carry.trim() ? (
        <div className="card week-card">
          <h3>To carry into the next week</h3>
          <p className="carry-note">{carry}</p>
        </div>
      ) : null}
    </section>
  )
}

/** The week's energy, day by day, counted; a tapped day lists its entries under the chart. */
function WeekEnergy(props: { week: readonly Entry[]; start: string; end: string; entries: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  const { week, start, end, entries, onOpen } = props
  const [active, setActive] = useState<number | null>(null)
  const counts = energyByDay(week, { start, end })
  const days = counts.map((c) => ({
    key: c.date,
    axisLabel: shortWeekday(c.date),
    title: longDate(c.date),
    rowLabel: shortDay(c.date),
    gave: c.gave,
    used: c.used,
    little: c.little,
    logged: c.entryIds.length,
  }))
  const total = (pick: (c: (typeof counts)[number]) => number) => counts.reduce((sum, c) => sum + pick(c), 0)
  const inWords = countWords({ gave: total((c) => c.gave), used: total((c) => c.used), little: total((c) => c.little) })
  const shown = active === null ? undefined : counts[active]
  return (
    <DayCountChart
      title="Energy, day by day"
      days={days}
      summary={inWords ? `${inWords} · tap a day` : 'Tap a day'}
      active={active}
      onActive={setActive}
      detail={shown?.entryIds.length ? <Evidence ids={shown.entryIds} entries={entries} onOpen={onOpen} oneDay /> : null}
    />
  )
}
