import { useId, useState } from 'react'
import { deleteEntry, type Suggestions, saveEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
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
import type { DayPart } from '../../lib/dates'
import { AnswerButtons } from '../../ui/AnswerButtons'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { EntryDetails } from './EntryDetails'

const YES_NO = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
] as const

interface Props {
  existing: Entry
  suggestions: Suggestions
  onClose: () => void
}

/** Changing a logged activity: every answer on one screen, with the same worded answers as when it was logged. */
export function EntryEdit({ existing, suggestions, onClose }: Props) {
  const activityId = useId()
  const energyId = useId()
  const engagementId = useId()
  const flowId = useId()
  const noteId = useId()
  const [activity, setActivity] = useState(existing.activity)
  const [energy, setEnergy] = useState<Energy>(existing.energy)
  const [engagement, setEngagement] = useState<Engagement>(existing.engagement)
  const [flow, setFlow] = useState(existing.flow)
  const [note, setNote] = useState(existing.note)
  const [part, setPart] = useState<DayPart>(existing.part)
  const [where, setWhere] = useState(existing.where)
  const [people, setPeople] = useState(existing.people)
  const [objects, setObjects] = useState(existing.objects)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch {
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  const footer = (
    <>
      <button
        type="button"
        className="primary wide"
        disabled={!activity.trim() || busy}
        onClick={() =>
          void run(() => saveEntry({ date: existing.date, part, activity, engagement, energy, flow, where, people, objects, note }, existing))
        }
      >
        Save
      </button>
      {confirmDelete ? (
        <div className="row">
          <span className="grow">Delete this activity?</span>
          <button type="button" className="danger" disabled={busy} onClick={() => void run(() => deleteEntry(existing.id))}>
            Yes, delete
          </button>
          <button type="button" onClick={() => setConfirmDelete(false)}>
            Keep
          </button>
        </div>
      ) : (
        <button type="button" className="link danger-text" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
      )}
    </>
  )

  return (
    <Dialog title="Edit activity" onClose={onClose} footer={footer}>
      <label className="question-text" htmlFor={activityId}>
        What did you do?
      </label>
      <input id={activityId} value={activity} maxLength={120} autoCapitalize="sentences" onChange={(e) => setActivity(e.target.value)} />

      <Question id={energyId} info={ENERGY_INFO} infoLabel="What does energy mean?">
        {ENERGY_QUESTION}
      </Question>
      <AnswerButtons labelledBy={energyId} options={ENERGY_LEVELS} value={energy} layout="wrap" tone="energy" onChoose={setEnergy} />

      <Question id={engagementId} info={ENGAGEMENT_INFO} infoLabel="What does into it mean?">
        {ENGAGEMENT_QUESTION}
      </Question>
      <AnswerButtons
        labelledBy={engagementId}
        options={ENGAGEMENT_LEVELS}
        value={engagement}
        layout="wrap"
        onChoose={(value) => {
          setEngagement(value)
          if (!asksAboutFlow(value)) setFlow(false)
        }}
      />

      {asksAboutFlow(engagement) || flow ? (
        <>
          <p className="question-text" id={flowId}>
            {FLOW_QUESTION}
          </p>
          <AnswerButtons labelledBy={flowId} options={YES_NO} value={flow} layout="wrap" onChoose={setFlow} />
        </>
      ) : null}

      <label className="question-text" htmlFor={noteId}>
        {followUpQuestion(energy, engagement)}
      </label>
      <textarea id={noteId} value={note} rows={2} maxLength={1000} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />

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
    </Dialog>
  )
}
