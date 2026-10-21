import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { NEEDS, PLAN_INTRO, PLAN_SLOTS, resumeStep } from '../../domain/lifeDesign'
import { hashFor } from '../../lib/route'

/** The three plans as cards, which are also the side-by-side comparison: title, how each feels, what each needs. */
export function OdysseyPage() {
  const plans = useLiveQuery(() => db.odysseyPlans.toArray(), [])
  if (plans === undefined) return <div className="loading" aria-busy="true" />

  return (
    <>
      <a className="back-link" href={hashFor('design')}>
        ‹ Life Design
      </a>
      <h1>Odyssey Plans</h1>
      <p className="muted">{PLAN_INTRO}</p>
      <ul className="plan-cards">
        {PLAN_SLOTS.map((s) => {
          const plan = plans.find((p) => p.slot === s.slot)
          const written = plan !== undefined && plan.writtenAt !== null
          const started = plan !== undefined && !written && resumeStep(plan) > 0
          const needs = plan ? NEEDS.filter((n) => plan.needs.includes(n.value)).map((n) => n.label.toLowerCase()) : []
          return (
            <li key={s.slot}>
              <a className="plan-card" href={hashFor('design', `plan-${s.slot}`)}>
                <span className="plan-slot">
                  {s.slot} · {s.label}
                </span>
                <span className="plan-title">{plan?.title.trim() || (written ? 'Untitled' : 'Not written yet')}</span>
                {plan?.feelings.length ? <span className="plan-feelings">{plan.feelings.map((w) => w.toLowerCase()).join(' · ')}</span> : null}
                {needs.length ? <span className="plan-needs">Needs: {needs.join(', ')}</span> : null}
                {!written ? <span className="plan-action">{started ? 'Continue ›' : 'Write it ›'}</span> : null}
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
