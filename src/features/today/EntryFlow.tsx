import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { addOwnWord, type Suggestions, saveEntry } from '../../db/repo'
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
  spotFeelings,
} from '../../domain/feelings'
import { followUpQuestion } from '../../domain/scales'
import { type DayPart, partOfDay, toDateKey } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { WordPicker } from '../../ui/WordPicker'
import { EntryDetails } from './EntryDetails'

const STEPS = 4
/** A new question ignores taps this long, so a quick double tap can't answer it by accident. */
const SETTLE_MS = 300

interface Props {
  date: string
  suggestions: Suggestions
  own: readonly OwnWord[]
  onClose: () => void
}

/**
 * A new activity, one question per screen, answered in words, never ratings: what you did, what it was like,
 * how it left you, then anything else. Energy, how into it and time flying are worked out from the words.
 */
export function EntryFlow({ date, suggestions, own, onClose }: Props) {
  const activityId = useId()
  const questionId = useId()
  const noteId = useId()
  const [step, setStep] = useState(0)
  const [activity, setActivity] = useState('')
  const [during, setDuring] = useState<string[]>([])
  const [after, setAfter] = useState<string[]>([])
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const [note, setNote] = useState('')
  const [part, setPart] = useState<DayPart>(() => (date === toDateKey(new Date()) ? partOfDay(new Date()) : 'evening'))
  const [where, setWhere] = useState<string[]>([])
  const [people, setPeople] = useState<string[]>([])
  const [objects, setObjects] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [settling, setSettling] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => () => clearTimeout(settle.current), [])

  // Each new question takes focus, so VoiceOver reads it out (the first keeps it on the text box).
  useEffect(() => {
    if (step > 0) heading.current?.focus()
  }, [step])

  function goTo(next: number) {
    clearTimeout(settle.current)
    setStep(next)
    setSettling(true)
    settle.current = setTimeout(() => setSettling(false), SETTLE_MS)
  }

  const addOwn = (word: OwnWord) => {
    setOwnWords((current) => [...current.filter((w) => !(w.kind === word.kind && w.word === word.word)), word])
    void addOwnWord(word)
  }

  const recent = suggestions.activities.filter((a) => a.toLowerCase() !== activity.trim().toLowerCase()).slice(0, 6)
  const named = activity.trim()
  const energy = deriveEnergy(after, ownWords)
  const engagement = deriveEngagement(during, ownWords)
  const spotted = spotFeelings(note, { during, after }, ownWords)

  async function save() {
    if (!named || during.length === 0 || after.length === 0) return
    setBusy(true)
    try {
      await saveEntry({ date, part, activity, engagement, energy, flow: deriveFlow(during), where, people, objects, during, after, note })
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
          data-autofocus
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
  } else if (step === 1 || step === 2) {
    const isDuring = step === 1
    body = (
      <>
        <p className="step-context">{named}</p>
        <Question
          id={questionId}
          headingRef={heading}
          info={isDuring ? DURING_INFO : AFTER_INFO}
          infoLabel={isDuring ? 'What does this ask?' : 'What does this ask about energy?'}
        >
          {isDuring ? DURING_QUESTION : AFTER_QUESTION}
        </Question>
        <WordPicker
          labelledBy={questionId}
          kind={isDuring ? 'during' : 'after'}
          presets={isDuring ? DURING_WORDS : AFTER_WORDS}
          own={ownWords}
          value={isDuring ? during : after}
          onChange={isDuring ? setDuring : setAfter}
          onAddOwn={addOwn}
          settling={settling}
        />
      </>
    )
    footer = (
      <button type="button" className="primary wide" disabled={(isDuring ? during : after).length === 0} onClick={() => goTo(step + 1)}>
        Next
      </button>
    )
  } else {
    const suggested = [...spotted.during.map((w) => ({ word: w, kind: 'during' as const })), ...spotted.after.map((w) => ({ word: w, kind: 'after' as const }))]
    body = (
      <>
        <p className="step-context">{named}</p>
        <label className="question-text" htmlFor={noteId}>
          {followUpQuestion(energy, engagement)}
        </label>
        <textarea id={noteId} value={note} rows={3} maxLength={4000} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        <p className="field-help">Tap the mic on the keyboard to speak.</p>
        {suggested.length ? (
          <div className="chip-row suggested" role="group" aria-label="Feelings in your note">
            {suggested.map((s) => (
              <button
                key={`${s.kind}:${s.word}`}
                type="button"
                className="chip"
                onClick={() => (s.kind === 'during' ? setDuring([...during, s.word]) : setAfter([...after, s.word]))}
              >
                + {s.word.toLowerCase()}
              </button>
            ))}
          </div>
        ) : null}
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
      <button type="button" className="primary wide" disabled={busy} onClick={() => void save()}>
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
