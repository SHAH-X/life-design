import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { db } from '../../db/db'
import { V1_TIMESTAMP } from '../../db/importV1'
import type { PlanVersion, Views } from '../../db/types'
import { NEEDS, PLAN_QUESTION, PLAN_STEPS, slotOf } from '../../domain/lifeDesign'
import { formatDateKey, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'

/** "12 Oct 2026", or "From the v1 app" for plans brought over from the earlier app (which had no dates). */
export function versionDate(savedAt: number): string {
  return savedAt <= V1_TIMESTAMP ? 'From the v1 app' : formatDateKey(toDateKey(new Date(savedAt)))
}

export function PlanVersionList({ versions }: { versions: readonly PlanVersion[] }) {
  if (versions.length === 0) return null
  return (
    <section className="card">
      <h2>Earlier versions</h2>
      <ul className="plain-list">
        {[...versions]
          .sort((a, b) => b.savedAt - a.savedAt)
          .map((v) => (
            <li key={v.id}>
              <a href={hashFor('design', `plan-version-${v.id}`)}>{versionDate(v.savedAt)}</a>
            </li>
          ))}
      </ul>
    </section>
  )
}

export function ViewsVersionList({ versions }: { versions: readonly Views[] }) {
  if (versions.length === 0) return null
  return (
    <section className="card">
      <h2>Earlier versions</h2>
      <ul className="plain-list">
        {versions.map((v) => (
          <li key={v.id}>
            <a href={hashFor('design', `views-version-${v.id}`)}>{versionDate(v.updatedAt)}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="question-text">{title}</h2>
      {children}
    </>
  )
}

/** An earlier version of a plan, read-only. */
export function PlanVersionPage({ id }: { id: string }) {
  const version = useLiveQuery(() => db.planVersions.get(id).then((v) => v ?? null), [id])
  if (version === undefined) return <div className="loading" aria-busy="true" />
  if (version === null) {
    return (
      <>
        <a className="back-link" href={hashFor('design', 'odyssey')}>
          ‹ Odyssey Plans
        </a>
        <p className="muted">This version no longer exists.</p>
      </>
    )
  }
  const { plan } = version
  const slot = slotOf(plan.slot)
  return (
    <>
      <a className="back-link" href={hashFor('design', `plan-${plan.slot}`)}>
        ‹ {slot.label}
      </a>
      <h1>{plan.title.trim() || slot.label}</h1>
      <p className="muted">Version from {versionDate(version.savedAt).replace('From the v1 app', 'the v1 app')}</p>
      <section className="card read-only">
        {plan.description ? <Section title={PLAN_STEPS[0]}>{<p>{plan.description}</p>}</Section> : null}
        {plan.years.some((y) => y.length) ? (
          <Section title={PLAN_STEPS[1]}>
            <ul className="plain-list">
              {plan.years.map((items, i) =>
                items.length ? (
                  <li key={i}>
                    <span className="muted small">Year {i + 1}</span> · {items.join(' · ')}
                  </li>
                ) : null,
              )}
            </ul>
          </Section>
        ) : null}
        {plan.questions.length ? (
          <Section title={PLAN_STEPS[3]}>
            <ul className="plain-list">
              {plan.questions.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </Section>
        ) : null}
        {plan.feelings.length ? (
          <Section title={PLAN_QUESTION}>
            <p>{plan.feelings.map((w) => w.toLowerCase()).join(' · ')}</p>
          </Section>
        ) : null}
        {plan.needs.length || plan.needsNote ? (
          <Section title={PLAN_STEPS[5]}>
            {plan.needs.length ? (
              <p>Needs: {NEEDS.filter((n) => plan.needs.includes(n.value)).map((n) => n.label.toLowerCase()).join(', ')}</p>
            ) : null}
            {plan.needsNote ? <p>{plan.needsNote}</p> : null}
          </Section>
        ) : null}
        {plan.fit ? <Section title={PLAN_STEPS[6]}>{<p>{plan.fit}</p>}</Section> : null}
      </section>
    </>
  )
}

/** An earlier version of Workview & Lifeview, read-only. */
export function ViewsVersionPage({ id }: { id: string }) {
  const views = useLiveQuery(() => db.views.get(id).then((v) => v ?? null), [id])
  if (views === undefined) return <div className="loading" aria-busy="true" />
  return (
    <>
      <a className="back-link" href={hashFor('design', 'views')}>
        ‹ Workview & Lifeview
      </a>
      {views === null ? (
        <p className="muted">This version no longer exists.</p>
      ) : (
        <>
          <h1>Workview & Lifeview</h1>
          <p className="muted">Version from {versionDate(views.updatedAt)}</p>
          <section className="card read-only">
            {views.workview ? <Section title="Workview">{<p className="views-text">{views.workview}</p>}</Section> : null}
            {views.lifeview ? <Section title="Lifeview">{<p className="views-text">{views.lifeview}</p>}</Section> : null}
            {views.coherence ? <Section title="How they fit">{<p className="views-text">{views.coherence}</p>}</Section> : null}
          </section>
        </>
      )}
    </>
  )
}
