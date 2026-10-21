import { useId, useRef, useState } from 'react'
import { addOwnWord, deleteEntry, type Suggestions, saveEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
import {
  AFTER_INFO,
  AFTER_QUESTION,
  AFTER_WORDS,
  DURING_INFO,
  DURING_QUESTION,
  DURING_WORDS,
  deriveEnergy,
  deriveEngagement,
  deriveFlow,
  type OwnWord,
  wordsFor,
} from '../../domain/feelings'
import { followUpQuestion } from '../../domain/scales'
import type { DayPart } from '../../lib/dates'
import { noteStarters } from '../../prompts/starters'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { Starters, typeInto } from '../../ui/Starters'
import { WordPicker } from '../../ui/WordPicker'
import { EntryDetails } from './EntryDetails'

interface Props {
  existing: Entry
  suggestions: Suggestions
  own: readonly OwnWord[]
  onClose: () => void
}

/** Changing a logged activity: everything on one screen, in the same words it was logged with. */
export function EntryEdit({ existing, suggestions, own, onClose }: Props) {
  const activityId = useId()
  const duringId = useId()
  const afterId = useId()
  const noteId = useId()
  // Entries from before feeling words start with words read from their stored values.
  const initial = wordsFor(existing)
  const [activity, setActivity] = useState(existing.activity)
  const [during, setDuring] = useState<string[]>(initial.during)
  const [after, setAfter] = useState<string[]>(initial.after)
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const [note, setNote] = useState(existing.note)
  const [part, setPart] = useState<DayPart>(existing.part)
  const [where, setWhere] = useState(existing.where)
  const [people, setPeople] = useState(existing.people)
  const [objects, setObjects] = useState(existing.objects)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const noteBox = useRef<HTMLTextAreaElement>(null)

  const addOwn = (word: OwnWord) => {
    setOwnWords((current) => [...current.filter((w) => !(w.kind === word.kind && w.word === word.word)), word])
    void addOwnWord(word)
  }

  const energy = deriveEnergy(after, ownWords)
  const engagement = deriveEngagement(during, ownWords)

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
        disabled={!activity.trim() || during.length === 0 || after.length === 0 || busy}
        onClick={() =>
          void run(() =>
            saveEntry(
              { date: existing.date, part, activity, engagement, energy, flow: deriveFlow(during), where, people, objects, during, after, note },
              existing,
            ),
          )
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

      <Question id={duringId} info={DURING_INFO} infoLabel="What does this ask?">
        {DURING_QUESTION}
      </Question>
      <WordPicker labelledBy={duringId} kind="during" presets={DURING_WORDS} own={ownWords} value={during} onChange={setDuring} onAddOwn={addOwn} />

      <Question id={afterId} info={AFTER_INFO} infoLabel="What does this ask about energy?">
        {AFTER_QUESTION}
      </Question>
      <WordPicker labelledBy={afterId} kind="after" presets={AFTER_WORDS} own={ownWords} value={after} onChange={setAfter} onAddOwn={addOwn} />

      <label className="question-text" htmlFor={noteId}>
        {followUpQuestion(energy, engagement)}
      </label>
      <textarea ref={noteBox} id={noteId} value={note} rows={2} maxLength={4000} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
      <div className="field-foot">
        {note.trim() === '' ? (
          <Starters starters={noteStarters(energy, engagement)} onPick={(text) => typeInto(noteBox.current, text, setNote)} />
        ) : null}
      </div>

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
