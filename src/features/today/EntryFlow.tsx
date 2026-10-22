import { useLiveQuery } from 'dexie-react-hooks'
import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { db } from '../../db/db'
import { addOwnWord, isDone, saveEntry, type Suggestions } from '../../db/repo'
import type { Duration, EnergyEffect, Entry, Measure, Purpose } from '../../db/types'
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
  spotFeelings,
} from '../../domain/feelings'
import { questionsFor } from '../../domain/purposes'
import { type DayPart, partOfDay, toDateKey } from '../../lib/dates'
import { noteStarters } from '../../prompts/starters'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { Starters, typeInto } from '../../ui/Starters'
import { WordPicker } from '../../ui/WordPicker'
import { EntryDetails } from './EntryDetails'
import { questionsForPurpose, ReflectStep, type ShownQuestion } from './ReflectStep'

const STEPS = 6
/** A new question ignores taps this long, so a quick double tap can't answer it by accident. */
const SETTLE_MS = 300
/** A draft is saved this long after the last change. */
const DRAFT_DELAY_MS = 500

export const NOTE_QUESTION = 'What else would you like to record?'

interface Props {
  date: string
  suggestions: Suggestions
  own: readonly OwnWord[]
  /** Your primary purpose: where the reflection questions start. */
  purpose: Purpose
  goal: string
  /** An unfinished entry to carry on with. */
  draft?: Entry
  onClose: () => void
}

/** Where to pick up an unfinished entry: the step after the last one answered. */
function resumeStep(draft: Entry): number {
  if (draft.note || draft.where.length || draft.people.length || draft.objects.length || draft.duration) return 5
  if (draft.reflections.length || draft.after.length) return 4
  if (draft.energyEffect) return 3
  if (draft.during.length) return 2
  return 1
}

/**
 * Reflect on an activity, one question per screen, every answer in words and every step after the first
 * optional: what you did, what it was like, what it did to your energy, how you felt, a question or two for
 * your purpose, and anything else. Saved as a draft from the first step on, so nothing is lost if you stop.
 */
