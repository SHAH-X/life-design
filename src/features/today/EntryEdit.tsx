import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { addOwnWord, isDone, saveEntry, type Suggestions } from '../../db/repo'
import type { Duration, EnergyEffect, Entry, Measure, Purpose, Reflection } from '../../db/types'
import {
  AFTER_INFO,
  AFTER_QUESTION,
  AFTER_WORDS,
  deriveEngagement,
  deriveFlow,
  DURING_INFO,
  DURING_QUESTION,
  DURING_WORDS,
  ENERGY_INFO,
  ENERGY_OPTIONS,
  ENERGY_QUESTION,
  energyFrom,
  type OwnWord,
  wordsFor,
} from '../../domain/feelings'
import { focusFor, questionsFor } from '../../domain/purposes'
import type { DayPart } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { WordPicker } from '../../ui/WordPicker'
import { EarlierAnswers } from './EarlierAnswers'
import { EntryDetails } from './EntryDetails'
import { useEntryTitle } from '../areas/AreasProvider'
import { WriteBox } from './WriteBox'

/** The parts of an entry, each changed on its own (owner, 2026-10-23: one screen to read, a part at a time to change). */
export type EntryPart = 'activity' | 'during' | 'energy' | 'after' | 'writing' | 'details'

interface Props {
  existing: Entry
  /** The one part to change; free writing only has its writing. */
  part: EntryPart
  suggestions: Suggestions
  own: readonly OwnWord[]
  goal: string
  /** Your own focus for each purpose (More → Your purpose). */
  focus: Partial<Record<Purpose, string>>
  onClose: () => void
}

/**
 * Changing one part of an entry: just that question, as when it was logged, with what you gave it. Everything else
 * is kept as it was (the entry is saved whole, so its energy, engagement and flow follow the words). Until v0.12.3
 * Edit showed every question on one long screen and couldn't change "To remember" (owner: "it should be simpler").
 */
export function EntryEdit({ existing, part: editing, suggestions, own, goal, focus, onClose }: Props) {
  const entryTitle = useEntryTitle()
  const activityId = useId()
  const duringId = useId()
  const energyId = useId()
  const afterId = useId()
  const noteId = useId()
  const free = existing.kind === 'free'
  // Entries from before feeling words start with words read from their stored values.
  const initial = wordsFor(existing)
  const [activity, setActivity] = useState(existing.activity)
  const [during, setDuring] = useState<string[]>(initial.during)
  const [energyEffect, setEnergyEffect] = useState<EnergyEffect | null>(existing.energyEffect)
  const [after, setAfter] = useState<string[]>(initial.after)
  const [purpose, setPurpose] = useState<Purpose>(existing.purpose ?? 'know')
  // Separate answers from v0.8.0: kept, each under its question.
  const [earlier, setEarlier] = useState<Reflection[]>(existing.reflections)
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const [note, setNote] = useState(existing.note)
  const [part, setPart] = useState<DayPart>(existing.part)
  const [duration, setDuration] = useState<Duration | null>(existing.duration)
  const [where, setWhere] = useState(existing.where)
  const [people, setPeople] = useState(existing.people)
  const [objects, setObjects] = useState(existing.objects)
  const [busy, setBusy] = useState(false)

  const turn = useLiveQuery(() => db.entries.filter((e) => isDone(e) && e.purpose === purpose).count(), [purpose], 0)
  const candidates = questionsFor(purpose, { energyEffect, during, after, turn, goal })

  const addOwn = (word: OwnWord) => {
    setOwnWords((current) => [...current.filter((w) => !(w.kind === word.kind && w.word === word.word)), word])
    void addOwnWord(word)
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch {
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  function save() {
    const { energy, answered } = energyFrom(energyEffect, after, ownWords)
    const skipped: Measure[] = free ? ['engagement', 'energy'] : [...(during.length ? [] : ['engagement' as const]), ...(answered ? [] : ['energy' as const])]
    return run(() =>
      saveEntry(
        {
          date: existing.date,
          part,
          activity: free ? '' : activity,
          engagement: deriveEngagement(during, ownWords),
          energy,
          flow: deriveFlow(during),
          where,
          people,
          objects,
          during,
          after,
          note,
          purpose: free ? 'free' : purpose,
          energyEffect,
          duration,
          reflections: earlier,
          skipped,
          status: 'done',
        },
        existing,
      ),
    )
  }

  const footer = (
    <button type="button" className="primary wide" disabled={busy || (free ? !note.trim() : !activity.trim())} onClick={() => void save()}>
      Save
    </button>
  )

  if (free) {
    return (
      <Dialog title="Free writing" onClose={onClose} footer={footer} full fillBody>
        <label className="question-text" htmlFor={noteId}>
          What's on your mind?
        </label>
        <textarea id={noteId} className="fill" value={note} rows={10} maxLength={20000} onChange={(e) => setNote(e.target.value)} />
      </Dialog>
    )
  }

  return (
    <Dialog title={entryTitle(existing)} onClose={onClose} footer={footer} full>
      {editing === 'activity' ? (
        <>
          <label className="question-text" htmlFor={activityId}>
            What did you do?
          </label>
          <input id={activityId} data-autofocus value={activity} maxLength={120} autoCapitalize="sentences" onChange={(e) => setActivity(e.target.value)} />
        </>
      ) : null}

      {editing === 'during' ? (
        <>
          <Question id={duringId} info={DURING_INFO} infoLabel="What does this ask?">
            {DURING_QUESTION}
          </Question>
          <WordPicker labelledBy={duringId} kind="during" presets={DURING_WORDS} own={ownWords} value={during} onChange={setDuring} onAddOwn={addOwn} />
        </>
      ) : null}

      {editing === 'energy' ? (
        <>
          <Question id={energyId} info={ENERGY_INFO} infoLabel="Why ask about energy?">
            {ENERGY_QUESTION}
          </Question>
          <div role="group" aria-labelledby={energyId} className="chip-row energy-choices">
            {ENERGY_OPTIONS.map((o) => (
              <button key={o.value} type="button" className="chip" aria-pressed={energyEffect === o.value} onClick={() => setEnergyEffect(energyEffect === o.value ? null : o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {editing === 'after' ? (
        <>
          <Question id={afterId} info={AFTER_INFO} infoLabel="What does this ask about feelings?">
            {AFTER_QUESTION}
          </Question>
          <WordPicker labelledBy={afterId} kind="after" presets={AFTER_WORDS} own={ownWords} value={after} onChange={setAfter} onAddOwn={addOwn} />
        </>
      ) : null}

      {editing === 'writing' ? (
        <>
          <EarlierAnswers answers={earlier} onChange={setEarlier} />
          <WriteBox
            id={noteId}
            purpose={purpose}
            onPurpose={setPurpose}
            candidates={candidates}
            focus={focusFor(purpose, focus)}
            text={note}
            onText={setNote}
          />
        </>
      ) : null}

      {editing === 'details' ? (
        <>
          <h2 className="question-text">When, how long, where, who</h2>
          <EntryDetails
            startOpen
            part={part}
            onPart={setPart}
            duration={duration}
            onDuration={setDuration}
            where={where}
            onWhere={setWhere}
            people={people}
            onPeople={setPeople}
            objects={objects}
            onObjects={setObjects}
            suggestions={suggestions}
          />
        </>
      ) : null}
    </Dialog>
  )
}
