import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { contextHighlights, drainers, energisers, flowFinder, inPeriod, joyWords } from '../../analysis/stats'
import { weekStart, weeksWithEntries, weekSummary } from '../../analysis/week'
import { db } from '../../db/db'
import { hasEnergy, hasEngagement, isDone, loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import type { Day, Entry, Review, Step } from '../../db/types'
import { times } from '../../domain/feelings'
import { addDays, formatPeriod, formatRecentPeriod, shortDay, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { Loading } from '../../ui/Loading'
import { entryTitle } from '../today/EntryRow'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { usePurposeSettings } from '../today/usePurpose'
import { useOwnWords } from '../today/useOwnWords'
import { Evidence } from './Evidence'
import { NextStepsCard, NextStepsPage } from './NextSteps'
import { PatternLines } from './PatternLines'
import { ReviewPeriod } from './ReviewPeriod'
import { WeekReview } from './WeekReview'

/** Patterns look at the last 30 days: what's true for you now. Review a period takes any dates. */
const PATTERN_DAYS = 30
/** What you're learning shows its newest few; the rest are a tap away. */
const LEARNING_SHOWN = 3

interface Data {
  /** Finished entries only: drafts stay out of every insight. */
  done: Entry[]
  byId: Map<string, Entry>
  days: Day[]
  reviews: Review[]
  /** What you wrote to carry into each week, by its Monday (the box until v0.13; shown read-only now). */
  carry: Map<string, string>
  /** Next steps (v0.11), all of them. */
  steps: Step[]
}

interface Learning {
  id: string
  when: string
  label: string
  text: string
  /** The entry it was kept from; takeaways from reviews before v0.8 have none. */
  entry: Entry | null
}

/**
 * Insights (v0.13): one page that answers in order: how your week went, what gives and uses up your energy over the
 * last 30 days, what you're learning and doing, then a way to look back. Nothing to choose or fill in: the app shows
 * what has something to say, and every line opens to the entries behind it. Earlier weeks (#/insights/weeks,
 * #/insights/week-…), all you're learning (#/insights/learning), next steps and Review a period are their own pages;
 * old links (#/insights/patterns) open Insights.
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
      ) : sub === 'weeks' ? (
        <WeeksPage data={data} />
      ) : sub === 'learning' ? (
        <LearningPage data={data} onOpen={open} />
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

/** What you chose to remember from an entry, then takeaways from reviews before v0.8; newest first. */
function learningsOf(data: Data): Learning[] {
  return [
    ...data.done
      .filter((e) => e.intention?.kind === 'remember')
      .map((e) => ({ id: e.id, when: e.date, label: shortDay(e.date), text: e.intention?.text || entryTitle(e), entry: e })),
    ...data.reviews
      .filter((r) => r.completedAt !== null && r.takeaway.trim())
      .map((r) => ({ id: r.id, when: r.periodEnd, label: formatPeriod(r.periodStart, r.periodEnd), text: r.takeaway, entry: null })),
  ].sort((a, b) => b.when.localeCompare(a.when))
}

function InsightsHome({ data, onOpen }: { data: Data; onOpen: (entry: Entry) => void }) {
  const today = toDateKey(new Date())
  const thisWeek = weekStart(today)
  const earlier = weeksWithEntries(data.done).some((w) => w < thisWeek)
  const learnings = learningsOf(data)
  const doingId = useId()

  return (
    <>
      <h1>Insights</h1>
      <WeekReview summary={weekSummary(data.done, thisWeek, data.steps)} entries={data.byId} title="This week" carry={data.carry.get(thisWeek) ?? ''} onOpen={onOpen} />
      <LastDays data={data} today={today} onOpen={onOpen} />

      <section aria-labelledby={doingId}>
        <h2 id={doingId} className="week-title">
          Learning and doing
        </h2>
        <NextStepsCard steps={data.steps} />
        <section className="card week-card">
          <h3>What you're learning</h3>
          {learnings.length ? (
            <LearningList learnings={learnings.slice(0, LEARNING_SHOWN)} onOpen={onOpen} />
          ) : (
            <p className="muted small">What you choose to remember lands here.</p>
          )}
          {learnings.length > LEARNING_SHOWN ? (
            <a className="small-link" href={hashFor('insights', 'learning')}>
              All {learnings.length} ›
            </a>
          ) : null}
        </section>
      </section>

      <nav className="list top-gap" aria-label="Look back">
        {earlier ? (
          <a className="list-row" href={hashFor('insights', 'weeks')}>
            <span className="list-text">
              <span className="list-title">Earlier weeks</span>
            </span>
            <span className="list-chevron" aria-hidden="true">
              ›
            </span>
          </a>
        ) : null}
        <a className="list-row" href={hashFor('insights', 'review')}>
          <span className="list-text">
            <span className="list-title">Review a period</span>
            <span className="list-status">Copy it for an AI chat, or review it with AI</span>
          </span>
          <span className="list-chevron" aria-hidden="true">
            ›
          </span>
        </a>
      </nav>
    </>
  )
}

/**
 * The last 30 days, in words: what gives and uses up your energy, when time flew, the places, people and times that
 * usually went one way, and small joys that came back. Only what has 3+ entries behind it, and each line opens to them.
 */
function LastDays({ data, today, onOpen }: { data: Data; today: string; onOpen: (entry: Entry) => void }) {
  const headingId = useId()
  const period = { start: addDays(today, -(PATTERN_DAYS - 1)), end: today }
  // Each measure only from the entries that answered it.
  const entries = inPeriod(data.done, period)
  const withEnergy = entries.filter(hasEnergy)
  const gives = energisers(withEnergy)
  const drains = drainers(withEnergy)
  const flow = flowFinder(entries.filter(hasEngagement))
  const contexts = contextHighlights(
    withEnergy,
    [...gives, ...drains].map((g) => g.entryIds),
  )
  const joys = joyWords(inPeriod(data.days, period).filter((d) => d.smallJoy))
  const anything = gives.length + drains.length + flow.length + contexts.length + joys.length > 0

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        Last {PATTERN_DAYS} days
      </h2>
      <p className="muted small week-period">In what you've written, not causes.</p>
      {anything ? null : (
        <div className="card">
          <p className="muted">Shows once something comes up 3 times or more.</p>
        </div>
      )}
      {gives.length ? (
        <div className="card week-card">
          <h3>Gives you energy</h3>
          <PatternLines rows={gives} direction="gives" entries={data.byId} onOpen={onOpen} />
        </div>
      ) : null}
      {drains.length ? (
        <div className="card week-card">
          <h3>Uses up your energy</h3>
          <PatternLines rows={drains} direction="takes" entries={data.byId} onOpen={onOpen} />
        </div>
      ) : null}
      {flow.length ? (
        <div className="card week-card">
          <h3>When time flew</h3>
          <ul className="plain-list compact">
            {flow.map((g) => (
              <li key={g.label}>
                <details className="week-line">
                  <summary>
                    <span>{g.label}</span>{' '}
                    <span className="muted small">
                      · {g.flow} of {g.count} {g.count === 1 ? 'time' : 'times'}
                    </span>
                  </summary>
                  <Evidence ids={g.entryIds.filter((id) => data.byId.get(id)?.flow)} entries={data.byId} onOpen={onOpen} />
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {contexts.length ? (
        <div className="card week-card">
          <h3>Places, people and times</h3>
          <PatternLines rows={contexts} direction="context" entries={data.byId} onOpen={onOpen} />
        </div>
      ) : null}
      {joys.length ? (
        <div className="card week-card">
          <h3>Small joys that came back</h3>
          <div className="chip-row">
            {joys.map((w) => (
              <span key={w.word} className="chip static joy">
                {w.word} <span className="muted">· {times(w.count)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

/** What you're learning, newest first; one kept from an entry opens that entry. */
function LearningList({ learnings, onOpen }: { learnings: readonly Learning[]; onOpen: (entry: Entry) => void }) {
  return (
    <ul className="plain-list">
      {learnings.map((l) => {
        const words = (
          <>
            <span className="muted small">{l.label}</span>
            <br />
            {l.text}
          </>
        )
        const { entry } = l
        return (
          <li key={l.id}>
            {entry ? (
              <button type="button" className="line-button" onClick={() => onOpen(entry)}>
                <span>{words}</span>
              </button>
            ) : (
              words
            )}
          </li>
        )
      })}
    </ul>
  )
}

function LearningPage({ data, onOpen }: { data: Data; onOpen: (entry: Entry) => void }) {
  const learnings = learningsOf(data)
  return (
    <>
      <a className="back-link" href={hashFor('insights')}>
        ‹ Insights
      </a>
      <h1>What you're learning</h1>
      <section className="card">
        {learnings.length ? <LearningList learnings={learnings} onOpen={onOpen} /> : <p className="muted small">What you choose to remember lands here.</p>}
      </section>
    </>
  )
}

/** Every earlier week with entries, newest first; each opens its recap. */
function WeeksPage({ data }: { data: Data }) {
  const thisWeek = weekStart(toDateKey(new Date()))
  const weeks = weeksWithEntries(data.done).filter((w) => w < thisWeek)
  return (
    <>
      <a className="back-link" href={hashFor('insights')}>
        ‹ Insights
      </a>
      <h1>Earlier weeks</h1>
      {weeks.length ? (
        <nav className="list" aria-label="Earlier weeks">
          {weeks.map((w) => {
            const summary = weekSummary(data.done, w)
            return (
              <a key={w} className="list-row" href={hashFor('insights', `week-${w}`)}>
                <span className="list-text">
                  <span className="list-title">{formatRecentPeriod(w, addDays(w, 6))}</span>
                  <span className="list-status">
                    {summary.entries} {summary.entries === 1 ? 'entry' : 'entries'} on {summary.days} {summary.days === 1 ? 'day' : 'days'}
                  </span>
                </span>
                <span className="list-chevron" aria-hidden="true">
                  ›
                </span>
              </a>
            )
          })}
        </nav>
      ) : (
        <p className="muted small">Weeks before this one show here.</p>
      )}
    </>
  )
}

function WeekPage({ data, start, onOpen }: { data: Data; start: string; onOpen: (entry: Entry) => void }) {
  return (
    <>
      <a className="back-link" href={hashFor('insights', 'weeks')}>
        ‹ Earlier weeks
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