export function EntryFlow({ date, suggestions, own, purpose: primary, goal, draft, onClose }: Props) {
  const activityId = useId()
  const duringId = useId()
  const energyId = useId()
  const afterId = useId()
  const noteId = useId()
  const [step, setStep] = useState(() => (draft ? resumeStep(draft) : 0))
  const [activity, setActivity] = useState(draft?.activity ?? '')
  const [during, setDuring] = useState<string[]>(draft?.during ?? [])
  const [energyEffect, setEnergyEffect] = useState<EnergyEffect | null>(draft?.energyEffect ?? null)
  const [after, setAfter] = useState<string[]>(draft?.after ?? [])
  const [purpose, setPurpose] = useState<Purpose>(draft?.purpose ?? primary)
  const [shown, setShown] = useState<ShownQuestion[]>(() =>
    (draft?.reflections ?? []).map((r, i) => ({ id: `saved-${i}`, question: r.question, text: r.text })),
  )
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const [note, setNote] = useState(draft?.note ?? '')
  const [part, setPart] = useState<DayPart>(() => draft?.part ?? (date === toDateKey(new Date()) ? partOfDay(new Date()) : 'evening'))
  const [duration, setDuration] = useState<Duration | null>(draft?.duration ?? null)
  const [where, setWhere] = useState<string[]>(draft?.where ?? [])
  const [people, setPeople] = useState<string[]>(draft?.people ?? [])
  const [objects, setObjects] = useState<string[]>(draft?.objects ?? [])
  const [busy, setBusy] = useState(false)
  const [settling, setSettling] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)
  const noteBox = useRef<HTMLTextAreaElement>(null)

  // Saves go one after another, so a late draft save can never undo the finished one.
  const saved = useRef<Entry | undefined>(draft)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const finished = useRef(false)
  const started = useRef(Boolean(draft))
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // How many entries you've written for this purpose: the reflection questions take turns from it.
  const turn = useLiveQuery(() => db.entries.filter((e) => isDone(e) && e.purpose === purpose).count(), [purpose], 0)
  const candidates = questionsFor(purpose, { energyEffect, during, after, turn, goal })

  const named = activity.trim()
  const fields = () => {
    const { energy, answered } = energyFrom(energyEffect, after, ownWords)
    const skipped: Measure[] = [...(during.length ? [] : ['engagement' as const]), ...(answered ? [] : ['energy' as const])]
    return {
      date,
      part,
      activity,
      engagement: deriveEngagement(during, ownWords),
      energy,
      flow: deriveFlow(during),
      where,
      people,
      objects,
      during,
      after,
      note,
      kind: 'activity' as const,
      purpose,
      energyEffect,
      duration,
      reflections: shown.map((q) => ({ question: q.question, text: q.text })),
      skipped,
    }
  }

  // Always the answers on screen now, even from a timer or on the way out.
  const latest = useRef(fields)
  latest.current = fields
  const persist = (status: 'draft' | 'done') => {
    const snapshot = latest.current()
    queue.current = queue.current.then(async () => {
      saved.current = await saveEntry({ ...snapshot, status }, saved.current)
    })
    return queue.current
  }
  const persistRef = useRef(persist)
  persistRef.current = persist

  // Keep the draft up to date once the activity has a name; and save what's pending on the way out.
  useEffect(() => {
    if (!started.current || finished.current || !named) return
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      draftTimer.current = undefined
      void persistRef.current('draft').catch(() => undefined)
    }, DRAFT_DELAY_MS)
  })
  useEffect(
    () => () => {
      clearTimeout(settle.current)
      if (draftTimer.current !== undefined && !finished.current) {
        clearTimeout(draftTimer.current)
        void persistRef.current('draft').catch(() => undefined)
      }
    },
    [],
  )

  // Each new question takes focus, so VoiceOver reads it out (the first keeps it on the text box).
  useEffect(() => {
    if (step > 0) heading.current?.focus()
  }, [step])

  function goTo(next: number) {
    clearTimeout(settle.current)
    if (next > 0 && named) started.current = true
    if (next === 4 && shown.length === 0) setShown(questionsForPurpose(candidates, []))
    setStep(next)
    setSettling(true)
    settle.current = setTimeout(() => setSettling(false), SETTLE_MS)
  }

  const addOwn = (word: OwnWord) => {
    setOwnWords((current) => [...current.filter((w) => !(w.kind === word.kind && w.word === word.word)), word])
    void addOwnWord(word)
  }

  async function save() {
    if (!named) return
    setBusy(true)
    clearTimeout(draftTimer.current)
    finished.current = true
    try {
      await persist('done')
      onClose()
    } catch {
      finished.current = false
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  const recent = suggestions.activities.filter((a) => a.toLowerCase() !== named.toLowerCase()).slice(0, 6)
  const written = [note, ...shown.map((q) => q.text)].join('\n')
  const spotted = spotFeelings(written, { during, after }, ownWords)
  const skipOrNext = (answered: boolean) => (answered ? 'Next' : 'Skip')

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
  let footer: ReactNode
  const context = <p className="step-context">{named}</p>

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
                  started.current = true
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
  } else if (step === 1 || step === 3) {
    const isDuring = step === 1
    const id = isDuring ? duringId : afterId
    const value = isDuring ? during : after
    body = (
      <>
        {context}
        <Question
          id={id}
          headingRef={heading}
          info={isDuring ? DURING_INFO : AFTER_INFO}
          infoLabel={isDuring ? 'What does this ask?' : 'What does this ask about feelings?'}
        >
          {isDuring ? DURING_QUESTION : AFTER_QUESTION}
        </Question>
        <WordPicker
          labelledBy={id}
          kind={isDuring ? 'during' : 'after'}
          presets={isDuring ? DURING_WORDS : AFTER_WORDS}
          own={ownWords}
          value={value}
          onChange={isDuring ? setDuring : setAfter}
          onAddOwn={addOwn}
          settling={settling}
        />
      </>
    )
    footer = (
      <button type="button" className="primary wide" onClick={() => goTo(step + 1)}>
        {skipOrNext(value.length > 0)}
      </button>
    )
  } else if (step === 2) {
    body = (
      <>
        {context}
        <Question id={energyId} headingRef={heading} info={ENERGY_INFO} infoLabel="Why ask about energy?">
          {ENERGY_QUESTION}
        </Question>
        <div role="group" aria-labelledby={energyId} aria-disabled={settling || undefined} className="chip-row energy-choices">
          {ENERGY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="chip"
              aria-pressed={energyEffect === o.value}
              onClick={() => {
                if (settling) return
                setEnergyEffect(o.value)
                goTo(3)
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </>
    )
    footer = (
      <button type="button" className="primary wide" onClick={() => goTo(3)}>
        {skipOrNext(energyEffect !== null)}
      </button>
    )
  } else if (step === 4) {
    body = (
      <>
        {context}
        <ReflectStep
          purpose={purpose}
          onPurpose={(next) => {
            setPurpose(next)
            setShown((current) => questionsForPurpose(questionsFor(next, { energyEffect, during, after, turn: 0, goal }), current))
          }}
          candidates={candidates}
          shown={shown}
          onShown={setShown}
        />
      </>
    )
    footer = (
      <button type="button" className="primary wide" onClick={() => goTo(5)}>
        {skipOrNext(shown.some((q) => q.text.trim()))}
      </button>
    )
  } else {
    const { energy } = energyFrom(energyEffect, after, ownWords)
    const suggested = [...spotted.during.map((w) => ({ word: w, kind: 'during' as const })), ...spotted.after.map((w) => ({ word: w, kind: 'after' as const }))]
    body = (
      <>
        {context}
        <label className="question-text" htmlFor={noteId}>
          {NOTE_QUESTION}
        </label>
        <textarea ref={noteBox} id={noteId} value={note} rows={3} maxLength={4000} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        <div className="field-foot">
          {note.trim() === '' ? (
            <Starters starters={noteStarters(energy, deriveEngagement(during, ownWords))} onPick={(text) => typeInto(noteBox.current, text, setNote)} />
          ) : null}
        </div>
        <p className="field-help">Tap the mic on the keyboard to speak.</p>
        {suggested.length ? (
          <div className="chip-row suggested" role="group" aria-label="Feelings in your words">
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
    )
    footer = (
      <button type="button" className="primary wide" disabled={busy} onClick={() => void save()}>
        Save
      </button>
    )
  }

  return (
    <Dialog title="New activity" titleHidden toolbar={toolbar} onClose={onClose} footer={footer}>
      {/* Each question starts fresh: an ⓘ opened on one question mustn't stay open on the next. */}
      <Fragment key={step}>{body}</Fragment>
    </Dialog>
  )
}
