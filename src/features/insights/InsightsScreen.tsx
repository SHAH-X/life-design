import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  CONTEXT_LABELS,
  type ContextKey,
  contextStats,
  drainers,
  energisers,
  flowFinder,
  inPeriod,
  joyWords,
  MIN_COUNT,
  overview,
  type Period,
} from '../../analysis/stats'
import { db } from '../../db/db'
import { hasEnergy, hasEngagement, isDone } from '../../db/repo'
import { addDays, formatPeriod, shortDay, toDateKey } from '../../lib/dates'
import { entryTitle } from '../today/EntryRow'
import { overallEnergyWord, times } from '../../domain/feelings'
import { EnergyRows } from '../../ui/charts/EnergyRows'
import { StatTile } from '../../ui/StatTile'
import { EnergyCharts } from './EnergyCharts'

const RANGES = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'All', days: null },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const CONTEXTS: readonly ContextKey[] = ['where', 'people', 'objects', 'part', 'weekday']

const NEED_MORE = `Shows after ${MIN_COUNT}+ entries.`

export function InsightsScreen() {
  const [range, setRange] = useState<RangeKey>('30')
  const [context, setContext] = useState<ContextKey>('where')
  const data = useLiveQuery(async () => {
    const [entries, days, reviews] = await Promise.all([db.entries.toArray(), db.days.toArray(), db.reviews.toArray()])
    return { entries, days, reviews }
  }, [])

  if (data === undefined) return <div className="loading" aria-busy="true" />

  const today = toDateKey(new Date())
  // Finished entries only; each measure only from the entries that answered it.
  const done = data.entries.filter(isDone)
  const firstDate = done.reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null)
  const days = RANGES.find((r) => r.key === range)?.days ?? null
  const period: Period = days === null ? { start: firstDate ?? today, end: today } : { start: addDays(today, -(days - 1)), end: today }

  const entries = inPeriod(done, period)
  const withEnergy = entries.filter(hasEnergy)
  const withEngagement = entries.filter(hasEngagement)
  const smallJoys = inPeriod(data.days, period).filter((d) => d.smallJoy)
  const reviews = data.reviews.filter((r) => r.periodEnd >= period.start && r.periodEnd <= period.end)
  const totals = overview(done, period)
  // What you chose to remember from an entry, then takeaways from reviews before v0.8; newest first.
  const learnings = [
    ...entries
      .filter((e) => e.intention?.kind === 'remember')
      .map((e) => ({ id: e.id, when: e.date, label: shortDay(e.date), text: e.intention?.text || entryTitle(e) })),
    ...reviews
      .filter((r) => r.completedAt !== null && r.takeaway.trim())
      .map((r) => ({ id: r.id, when: r.periodEnd, label: formatPeriod(r.periodStart, r.periodEnd), text: r.takeaway })),
  ].sort((a, b) => b.when.localeCompare(a.when))
  const words = joyWords(smallJoys)
  const gives = energisers(withEnergy)
  const drains = drainers(withEnergy)
  const flow = flowFinder(withEngagement)
  const contextRows = contextStats(withEnergy, context)

  return (
    <>
      <h1>Insights</h1>
      <div className="filter-row" role="group" aria-label="Period">
        {RANGES.map((r) => (
          <button key={r.key} type="button" className="chip" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      <p className="muted small">{formatPeriod(period.start, period.end)}</p>

      {done.length === 0 ? (
        <section className="card">
          <p>After a few days of logging, this shows what gives you energy and what takes it.</p>
        </section>
      ) : (
        <>
          {/* Words first: what gives and takes energy is what people look for; the summary and chart follow. */}
          <section className="card">
            <div className="rank-group">
              <h2>Gives energy</h2>
              {gives.length ? <EnergyRows rows={gives} direction="gives" /> : <p className="muted small">{NEED_MORE}</p>}
            </div>
            <div className="rank-group top-gap">
              <h2>Takes energy</h2>
              {drains.length ? <EnergyRows rows={drains} direction="takes" /> : <p className="muted small">{NEED_MORE}</p>}
            </div>
          </section>

          <div className="kpi-row">
            <StatTile label="Logged on" value={`${totals.daysLogged} ${totals.daysLogged === 1 ? 'day' : 'days'}`} />
            <StatTile label="Energy" value={overallEnergyWord(withEnergy.map((e) => e.energy)) ?? '–'} words />
            <StatTile label="Time flew" value={totals.flow ? times(totals.flow) : 'not yet'} />
          </div>

          <section className="card">
            <EnergyCharts entries={done} period={period} />
          </section>

          <section className="card">
            <h2>Time flew</h2>
            {flow.length ? (
              <ul className="plain-list">
                {flow.map((g) => (
                  <li key={g.label}>
                    <strong>{g.label}</strong>
                    <span className="muted">
                      {' '}
                      · {g.flow} of {g.count} {g.count === 1 ? 'time' : 'times'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Not yet in this period.</p>
            )}
          </section>

          <section className="card">
            <h2>Energy by context</h2>
            <div className="chip-row" role="group" aria-label="Context">
              {CONTEXTS.map((key) => (
                <button key={key} type="button" className="chip" aria-pressed={context === key} onClick={() => setContext(key)}>
                  {CONTEXT_LABELS[key]}
                </button>
              ))}
            </div>
            {contextRows.length ? <EnergyRows rows={contextRows} direction="context" /> : <p className="muted small">{NEED_MORE}</p>}
          </section>

          {words.length ? (
            <section className="card">
              <h2>Small joys</h2>
              <div className="chip-row">
                {words.map((w) => (
                  <span key={w.word} className="chip static joy">
                    {w.word} <span className="muted">· {times(w.count)}</span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <h2>What I'm learning</h2>
            {learnings.length ? (
              <ul className="plain-list">
                {learnings.map((l) => (
                  <li key={l.id}>
                    <span className="muted small">{l.label}</span>
                    <br />
                    {l.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">What you choose to remember lands here.</p>
            )}
          </section>
        </>
      )}
    </>
  )
}
