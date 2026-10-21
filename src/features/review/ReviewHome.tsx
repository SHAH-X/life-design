import { useId, useState } from 'react'
import { balancePicks, type Period } from '../../analysis/stats'
import { deleteReview, newReview, saveReview } from '../../db/repo'
import type { Review } from '../../db/types'
import { addDays, dayHeading, formatDateKey, formatPeriod, isDateKey, toDateKey } from '../../lib/dates'
import { navigate } from '../../lib/route'
import { describeReviewSchedule } from '../../reviews/period'
import { BALANCE_INFO } from '../../reviews/prompts'
import type { ReviewStatus } from '../../reviews/useReviewStatus'

type Choice = 'default' | '7' | '14' | '30' | 'custom'

/** "Alive: Work · Neglected: Play" (older 0–10 reviews: their highest and lowest). */
function picksLine(review: Review): string {
  const { alive, neglected } = balancePicks(review)
  return [alive ? `Alive: ${BALANCE_INFO[alive].label}` : '', neglected ? `Neglected: ${BALANCE_INFO[neglected].label}` : '']
    .filter(Boolean)
    .join(' · ')
}

export function ReviewHome({ status }: { status: ReviewStatus }) {
  const today = toDateKey(new Date())
  const fromId = useId()
  const toId = useId()
  const [choice, setChoice] = useState<Choice>('default')
  const [changing, setChanging] = useState(false)
  const [custom, setCustom] = useState<Period>(status.defaultPeriod)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const period: Period =
    choice === 'default'
      ? status.defaultPeriod
      : choice === 'custom'
        ? custom
        : { start: addDays(today, -(Number(choice) - 1)), end: today }

  const lastReview = status.completed[0]
  const defaultLabel = lastReview
    ? `Since your last review (${formatPeriod(status.defaultPeriod.start, status.defaultPeriod.end)})`
    : formatPeriod(status.defaultPeriod.start, status.defaultPeriod.end)

  async function start() {
    const review = await saveReview(newReview(period.start, period.end))
    navigate('review', review.id)
  }

  const nothingLogged = status.firstEntryDate === null

  return (
    <>
      <h1>Review</h1>

      {status.draft ? (
        <section className="card">
          <h2>Review in progress</h2>
          <p className="muted">{formatPeriod(status.draft.periodStart, status.draft.periodEnd)}</p>
          <div className="stack top-gap">
            <button type="button" className="primary wide" onClick={() => status.draft && navigate('review', status.draft.id)}>
              Continue review
            </button>
            {confirmDiscard ? (
              <div className="row">
                <span className="grow">Discard this review?</span>
                <button type="button" className="danger" onClick={() => status.draft && void deleteReview(status.draft.id)}>
                  Discard
                </button>
                <button type="button" onClick={() => setConfirmDiscard(false)}>
                  Keep
                </button>
              </div>
            ) : (
              <button type="button" className="link danger-text" onClick={() => setConfirmDiscard(true)}>
                Discard this review
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>{status.due ? 'Review due' : 'Next review'}</h2>
          {nothingLogged ? (
            <p className="muted">After a few days of logging, your first review starts here.</p>
          ) : (
            <p className="muted">
              {status.due || !status.next
                ? formatPeriod(period.start, period.end)
                : `${dayHeading(status.next, today)}, ${formatDateKey(status.next)} · ${describeReviewSchedule(status.schedule)}`}
            </p>
          )}
          {changing ? (
            <label className="inline-field top-gap">
              <span>Look back over</span>
              <select value={choice} disabled={nothingLogged} onChange={(e) => setChoice(e.target.value as Choice)}>
                <option value="default">{defaultLabel}</option>
                <option value="7">The last 7 days</option>
                <option value="14">The last 14 days</option>
                <option value="30">The last 30 days</option>
                <option value="custom">Choose dates…</option>
              </select>
            </label>
          ) : null}
          {choice === 'custom' ? (
            <div className="range-row top-gap">
              <div>
                <label className="inline-field" htmlFor={fromId}>
                  <span>From</span>
                </label>
                <input
                  id={fromId}
                  type="date"
                  value={custom.start}
                  max={custom.end}
                  onChange={(e) => isDateKey(e.target.value) && e.target.value <= custom.end && setCustom({ ...custom, start: e.target.value })}
                />
              </div>
              <div>
                <label className="inline-field" htmlFor={toId}>
                  <span>To</span>
                </label>
                <input
                  id={toId}
                  type="date"
                  value={custom.end}
                  min={custom.start}
                  max={today}
                  onChange={(e) =>
                    isDateKey(e.target.value) &&
                    e.target.value >= custom.start &&
                    e.target.value <= today &&
                    setCustom({ ...custom, end: e.target.value })
                  }
                />
              </div>
            </div>
          ) : null}
          <button type="button" className={`${status.due ? 'primary ' : ''}wide top-gap`} disabled={nothingLogged} onClick={() => void start()}>
            {status.due ? 'Start review' : 'Review now'}
          </button>
          {!changing && !nothingLogged ? (
            <p className="center top-gap">
              <button type="button" className="link" onClick={() => setChanging(true)}>
                Change period
              </button>
            </p>
          ) : null}
        </section>
      )}

      <section className="card">
        <h2>Past reviews</h2>
        {status.completed.length === 0 ? (
          <p className="muted small">None yet.</p>
        ) : (
          <ul className="review-list">
            {status.completed.map((r) => (
              <li key={r.id}>
                <button type="button" className="review-item" onClick={() => navigate('review', r.id)}>
                  <span className="review-period">{formatPeriod(r.periodStart, r.periodEnd)}</span>
                  {r.takeaway ? <span className="review-takeaway">{r.takeaway}</span> : null}
                  <span className="review-balance muted small">{picksLine(r)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
