import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import {
  aloneOrWithOthers,
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
import { weekStart, weeksWithEntries, weekSummary } from '../../analysis/week'
import { db } from '../../db/db'
import { hasEnergy, hasEngagement, isDone, loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import type { Day, Entry, Review, Step } from '../../db/types'
import { overallEnergyWord, times } from '../../domain/feelings'
import { addDays, formatPeriod, formatRecentPeriod, shortDay, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { EnergyRows } from '../../ui/charts/EnergyRows'
import { Loading } from '../../ui/Loading'
import { StatTile } from '../../ui/StatTile'
import { entryTitle } from '../today/EntryRow'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { usePurposeSettings } from '../today/usePurpose'
import { useOwnWords } from '../today/useOwnWords'
import { EnergyCharts } from './EnergyCharts'
import { Evidence } from './Evidence'
import { NextStepsCard, NextStepsPage } from './NextSteps'
import { ReviewPeriod } from './ReviewPeriod'
import { WeekReview } from './WeekReview'

const RANGES = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: 'all', label: 'All', days: null },
] as const
type RangeKey = (typeof RANGES)[number]['key']

const CONTEXTS: readonly ContextKey[] = ['where', 'people', 'objects', 'part', 'weekday']

const NEED_MORE = `Shows after ${MIN_COUNT}+ entries.`

interface Data {
  /** Finished entries only: drafts stay out of every insight. */
  done: Entry[]
  byId: Map<string, Entry>
  days: Day[]
  reviews: Review[]
  /** What you wrote to carry into each week, by its Monday. */
  carry: Map<string, string>
  /** Next steps (v0.11), all of them. */
  steps: Step[]
}

/**
 * Insights: this week, put together for you, with what you're learning; patterns over time on their own page
 * (#/insights/patterns), and earlier weeks too (#/insights/week-…). Every line opens to the entries behind it.
 */
export function InsightsScreen({ sub }: { sub: string | null }) {
  const data = useLiveQuery(async (): Promise<Data> => {
    const [entries, days, reviews, weeks, steps] = await Promise.all([
      db.entries.toArray(),
      db.days.toArray(),
      db.reviews.toArray(),
      db.weeks.toArray(),
      db.steps.toArray(),
    ])
    const done = entries.filter(isDone)
    return { done, byId: new Map(done.map((e) => [e.id, e])), days, reviews, carry: new Map(weeks.map((w) => [w.id, w.carry])), steps }
  }, [])
  const own = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  // Render only once loaded, so nothing jumps under your finger.
  if (data === undefined || own === undefined || purpose === undefined) return <Loading />

  const open = (entry: Entry) => setSheet({ kind: 'open', entry })
  const week = sub?.match(/^week-(\d{4}-\d{2}-\d{2})$/)?.[1]
  return (
    <>
      {week ? (
        <WeekPage data={data} start={weekStart(week)} onOpen={open} />
      ) : sub === 'patterns' ? (
        <PatternsPage data={data} />
      ) : sub === 'steps' ? (
        <NextStepsPage steps={data.steps} entries={data.byId} />
      ) : sub === 'review' ? (
        <ReviewPeriod />
      ) : (
        <InsightsHome data={data} onOpen={open} />
      )}
      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </>
  )
}

function InsightsHome({ data, onOpen }: { data: Data; onOpen: (entry: Entry) => void }) {
  const thisWeek = weekStart(toDateKey(new Date()))
  const earlierWeeks = weeksWithEntries(data.done).filter((w) => w < thisWeek)
  // What you chose to remember from an entry, then takeaways from reviews before v0.8; newest first.
  const learnings = [
    ...data.done
      .filter((e) => e.intention?.kind === 'remember')
      .map((e) => ({ id: e.id, when: e.date, label: shortDay(e.date), text: e.intention?.text || entryTitle(e) })),
    ...data.reviews
      .filter((r) => r.completedAt !== null && r.takeaway.trim())
      .map((r) => ({ id: r.id, when: r.periodEnd, label: formatPeriod(r.periodStart, r.periodEnd), text: r.takeaway })),
  ].sort((a, b) => b.when.localeCompare(a.when))

  return (
    <>
      <h1>Insights</h1>
      <WeekReview summary={weekSummary(data.done, thisWeek, data.steps)} entries={data.byId} title="This week" carry={data.carry.get(thisWeek) ?? ''} onOpen={onOpen} />
      <NextStepsCard steps={data.steps} />
      {earlierWeeks.length ? (
        <details className="card earlier-weeks">
          <summary>Earlier weeks</summary>
          <ul className="plain-list compact">
            {earlierWeeks.map((w) => (
              <li key={w}>
                <a href={hashFor('insights', `week-${w}`)}>{formatRecentPeriod(w, addDays(w, 6))}</a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <nav className="list top-gap" aria-label="More insights">
        <a className="list-row" href={hashFor('insights', 'review')}>
          <span className="list-text">
            <span className="list-title">Review a period</span>
            <span className="list-status">Copy it for an AI chat, or review it with AI</span>
          </span>
          <span className="list-chevron" aria-hidden="true">
            ›
          </span>
        </a>
        <a className="list-row" href={hashFor('insights', 'patterns')}>
          <span className="list-text">
            <span className="list-title">Patterns over time</span>
            <span className="list-status">What gives and takes your energy, and more</span>
          </span>
          <span className="list-chevron" aria-hidden="true">
            ›
          </span>
        </a>
      </nav>

      <section className="card top-gap">
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
  )
}

function WeekPage({ data, start, onOpen }: { data: Data; start: string; onOpen: (entry: Entry) => void }) {
  return (
    <>
      <a className="back-link" href={hashFor('insights')}>
        ‹ Insights
      </a>
      <h1>Your week</h1>
      <WeekReview
        summary={weekSummary(data.done, start, data.steps)}
        entries={data.byId}
        title={formatRecentPeriod(start, addDays(start, 6))}
        carry={data.carry.get(start) ?? ''}
        onOpen={onOpen}
      />
    </>
  )
}

/** Patterns over a period: in what you've written, never causes, each row opening to its entries. */
function PatternsPage({ data }: { data: Data }) {
  const [range, setRange] = useState<RangeKey>('30')
  const [context, setContext] = useState<ContextKey>('where')
  const { done, byId } = data

  const today = toDateKey(new Date())
  const firstDate = done.reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null)
  const days = RANGES.find((r) => r.key === range)?.days ?? null
  const period: Period = days === null ? { start: firstDate ?? today, end: today } : { start: addDays(today, -(days - 1)), end: today }

  // Each measure only from the entries that answered it.
  const entries = inPeriod(done, period)
  const withEnergy = entries.filter(hasEnergy)
  const withEngagement = entries.filter(hasEngagement)
  const smallJoys = inPeriod(data.days, period).filter((d) => d.smallJoy)
  const totals = overview(done, period)
  const words = joyWords(smallJoys)
  const gives = energisers(withEnergy)
  const drains = drainers(withEnergy)
  const flow = flowFinder(withEngagement)
  const contextRows = contextStats(withEnergy, context)
  const company = aloneOrWithOthers(withEnergy)

  return (
    <>
      <a className="back-link" href={hashFor('insights')}>
        ‹ Insights
      </a>
      <h1>Patterns</h1>
      <p className="muted small">In what you've written, not causes.</p>
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
              {gives.length ? <EnergyRows rows={gives} direction="gives" entries={byId} /> : <p className="muted small">{NEED_MORE}</p>}
            </div>
            <div className="rank-group top-gap">
              <h2>Takes energy</h2>
              {drains.length ? <EnergyRows rows={drains} direction="takes" entries={byId} /> : <p className="muted small">{NEED_MORE}</p>}
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
                    <details className="week-line">
                      <summary>
                        <strong>{g.label}</strong>
                        <span className="muted">
                          {' '}
                          · {g.flow} of {g.count} {g.count === 1 ? 'time' : 'times'}
                        </span>
                      </summary>
                      <Evidence ids={g.entryIds.filter((id) => byId.get(id)?.flow)} entries={byId} />
                    </details>
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
            {contextRows.length ? <EnergyRows rows={contextRows} direction="context" entries={byId} /> : <p className="muted small">{NEED_MORE}</p>}
          </section>

          {company ? (
            <section className="card">
              <h2>Alone or with others</h2>
              <EnergyRows rows={company} direction="context" entries={byId} />
            </section>
          ) : null}

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
        </>
      )}
    </>
  )
}
