import { useId } from 'react'
import { formatSigned, type MomentGroup, momentGroups, overview, type Period } from '../../analysis/stats'
import { useDialogs } from '../../app/dialogs'
import { type AeiouNote, BALANCE_AREAS, type Balance, type Day, type Entry, type Review } from '../../db/types'
import { energyShort } from '../../domain/scales'
import { formatPeriod, shortDate, shortDay, wholeDaysBetween } from '../../lib/dates'
import { AEIOU, BALANCE_INFO, REFLECTION_PROMPT } from '../../reviews/prompts'
import { BalanceGauge } from '../../ui/BalanceGauge'
import { StatTile } from '../../ui/StatTile'
import { EnergyCharts } from '../insights/EnergyCharts'

function MomentLine({ group }: { group: MomentGroup }) {
  const { entry, count } = group
  return (
    <li className="moment-line">
      <span className="grow">
        <strong>{entry.activity}</strong>
        <span className="muted small"> · {count > 1 ? `${count} times` : shortDay(entry.date)}</span>
        {entry.note ? <span className="entry-note">{entry.note}</span> : null}
      </span>
      <span className={`badge energy e${entry.energy}`}>{energyShort(entry.energy)}</span>
    </li>
  )
}

export function GlanceStep({ entries, days, period }: { entries: readonly Entry[]; days: readonly Day[]; period: Period }) {
  const totals = overview(entries, period)
  const high = momentGroups(entries, 'high')
  const low = momentGroups(entries, 'low')
  const joys = [...days].filter((d) => d.smallJoy).sort((a, b) => a.date.localeCompare(b.date))

  if (entries.length === 0) {
    return (
      <section className="card">
        <p>Nothing was logged in {formatPeriod(period.start, period.end)}. You can still rate your balance and reflect.</p>
      </section>
    )
  }

  return (
    <>
      <div className="kpi-row">
        <StatTile label="Activities" value={String(totals.entries)} />
        <StatTile label="Days logged" value={String(totals.daysLogged)} sub={`of ${totals.days}`} />
        <StatTile label="Average energy" value={totals.avgEnergy === null ? '–' : formatSigned(totals.avgEnergy)} />
        <StatTile label="Flow moments" value={String(totals.flow)} />
      </div>
      <section className="card">
        <EnergyCharts entries={entries} period={period} />
      </section>
      <section className="card">
        <h2>Gave you the most energy</h2>
        {high.length ? (
          <ul className="plain-list">
            {high.map((g) => (
              <MomentLine key={g.entry.id} group={g} />
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing gave clear energy this time.</p>
        )}
      </section>
      <section className="card">
        <h2>Drained you the most</h2>
        {low.length ? (
          <ul className="plain-list">
            {low.map((g) => (
              <MomentLine key={g.entry.id} group={g} />
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing clearly drained you this time.</p>
        )}
      </section>
      <section className="card">
        <h2>Small joys</h2>
        {joys.length ? (
          <ul className="plain-list">
            {joys.map((d) => (
              <li key={d.date}>
                <span className="muted small">{shortDay(d.date)}</span> · {d.smallJoy}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">No small joys noted in this period.</p>
        )}
      </section>
    </>
  )
}

export function BalanceStep({ balance, previous, onChange }: { balance: Balance; previous: Balance | null; onChange: (b: Balance) => void }) {
  return (
    <section className="card">
      <p className="muted">How full is each part of your life right now? Rate each from empty (0) to full (10).</p>
      {BALANCE_AREAS.map((area) => (
        <BalanceGauge
          key={area}
          label={BALANCE_INFO[area].label}
          info={BALANCE_INFO[area].info}
          value={balance[area]}
          previous={previous?.[area] ?? null}
          onChange={(value) => onChange({ ...balance, [area]: value })}
        />
      ))}
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
  }
}

export function prefillMoment(entry: Entry | null): AeiouNote {
  return fillFromEntry({ entryId: null, activities: '', environments: '', interactions: '', objects: '', users: '' }, entry)
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
  const fieldId = useId()
  const entry = entries.find((e) => e.id === note.entryId) ?? null
  const options = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)

  return (
    <section className="card">
      <h2>{kind === 'best' ? 'Best moment' : 'Worst moment'}</h2>
      <label className="inline-field" htmlFor={selectId}>
        <span>{kind === 'best' ? 'What gave you the most energy?' : 'What drained you the most?'}</span>
      </label>
      <select id={selectId} value={note.entryId ?? ''} onChange={(e) => onChange(fillFromEntry(note, entries.find((x) => x.id === e.target.value) ?? null))}>
        <option value="">None</option>
        {options.map((e) => (
          <option key={e.id} value={e.id}>
            {shortDay(e.date)} · {e.activity} ({energyShort(e.energy)})
          </option>
        ))}
      </select>
      {entry ? (
        <>
          {entry.note ? <p className="entry-note top-gap">“{entry.note}”</p> : null}
          <p className="muted small top-gap">Zoom in with AEIOU. A few words each is plenty; skip any that don't apply.</p>
          {AEIOU.map((f) => (
            <div key={f.field}>
              <label className="field" htmlFor={`${fieldId}-${f.field}`}>
                <span>
                  {f.letter} · {f.label}
                </span>
              </label>
              <p className="field-help">{f.prompt}</p>
              <textarea
                id={`${fieldId}-${f.field}`}
                rows={2}
                maxLength={500}
                value={note[f.field]}
                onChange={(e) => onChange({ ...note, [f.field]: e.target.value })}
              />
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}

export function MomentsStep({ review, entries, onChange }: { review: Review; entries: readonly Entry[]; onChange: (patch: Partial<Review>) => void }) {
  if (entries.length === 0) {
    return (
      <section className="card">
        <p className="muted">No activities were logged in this period, so there are no moments to look at.</p>
      </section>
    )
  }
  return (
    <>
      <p className="muted">Look closely at one high and one low point to see why they felt that way.</p>
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
      <label className="field" htmlFor={reflectionId}>
        <span>What do you notice?</span>
      </label>
      <p className="field-help">{REFLECTION_PROMPT}</p>
      <textarea id={reflectionId} rows={6} maxLength={4000} value={review.reflection} onChange={(e) => onChange({ reflection: e.target.value })} />
      <label className="field" htmlFor={takeawayId}>
        <span>One thing to carry forward</span>
      </label>
      <p className="field-help">It's collected in Insights → What I'm learning.</p>
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
        <h2>{formatPeriod(review.periodStart, review.periodEnd)}</h2>
        <ul className="plain-list">
          <li>
            <strong>Balance:</strong> {BALANCE_AREAS.map((a) => `${BALANCE_INFO[a].label} ${review.balance[a] ?? '–'}`).join(' · ')}
          </li>
          <li>
            <strong>Best moment:</strong> {name(review.best)}
          </li>
          <li>
            <strong>Worst moment:</strong> {name(review.worst)}
          </li>
          <li>
            <strong>Takeaway:</strong> {review.takeaway || '–'}
          </li>
        </ul>
      </section>
      {backupDue ? (
        <section className="notice warn">
          <p>
            <strong>Back up while you're here.</strong>{' '}
            {lastExportAt === null ? 'Nothing is backed up yet.' : `Last backup: ${shortDate(lastExportAt)}.`}
          </p>
          <button type="button" className="primary" onClick={() => open('export')}>
            Back up now
          </button>
        </section>
      ) : null}
    </>
  )
}
