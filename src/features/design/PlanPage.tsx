import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { getOwnWords, latestViews, savePlan, type ViewsText } from '../../db/repo'
import type { OdysseyPlan, PlanVersion } from '../../db/types'
import type { OwnWord } from '../../domain/feelings'
import { emptyPlan, PLAN_QUESTION, PLAN_STEPS, type PlanSlot, resumeStep, slotOf } from '../../domain/lifeDesign'
import { hashFor, navigate } from '../../lib/route'
import { useSavedValue } from '../../ui/useSavedValue'
import { PlanVersionList } from './EarlierVersions'
import { AboutField, FeelingsField, FitField, NeedsField, QuestionsField, TitleField, YearsField } from './PlanFields'

/** One Odyssey Plan: the guided flow the first time, then everything on one page. */
export function PlanPage({ slot }: { slot: PlanSlot }) {
  const loaded = useLiveQuery(async () => {
    const [plan, versions, views, own] = await Promise.all([
      db.odysseyPlans.get(`plan-${slot}`),
      db.planVersions.where('planId').equals(`plan-${slot}`).toArray(),
      latestViews(),
      getOwnWords(),
    ])
    return { plan: plan ?? null, versions, views: views ?? null, own }
  }, [slot])

  // Render only once loaded, so nothing jumps under your finger.
  if (loaded === undefined) return <div className="loading" aria-busy="true" />
  const plan = loaded.plan ?? emptyPlan(slot, Date.now())
  return plan.writtenAt === null ? (
    <PlanFlow key={`flow-${slot}`} initial={plan} views={loaded.views} own={loaded.own} />
  ) : (
    <PlanEditor key={`edit-${slot}`} initial={plan} versions={loaded.versions} views={loaded.views} own={loaded.own} />
  )
}

interface Props {
  initial: OdysseyPlan
  views: ViewsText | null
  own: readonly OwnWord[]
}

/** First time: one question per screen, saved as you go, so it can be left and picked up again. */
function PlanFlow({ initial, views, own }: Props) {
  const headingId = useId()
  const { value: plan, update, flush } = useSavedValue(initial, (p) => savePlan(p))
  const [step, setStep] = useState(() => resumeStep(initial))
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const last = PLAN_STEPS.length - 1

  function go(to: number) {
    flush()
    setStep(to)
    window.scrollTo(0, 0)
  }

  async function finish() {
    const done = { ...plan, writtenAt: Date.now() }
    update(() => done)
    flush()
    await savePlan(done)
    navigate('design', 'odyssey')
  }

  const fields = [
    <AboutField key="about" plan={plan} update={update} labelledBy={headingId} />,
    <YearsField key="years" plan={plan} update={update} />,
    <TitleField key="title" plan={plan} update={update} labelledBy={headingId} />,
    <QuestionsField key="questions" plan={plan} update={update} />,
    <FeelingsField key="feelings" plan={plan} update={update} labelledBy={headingId} own={ownWords} onOwn={(w) => setOwnWords((o) => [...o, w])} />,
    <NeedsField key="needs" plan={plan} update={update} labelledBy={headingId} />,
    <FitField key="fit" plan={plan} update={update} labelledBy={headingId} views={views} />,
  ]

  return (
    <>
      <div className="wizard-head">
        <a className="back-link" href={hashFor('design', 'odyssey')}>
          ‹ Odyssey Plans
        </a>
        <h1 id={headingId}>{PLAN_STEPS[step]}</h1>
        <p className="muted wizard-step">
          {step + 1} of {PLAN_STEPS.length} · {slotOf(plan.slot).label}
        </p>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / PLAN_STEPS.length) * 100}%` }} />
        </div>
      </div>
      <section className="card">{fields[step]}</section>
      <div className="wizard-nav">
        <button type="button" disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </button>
        {step < last ? (
          <button type="button" className="primary" onClick={() => go(step + 1)}>
            Next
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void finish()}>
            Finish
          </button>
        )}
      </div>
    </>
  )
}

/** After the first time: everything on one page, saved as you edit. Earlier versions are kept automatically. */
function PlanEditor({ initial, versions, views, own }: Props & { versions: readonly PlanVersion[] }) {
  const ids = { about: useId(), title: useId(), feelings: useId(), needs: useId(), fit: useId() }
  const { value: plan, update } = useSavedValue(initial, (p) => savePlan(p))
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const slot = slotOf(plan.slot)

  return (
    <>
      <a className="back-link" href={hashFor('design', 'odyssey')}>
        ‹ Odyssey Plans
      </a>
      <h1>{plan.title.trim() || slot.label}</h1>
      <p className="muted">
        {plan.slot} · {slot.label}
      </p>
      <section className="card">
        <h2 className="question-text" id={ids.about}>
          {PLAN_STEPS[0]}
        </h2>
        <AboutField plan={plan} update={update} labelledBy={ids.about} />
        <h2 className="question-text">{PLAN_STEPS[1]}</h2>
        <YearsField plan={plan} update={update} />
        <h2 className="question-text" id={ids.title}>
          {PLAN_STEPS[2]}
        </h2>
        <TitleField plan={plan} update={update} labelledBy={ids.title} />
        <h2 className="question-text">{PLAN_STEPS[3]}</h2>
        <QuestionsField plan={plan} update={update} />
      </section>
      <section className="card">
        <h2 className="question-text" id={ids.feelings}>
          {PLAN_QUESTION}
        </h2>
        <FeelingsField plan={plan} update={update} labelledBy={ids.feelings} own={ownWords} onOwn={(w) => setOwnWords((o) => [...o, w])} />
        <h2 className="question-text" id={ids.needs}>
          {PLAN_STEPS[5]}
        </h2>
        <NeedsField plan={plan} update={update} labelledBy={ids.needs} />
        <h2 className="question-text" id={ids.fit}>
          {PLAN_STEPS[6]}
        </h2>
        <FitField plan={plan} update={update} labelledBy={ids.fit} views={views} />
      </section>
      <PlanVersionList versions={versions} />
    </>
  )
}
