import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { type Suggestions, saveEntry } from '../../db/repo'
import {
  asksAboutFlow,
  ENERGY_INFO,
  ENERGY_LEVELS,
  ENERGY_QUESTION,
  type Energy,
  ENGAGEMENT_INFO,
  ENGAGEMENT_LEVELS,
  ENGAGEMENT_QUESTION,
  type Engagement,
  FLOW_QUESTION,
  followUpQuestion,
} from '../../domain/scales'
import { type DayPart, partOfDay, toDateKey } from '../../lib/dates'
import { AnswerButtons } from '../../ui/AnswerButtons'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { EnergySymbol, EngagementDots } from '../../ui/Signs'
import { EntryDetails } from './EntryDetails'

const STEPS = 4
/** A new question ignores taps this long, so a quick double tap can't answer it by accident. */
const SETTLE_MS = 300
/** The chosen answer shows this long before the next question appears. */
const ADVANCE_MS = 180

const YES_NO = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
] as const

// Each answer shows the sign it gets in Today's list, so those signs explain themselves.
const ENERGY_ANSWERS = ENERGY_LEVELS.map((level) => ({ ...level, marker: <EnergySymbol value={level.value} /> }))
const ENGAGEMENT_ANSWERS = ENGAGEMENT_LEVELS.map((level) => ({ ...level, marker: <EngagementDots value={level.value} /> }))

interface Props {
  date: string
  suggestions: Suggestions
  onClose: () => void
}

/** A new activity, one question per screen: what, energy, how into it (and "Did time fly?"), then an optional why. */
export function EntryFlow({ date, suggestions, onClose }: Props) {
  const activityId = useId()
  const questionId = useId()
  const flowId = useId()
  const noteId = useId()
  const [step, setStep] = useState(0)
  const [activity, setActivity] = useState('')
  const [energy, setEnergy] = useState<Energy | null>(null)
  const [engagement, setEngagement] = useState<Engagement | null>(null)
  const [flow, setFlow] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  const [part, setPart] = useState<DayPart>(() => (date === toDateKey(new Date()) ? partOfDay(new Date()) : 'evening'))
  const [where, setWhere] = useState<string[]>([])
  const [people, setPeople] = useState<string[]>([])
  const [objects, setObjects] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [settling, setSettling] = useState(false)
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(
    () => () => {
      clearTimeout(pending.current)
      clearTimeout(settle.current)
    },
    [],
  )

  // Each new question takes focus, so VoiceOver reads it out (the first keeps it on the text box).
  useEffect(() => {
    if (step > 0) heading.current?.focus()
  }, [step])

  function goTo(next: number) {
    clearTimeout(pending.current)
    clearTimeout(settle.current)
    setStep(next)
    setSettling(true)
    settle.current = setTimeout(() => setSettling(false), SETTLE_MS)
  }

  /** Shows the answer, then moves on. Ignored while a question is still settling in. */
  function answer(apply: () => void, then: (() => void) | null) {
    if (settling) return
    apply()
    clearTimeout(pending.current)
    if (then) pending.current = setTimeout(then, ADVANCE_MS)
  }

  const recent = suggestions.activities.filter((a) => a.toLowerCase() !== activity.trim().toLowerCase()).slice(0, 6)
  const named = activity.trim()

  async function save() {
    if (energy === null || engagement === null || !named) return
    setBusy(true)
    try {
      await saveEntry({ date, part, activity, engagement, energy, flow: flow ?? false, where, people, objects, note })
      onClose()
    } catch {
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  const toolbar = (
    <>
      {step > 0 ? (
        <button type="button" className="link" onClick={() => goTo(step - 1)}>
          ‹ Back
        </button>
      ) : null}
      <span className="step-dots" role="img" aria-label={`Question ${step + 1} of ${STEPS}`}>
        {Array.from({ length: STEPS }, (_, i) => (
          <i key={i} className={i <= step ? 'on' : undefined} />
        ))}
      </span>
    </>
  )

  let body: ReactNode
  let footer: ReactNode = null

  if (step === 0) {
    body = (
      <>
        <label className="question-text" htmlFor={activityId}>
          What did you do?
        </label>
        <input
          id={activityId}
          autoFocus
          value={activity}
          maxLength={120}
          autoCapitalize="sentences"
          enterKeyHint="next"
          placeholder="e.g. Team meeting, a run"
          onChange={(e) => setActivity(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && named) goTo(1)
          }}
        />
        {recent.length > 0 ? (
          <div className="chip-row recent" aria-disabled={settling || undefined}>
            {recent.map((a) => (
              <button
                key={a.toLowerCase()}
                type="button"
                className="chip"
                onClick={() => {
                  if (settling) return
                  setActivity(a)
                  goTo(1)
                }}
              >
                {a}
              </button>
            ))}
          </div>
        ) : null}
      </>
    )
    footer = (
      <button type="button" className="primary wide" disabled={!named} onClick={() => goTo(1)}>
        Next
      </button>
    )
  } else if (step === 1) {
    body = (
      <>
        <p className="step-context">{named}</p>
        <Question id={questionId} headingRef={heading} info={ENERGY_INFO} infoLabel="What does energy mean?">
          {ENERGY_QUESTION}
        </Question>
        <AnswerButtons
          labelledBy={questionId}
          options={ENERGY_ANSWERS}
          value={energy}
          tone="energy"
          settling={settling}
          onChoose={(value) => answer(() => setEnergy(value), () => goTo(2))}
        />
      </>
    )
  } else if (step === 2) {
    body = (
      <>
        <p className="step-context">{named}</p>
        <Question id={questionId} headingRef={heading} info={ENGAGEMENT_INFO} infoLabel="What does into it mean?">
          {ENGAGEMENT_QUESTION}
        </Question>
        <AnswerButtons
          labelledBy={questionId}
          options={ENGAGEMENT_ANSWERS}
          value={engagement}
          settling={settling}
          onChoose={(value) =>
            asksAboutFlow(value)
              ? answer(() => {
                  setEngagement(value)
                  setFlow(null)
                }, null)
              : answer(() => {
                  setEngagement(value)
                  setFlow(false)
                }, () => goTo(3))
          }
        />
        {engagement !== null && asksAboutFlow(engagement) ? (
          <div className="follow-on">
            <p className="question-text" id={flowId}>
              {FLOW_QUESTION}
            </p>
            <AnswerButtons labelledBy={flowId} options={YES_NO} value={flow} layout="wrap" onChoose={(value) => answer(() => setFlow(value), () => goTo(3))} />
          </div>
        ) : null}
      </>
    )
  } else {
    body = (
      <>
        <p className="step-context">{named}</p>
        <label className="question-text" htmlFor={noteId}>
          {energy !== null && engagement !== null ? followUpQuestion(energy, engagement) : 'Anything that stood out?'}
        </label>
        <textarea id={noteId} value={note} rows={3} maxLength={1000} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        <EntryDetails
          part={part}
          onPart={setPart}
          where={where}
          onWhere={setWhere}
          people={people}
          onPeople={setPeople}
          objects={objects}
          onObjects={setObjects}
          suggestions={suggestions}
        />
      </>
    )
    footer = (
      <button type="button" className="primary wide" disabled={busy || energy === null || engagement === null} onClick={() => void save()}>
        Save
      </button>
    )
  }

  return (
    <Dialog title="New activity" titleHidden toolbar={toolbar} onClose={onClose} footer={footer}>
      <div key={step} className="step">
        {body}
      </div>
    </Dialog>
  )
}
