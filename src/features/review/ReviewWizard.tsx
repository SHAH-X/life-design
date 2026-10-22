import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useRef, useState } from 'react'
import { db } from '../../db/db'
import { deleteReview, getOwnWords, getSetting, saveReview } from '../../db/repo'
import type { Answer, Day, Entry, Prototype, Review } from '../../db/types'
import type { OwnWord } from '../../domain/feelings'
import { formatDateKey, formatPeriod, toDateKey } from '../../lib/dates'
import { navigate } from '../../lib/route'
import { pickMoments } from '../../reviews/period'
import { ExperimentsStep } from './ExperimentsStep'
import { BalanceStep, FinishStep, GlanceStep, MomentsStep, prefillMoment, ReflectStep } from './ReviewSteps'

const STEPS = ['At a glance', 'Balance', 'Best and worst moments', 'Your reflection', 'Finish'] as const
/** With prototypes planned, the review follows up on them before your reflection (Phase 3b). */
const STEPS_WITH_EXPERIMENTS = ['At a glance', 'Balance', 'Best and worst moments', 'Experiments', 'Your reflection', 'Finish'] as const

interface Loaded {
  review: Review
  entries: Entry[]
  days: Day[]
  answers: Answer[]
  lastExportAt: number | null
  prototypes: Prototype[]
  own: OwnWord[]
}

export function ReviewWizard({ id }: { id: string }) {
  const loaded = useLiveQuery(async (): Promise<Loaded | null> => {
    const review = await db.reviews.get(id)
    if (!review) return null
    const [entries, days, answers, lastExportAt, prototypes, own] = await Promise.all([
      db.entries.where('date').between(review.periodStart, review.periodEnd, true, true).toArray(),
      db.days.where('date').between(review.periodStart, review.periodEnd, true, true).toArray(),
      db.answers.where('date').between(review.periodStart, review.periodEnd, true, true).toArray(),
      getSetting<number | null>('lastExportAt', null),
      db.prototypes.toArray(),
      getOwnWords(),
    ])
    return { review, entries, days, answers, lastExportAt, prototypes, own }
  }, [id])

  if (loaded === undefined) return <div className="loading" aria-busy="true" />
  if (loaded === null) {
    return (
      <>
        <h1>Review</h1>
        <section className="card">
          <p>This review no longer exists.</p>
          <button type="button" className="wide top-gap" onClick={() => navigate('review')}>
            Back to Review
          </button>
        </section>
      </>
    )
  }
  return <WizardBody key={id} {...loaded} />
}

function withMoments(review: Review, entries: readonly Entry[]): Review {
  if (review.best.entryId !== null || review.worst.entryId !== null || review.completedAt !== null) return review
  const { best, worst } = pickMoments(entries)
  return { ...review, best: best ? prefillMoment(best) : review.best, worst: worst ? prefillMoment(worst) : review.worst }
}

function WizardBody({ review: initial, entries, days, answers, lastExportAt, prototypes, own }: Loaded) {
  // The prototypes planned when the review opens; the steps are fixed then, so none disappears mid-review.
  const [experiments] = useState(() => prototypes.filter((p) => p.doneAt === null).map((p) => p.id))
  const steps = experiments.length ? STEPS_WITH_EXPERIMENTS : STEPS
  // The screen keeps its own copy (instant updates); saving is debounced in the background.
  const [review, setReview] = useState(() => withMoments(initial, entries))
  const [step, setStep] = useState(initial.completedAt !== null ? steps.length - 1 : 0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const latest = useRef(review)
  const dirty = useRef(review !== initial) // pre-selected moments still need saving
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    void saveReview(latest.current)
  }, [])

  useEffect(() => {
    flush() // save the pre-selected moments straight away
    return flush // and save anything pending when leaving
  }, [flush])

  function update(patch: Partial<Review>) {
    const next = { ...latest.current, ...patch }
    latest.current = next
    dirty.current = true
    setReview(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }

  function go(to: number) {
    flush()
    setStep(to)
    window.scrollTo(0, 0)
  }

  async function finish() {
    clearTimeout(timer.current)
    const done = { ...latest.current, completedAt: latest.current.completedAt ?? Date.now() }
    latest.current = done
    dirty.current = false
    setReview(done)
    await saveReview(done)
  }

  const period = { start: review.periodStart, end: review.periodEnd }
  const last = steps.length - 1
  const name = steps[step]
  const completed = review.completedAt !== null

  return (
    <>
      <div className="wizard-head">
        <button type="button" className="link" onClick={() => navigate('review')}>
          ‹ Reviews
        </button>
        <h1>{name}</h1>
        <p className="muted wizard-step">
          {step + 1} of {steps.length} · {formatPeriod(period.start, period.end)}
        </p>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {name === 'At a glance' ? <GlanceStep entries={entries} days={days} answers={answers} period={period} /> : null}
      {name === 'Balance' ? <BalanceStep review={review} onChange={update} /> : null}
      {name === 'Best and worst moments' ? <MomentsStep review={review} entries={entries} onChange={update} /> : null}
      {name === 'Experiments' ? <ExperimentsStep ids={experiments} prototypes={prototypes} own={own} /> : null}
      {name === 'Your reflection' ? <ReflectStep review={review} onChange={update} /> : null}
      {name === 'Finish' ? <FinishStep review={review} entries={entries} lastExportAt={lastExportAt} /> : null}

      {step === last && completed ? (
        <p className="success top-gap">✓ Review complete ({formatDateKey(toDateKey(new Date(review.completedAt ?? 0)))}).</p>
      ) : null}

      <div className="wizard-nav">
        <button type="button" disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </button>
        {step < last ? (
          <button type="button" className="primary" onClick={() => go(step + 1)}>
            Next
          </button>
        ) : completed ? (
          <button type="button" className="primary" onClick={() => navigate('review')}>
            Done
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void finish()}>
            Finish review
          </button>
        )}
      </div>

      {step === last ? (
        <div className="top-gap">
          {confirmDelete ? (
            <div className="row">
              <span className="grow">Delete this review?</span>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  clearTimeout(timer.current)
                  dirty.current = false
                  void deleteReview(review.id).then(() => navigate('review'))
                }}
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="link danger-text" onClick={() => setConfirmDelete(true)}>
              Delete this review
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}
