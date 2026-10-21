import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  balanceTally,
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
import { addDays, formatPeriod, toDateKey } from '../../lib/dates'
import { navigate } from '../../lib/route'
import { BALANCE_INFO } from '../../reviews/prompts'
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
  const firstDate = data.entries.reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null)
  const days = RANGES.find((r) => r.key === range)?.days ?? null
  const period: Period = days === null ? { start: firstDate ?? today, end: today } : { start: addDays(today, -(days - 1)), end: today }

  const entries = inPeriod(data.entries, period)
  const smallJoys = inPeriod(data.days, period).filter((d) => d.smallJoy)
  const reviews = data.reviews.filter((r) => r.periodEnd >= period.start && r.periodEnd <= period.end)
  const totals = overview(data.entries, period)
  const balance = balanceTally(reviews)
  const learnings = reviews
    .filter((r) => r.completedAt !== null && r.takeaway.trim())
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
  const words = joyWords(smallJoys)
  const gives = energisers(entries)
  const drains = drainers(entries)
  const flow = flowFinder(entries)
  const contextRows = contextStats(entries, context)

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

      {data.entries.length === 0 ? (
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
            <StatTile label="Energy" value={overallEnergyWord(entries.map((e) => e.energy)) ?? '–'} words />
            <StatTile label="Time flew" value={totals.flow ? times(totals.flow) : 'not yet'} />
          </div>

          <section className="card">
            <EnergyCharts entries={data.entries} period={period} />
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

          <section className="card">
            <h2>Balance</h2>
            {balance.mostAlive || balance.mostNeglected ? (
              <ul className="plain-list">
                {balance.mostAlive ? (
                  <li>
                    Most alive: <strong>{BALANCE_INFO[balance.mostAlive.area].label}</strong>
                    <span className="muted">
                      {' '}
                      · {balance.mostAlive.count} of {balance.reviews} {balance.reviews === 1 ? 'review' : 'reviews'}
                    </span>
                  </li>
                ) : null}
                {balance.mostNeglected ? (
                  <li>
                    Most neglected: <strong>{BALANCE_INFO[balance.mostNeglected.area].label}</strong>
                    <span className="muted">
                      {' '}
                      · {balance.mostNeglected.count} of {balance.reviews} {balance.reviews === 1 ? 'review' : 'reviews'}
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="muted small">
                Picked in each review.{' '}
                <button type="button" className="link" onClick={() => navigate('review')}>
                  Review
                </button>
              </p>
            )}
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
                {learnings.map((r) => (
                  <li key={r.id}>
                    <span className="muted small">{formatPeriod(r.periodStart, r.periodEnd)}</span>
                    <br />
                    {r.takeaway}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Takeaways from reviews land here.</p>
            )}
          </section>
        </>
      )}
    </>
  )
}
