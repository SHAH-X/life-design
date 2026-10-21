import { useId } from 'react'
import { type MomentGroup, momentGroups, overview, type Period } from '../../analysis/stats'
import { useDialogs } from '../../app/dialogs'
import { type AeiouNote, type Answer, BALANCE_AREAS, type BalanceArea, type Day, type Entry, type Review } from '../../db/types'
import { energyEdge, overallEnergyWord, times, wordsFor } from '../../domain/feelings'
import { formatPeriod, shortDate, shortDay, wholeDaysBetween } from '../../lib/dates'
import { AEIOU, ALIVE_QUESTION, BALANCE_DEFINITIONS, BALANCE_INFO, MOMENT_QUESTIONS, NEGLECTED_QUESTION, REFLECTION_PROMPT } from '../../reviews/prompts'
import { Question } from '../../ui/Question'
import { StatTile } from '../../ui/StatTile'
import { EnergyCharts } from '../insights/EnergyCharts'

/** How the moment left you, in the words chosen (or read from older entries' values). */
function LeftYou({ entry }: { entry: Entry }) {
  const { after } = wordsFor(entry)
  return <span className="entry-feelings">{after.map((word) => word.toLowerCase()).join(' · ')}</span>
}

function MomentLine({ group }: { group: MomentGroup }) {
  const { entry, count } = group
  return (
    <li className="moment-line" data-energy={energyEdge(entry.energy)}>
      <span className="grow">
        <strong>{entry.activity}</strong>
        <span className="muted small"> · {count > 1 ? times(count) : shortDay(entry.date)}</span>
        <LeftYou entry={entry} />
        {entry.note ? <span className="entry-note">{entry.note}</span> : null}
      </span>
    </li>
  )
}

export function GlanceStep({
  entries,
  days,
  answers,
  period,
}: {
  entries: readonly Entry[]
  days: readonly Day[]
  answers: readonly Answer[]
  period: Period
}) {
  const totals = overview(entries, period)
  const high = momentGroups(entries, 'high')
  const low = momentGroups(entries, 'low')
  const joys = [...days].filter((d) => d.smallJoy).sort((a, b) => a.date.localeCompare(b.date))
  const answered = [...answers].filter((a) => a.text.trim()).sort((a, b) => a.date.localeCompare(b.date))

  if (entries.length === 0) {
    return (
      <section className="card">
        <p>Nothing logged in {formatPeriod(period.start, period.end)}.</p>
      </section>
    )
  }

  return (
    <>
      <div className="kpi-row">
        <StatTile label="Logged on" value={`${totals.daysLogged} ${totals.daysLogged === 1 ? 'day' : 'days'}`} />
        <StatTile label="Energy" value={overallEnergyWord(entries.map((e) => e.energy)) ?? '–'} words />
        <StatTile label="Time flew" value={totals.flow ? times(totals.flow) : 'not yet'} />
      </div>
      <section className="card">
        <EnergyCharts entries={entries} period={period} />
      </section>
      <section className="card">
        <h2>Gave energy</h2>
        {high.length ? (
          <ul className="plain-list">
            {high.map((g) => (
              <MomentLine key={g.entry.id} group={g} />
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing this time.</p>
        )}
        <h2 className="top-gap">Took energy</h2>
        {low.length ? (
          <ul className="plain-list">
            {low.map((g) => (
              <MomentLine key={g.entry.id} group={g} />
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing this time.</p>
        )}
      </section>
      {joys.length ? (
        <section className="card">
          <h2>Small joys</h2>
          <ul className="plain-list">
            {joys.map((d) => (
              <li key={d.date}>
                <span className="muted small">{shortDay(d.date)}</span> · {d.smallJoy}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {answered.length ? (
        <section className="card">
          <h2>Evening answers</h2>
          <ul className="plain-list">
            {answered.map((a) => (
              <li key={a.id}>
                <span className="muted small">
                  {shortDay(a.date)} · {a.question}
                </span>
                <br />
                {a.text}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

export function BalanceStep({ review, onChange }: { review: Review; onChange: (patch: Partial<Review>) => void }) {
  const aliveId = useId()
  const neglectedId = useId()
  const whyId = useId()

  // Tap again to clear; one area can't be both most alive and most neglected.
  const pick = (key: 'alive' | 'neglected', area: BalanceArea) => {
    const other = key === 'alive' ? 'neglected' : 'alive'
    const value = review[key] === area ? null : area
    onChange(value !== null && review[other] === area ? { [key]: value, [other]: null } : { [key]: value })
  }

  const areas = (key: 'alive' | 'neglected', labelledBy: string) => (
    <div role="group" aria-labelledby={labelledBy} className="chip-row">
      {BALANCE_AREAS.map((area) => (
        <button key={area} type="button" className="chip" aria-pressed={review[key] === area} onClick={() => pick(key, area)}>
          {BALANCE_INFO[area].label}
        </button>
      ))}
    </div>
  )

  return (
    <section className="card">
      <Question id={aliveId} info={BALANCE_DEFINITIONS} infoLabel="What do these mean?">
        {ALIVE_QUESTION}
      </Question>
      {areas('alive', aliveId)}
      <p className="question-text" id={neglectedId}>
        {NEGLECTED_QUESTION}
      </p>
      {areas('neglected', neglectedId)}
      <label className="question-text" htmlFor={whyId}>
        Why?
      </label>
      <textarea
        id={whyId}
        rows={3}
        maxLength={2000}
        placeholder="Optional"
        value={review.balanceWhy}
        onChange={(e) => onChange({ balanceWhy: e.target.value })}
      />
    </section>
  )
}

function fillFromEntry(note: AeiouNote, entry: Entry | null): AeiouNote {
  // Keep anything already typed; fill empty fields from the entry's chips.
  return {
    entryId: entry?.id ?? null,
    activities: note.activities,
    environments: note.environments || (entry?.where.join(', ') ?? ''),
    interactions: note.interactions,
    objects: note.objects || (entry?.objects.join(', ') ?? ''),
    users: note.users || (entry?.people.join(', ') ?? ''),
    why: note.why,
  }
}

export function prefillMoment(entry: Entry | null): AeiouNote {
  return fillFromEntry({ entryId: null, activities: '', environments: '', interactions: '', objects: '', users: '', why: '' }, entry)
}

function MomentEditor({
  kind,
  note,
  entries,
  onChange,
}: {
  kind: 'best' | 'worst'
  note: AeiouNote
  entries: readonly Entry[]
  onChange: (note: AeiouNote) => void
}) {
  const selectId = useId()
  const whyId = useId()
  const fieldId = useId()
  const entry = entries.find((e) => e.id === note.entryId) ?? null
  const options = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const questions = MOMENT_QUESTIONS[kind]

  return (
    <section className="card">
      <label className="question-text" htmlFor={selectId}>
        {questions.pick}
      </label>
      <select id={selectId} value={note.entryId ?? ''} onChange={(e) => onChange(fillFromEntry(note, entries.find((x) => x.id === e.target.value) ?? null))}>
        <option value="">None</option>
        {options.map((e) => (
          <option key={e.id} value={e.id}>
            {shortDay(e.date)} · {e.activity} · {wordsFor(e).after.join(', ').toLowerCase()}
          </option>
        ))}
      </select>
      {entry ? (
        <>
          {entry.note ? <p className="entry-note top-gap">“{entry.note}”</p> : null}
          <label className="question-text" htmlFor={whyId}>
            {questions.why}
          </label>
          <textarea id={whyId} rows={3} maxLength={1000} value={note.why} onChange={(e) => onChange({ ...note, why: e.target.value })} />
          <details className="more-ways">
            <summary>Zoom in with AEIOU</summary>
            {AEIOU.map((f) => (
              <div key={f.field}>
                <label className="field" htmlFor={`${fieldId}-${f.field}`}>
                  <span>
                    {f.letter} · {f.label}
                  </span>
                </label>
                <textarea
                  id={`${fieldId}-${f.field}`}
                  rows={2}
                  maxLength={500}
                  placeholder={f.prompt}
                  value={note[f.field]}
                  onChange={(e) => onChange({ ...note, [f.field]: e.target.value })}
                />
              </div>
            ))}
          </details>
        </>
      ) : null}
    </section>
  )
}

export function MomentsStep({ review, entries, onChange }: { review: Review; entries: readonly Entry[]; onChange: (patch: Partial<Review>) => void }) {
  if (entries.length === 0) {
    return (
      <section className="card">
        <p className="muted">Nothing was logged in this period.</p>
      </section>
    )
  }
  return (
    <>
      <MomentEditor kind="best" note={review.best} entries={entries} onChange={(best) => onChange({ best })} />
      <MomentEditor kind="worst" note={review.worst} entries={entries} onChange={(worst) => onChange({ worst })} />
    </>
  )
}

export function ReflectStep({ review, onChange }: { review: Review; onChange: (patch: Partial<Review>) => void }) {
  const reflectionId = useId()
  const takeawayId = useId()
  return (
    <section className="card">
      <label className="question-text" htmlFor={reflectionId}>
        What do you notice?
      </label>
      <textarea
        id={reflectionId}
        rows={6}
        maxLength={4000}
        placeholder={REFLECTION_PROMPT}
        value={review.reflection}
        onChange={(e) => onChange({ reflection: e.target.value })}
      />
      <label className="question-text" htmlFor={takeawayId}>
        One thing to carry forward?
      </label>
      <input
        id={takeawayId}
        maxLength={200}
        placeholder="e.g. Protect mornings for deep work"
        value={review.takeaway}
        onChange={(e) => onChange({ takeaway: e.target.value })}
      />
    </section>
  )
}

export function FinishStep({
  review,
  entries,
  lastExportAt,
}: {
  review: Review
  entries: readonly Entry[]
  lastExportAt: number | null
}) {
  const { open } = useDialogs()
  const name = (note: AeiouNote) => entries.find((e) => e.id === note.entryId)?.activity ?? '–'
  const backupDue = lastExportAt === null || wholeDaysBetween(lastExportAt, Date.now()) >= 7

  return (
    <>
      <section className="card">
        <ul className="plain-list">
          <li>
            <strong>Most alive:</strong> {review.alive ? BALANCE_INFO[review.alive].label : '–'} · <strong>Most neglected:</strong>{' '}
            {review.neglected ? BALANCE_INFO[review.neglected].label : '–'}
          </li>
          <li>
            <strong>Best:</strong> {name(review.best)}
          </li>
          <li>
            <strong>Worst:</strong> {name(review.worst)}
          </li>
          <li>
            <strong>Takeaway:</strong> {review.takeaway || '–'}
          </li>
        </ul>
      </section>
      {backupDue ? (
        <section className="notice warn">
          <p>{lastExportAt === null ? 'Nothing is backed up yet.' : `Last backup: ${shortDate(lastExportAt)}.`}</p>
          <button type="button" className="primary" onClick={() => open('export')}>
            Back up
          </button>
        </section>
      ) : null}
    </>
  )
}
