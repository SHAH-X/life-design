import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { addOwnWord, deletePrototype, savePrototype } from '../../db/repo'
import type { Prototype, PrototypeHow, PrototypeNext } from '../../db/types'
import { AFTER_INFO, AFTER_QUESTION, AFTER_WORDS, type OwnWord } from '../../domain/feelings'
import type { PlanSlot } from '../../domain/lifeDesign'
import {
  HOW_OPTIONS,
  HOW_TEXT,
  LEARNED_TEXT,
  NEXT_OPTIONS,
  NEXT_TEXT,
  newPrototype,
  QUESTION_INFO,
  QUESTION_TEXT,
  type QuestionSuggestion,
  WHEN_TEXT,
} from '../../domain/prototypes'
import { isDateKey } from '../../lib/dates'
import { learnedStarters } from '../../prompts/starters'
import { Dialog } from '../../ui/Dialog'
import { Question } from '../../ui/Question'
import { Starters, typeInto } from '../../ui/Starters'
import { WordPicker } from '../../ui/WordPicker'

/** A new question ignores taps this long, so a quick double tap can't answer it by accident. */
const SETTLE_MS = 300

/** One question per screen, with Back and step dots, like New activity. */
function useSteps(count: number) {
  const [step, setStep] = useState(0)
  const [settling, setSettling] = useState(false)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => clearTimeout(settle.current), [])
  // Each new question takes focus, so VoiceOver reads it out.
  useEffect(() => {
    if (step > 0) heading.current?.focus()
  }, [step])

  const goTo = (next: number) => {
    clearTimeout(settle.current)
    setStep(next)
    setSettling(true)
    settle.current = setTimeout(() => setSettling(false), SETTLE_MS)
  }
  const toolbar = (
    <>
      {step > 0 ? (
        <button type="button" className="link" onClick={() => goTo(step - 1)}>
          ‹ Back
        </button>
      ) : null}
      <span className="step-dots" role="img" aria-label={`Question ${step + 1} of ${count}`}>
        {Array.from({ length: count }, (_, i) => (
          <i key={i} className={i <= step ? 'on' : undefined} />
        ))}
      </span>
    </>
  )
  return { step, goTo, settling, heading, toolbar }
}

/** "Talk to someone" or "Try it out", then who or what. Nothing is chosen for you. */
function HowFields(props: {
  labelledBy: string
  how: PrototypeHow | null
  onHow: (how: PrototypeHow) => void
  withWhat: string
  onWithWhat: (text: string) => void
  settling?: boolean
}) {
  const whatId = useId()
  const option = HOW_OPTIONS.find((o) => o.value === props.how)
  return (
    <>
      <div role="group" aria-labelledby={props.labelledBy} aria-disabled={props.settling || undefined} className="chip-row">
        {HOW_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={props.how === o.value}
            onClick={() => {
              if (!props.settling) props.onHow(o.value)
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {option ? (
        <>
          <label className="question-text" htmlFor={whatId}>
            {option.ask}
          </label>
          <input
            id={whatId}
            value={props.withWhat}
            maxLength={120}
            autoCapitalize="sentences"
            placeholder={option.placeholder}
            onChange={(e) => props.onWithWhat(e.target.value)}
          />
        </>
      ) : null}
    </>
  )
}

function WhenField({ when, onWhen }: { when: string; onWhen: (when: string) => void }) {
  const id = useId()
  return (
    <>
      <label className="question-text" htmlFor={id}>
        {WHEN_TEXT}
      </label>
      <input id={id} type="date" value={when} onChange={(e) => onWhen(e.target.value)} />
      <p className="field-help">Optional</p>
    </>
  )
}

function LearnedField({ learned, onLearned }: { learned: string; onLearned: (text: string) => void }) {
  const id = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  return (
    <>
      <label className="question-text" htmlFor={id}>
        {LEARNED_TEXT}
      </label>
      <textarea ref={box} id={id} value={learned} rows={3} maxLength={4000} onChange={(e) => onLearned(e.target.value)} />
      <div className="field-foot">
        {learned.trim() === '' ? <Starters starters={learnedStarters()} onPick={(text) => typeInto(box.current, text, onLearned)} /> : null}
      </div>
    </>
  )
}

function NextChoice({ labelledBy, next, onNext }: { labelledBy: string; next: PrototypeNext | null; onNext: (next: PrototypeNext | null) => void }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="chip-row">
      {NEXT_OPTIONS.map((o) => (
        <button key={o.value} type="button" className="chip" aria-pressed={next === o.value} onClick={() => onNext(next === o.value ? null : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Saves, then closes; on failure the save-error prompt explains what happened. */
function useRun(onClose: () => void) {
  const [busy, setBusy] = useState(false)
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch {
      setBusy(false)
    }
  }
  return { busy, run }
}

/** A new prototype, one question per screen: what you want to find out, how, and when. */
export function PrototypeNew({ suggestions, onClose }: { suggestions: readonly QuestionSuggestion[]; onClose: () => void }) {
  const questionId = useId()
  const howId = useId()
  const { step, goTo, settling, heading, toolbar } = useSteps(3)
  const [question, setQuestion] = useState('')
  const [planSlot, setPlanSlot] = useState<PlanSlot | null>(null)
  const [how, setHow] = useState<PrototypeHow | null>(null)
  const [withWhat, setWithWhat] = useState('')
  const [when, setWhen] = useState('')
  const { busy, run } = useRun(onClose)
  const named = question.trim()

  let body: ReactNode
  let footer: ReactNode
  if (step === 0) {
    body = (
      <>
        <Question as="label" htmlFor={questionId} info={QUESTION_INFO} infoLabel="What makes a good prototype?">
          {QUESTION_TEXT}
        </Question>
        <input
          id={questionId}
          data-autofocus
          value={question}
          maxLength={160}
          autoCapitalize="sentences"
          enterKeyHint="next"
          placeholder="e.g. Would I enjoy teaching?"
          onChange={(e) => {
            setQuestion(e.target.value)
            setPlanSlot(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && named) goTo(1)
          }}
        />
        {suggestions.length ? (
          <div className="chip-row questions" aria-disabled={settling || undefined}>
            {suggestions.map((s) => (
              <button
                key={s.question}
                type="button"
                className="chip"
                onClick={() => {
                  if (settling) return
                  setQuestion(s.question)
                  setPlanSlot(s.planSlot)
                  goTo(1)
                }}
              >
                {s.question}
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
        <Question id={howId} headingRef={heading}>
          {HOW_TEXT}
        </Question>
        <HowFields labelledBy={howId} how={how} onHow={setHow} withWhat={withWhat} onWithWhat={setWithWhat} settling={settling} />
      </>
    )
    footer = (
      <button type="button" className="primary wide" disabled={how === null} onClick={() => goTo(2)}>
        Next
      </button>
    )
  } else {
    body = (
      <>
        <p className="step-context">{named}</p>
        <WhenField when={when} onWhen={setWhen} />
      </>
    )
    footer = (
      <button
        type="button"
        className="primary wide"
        disabled={busy || !named || how === null}
        onClick={() =>
          void run(() =>
            savePrototype({ ...newPrototype(0), question, planSlot, how: how ?? 'talk', withWhat, when: isDateKey(when) ? when : null }),
          )
        }
      >
        Save
      </button>
    )
  }

  return (
    <Dialog title="New prototype" titleHidden toolbar={toolbar} onClose={onClose} footer={footer}>
      {body}
    </Dialog>
  )
}

/** Once it's done: what you learned, how it left you, and what next. */
export function PrototypeDone({ prototype, own, onClose }: { prototype: Prototype; own: readonly OwnWord[]; onClose: () => void }) {
  const afterId = useId()
  const nextId = useId()
  const { step, goTo, settling, heading, toolbar } = useSteps(3)
  const [learned, setLearned] = useState(prototype.learned)
  const [after, setAfter] = useState<string[]>(prototype.after)
  const [next, setNext] = useState<PrototypeNext | null>(prototype.next)
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const { busy, run } = useRun(onClose)

  const addOwn = (word: OwnWord) => {
    setOwnWords((current) => [...current.filter((w) => !(w.kind === word.kind && w.word === word.word)), word])
    void addOwnWord(word)
  }

  let body: ReactNode
  let footer: ReactNode
  if (step === 0) {
    body = (
      <>
        <p className="step-context">{prototype.question}</p>
        <LearnedField learned={learned} onLearned={setLearned} />
      </>
    )
    footer = (
      <button type="button" className="primary wide" onClick={() => goTo(1)}>
        Next
      </button>
    )
  } else if (step === 1) {
    body = (
      <>
        <p className="step-context">{prototype.question}</p>
        <Question id={afterId} headingRef={heading} info={AFTER_INFO} infoLabel="What does this ask about energy?">
          {AFTER_QUESTION}
        </Question>
        <WordPicker
          labelledBy={afterId}
          kind="after"
          presets={AFTER_WORDS}
          own={ownWords}
          value={after}
          onChange={setAfter}
          onAddOwn={addOwn}
          settling={settling}
        />
      </>
    )
    footer = (
      <button type="button" className="primary wide" disabled={after.length === 0} onClick={() => goTo(2)}>
        Next
      </button>
    )
  } else {
    body = (
      <>
        <p className="step-context">{prototype.question}</p>
        <Question id={nextId} headingRef={heading}>
          {NEXT_TEXT}
        </Question>
        <NextChoice labelledBy={nextId} next={next} onNext={setNext} />
      </>
    )
    footer = (
      <button
        type="button"
        className="primary wide"
        disabled={busy}
        onClick={() => void run(() => savePrototype({ ...prototype, learned, after, next, doneAt: prototype.doneAt ?? Date.now() }))}
      >
        Save
      </button>
    )
  }

  return (
    <Dialog title="Done" titleHidden toolbar={toolbar} onClose={onClose} footer={footer}>
      {body}
    </Dialog>
  )
}

/** A prototype on one screen, to change it; a planned one can be marked done from here. */
export function PrototypeEdit(props: { prototype: Prototype; own: readonly OwnWord[]; onClose: () => void; onDone: (saved: Prototype) => void }) {
  const { prototype, own, onClose, onDone } = props
  const questionId = useId()
  const howId = useId()
  const afterId = useId()
  const nextId = useId()
  const [question, setQuestion] = useState(prototype.question)
  const [how, setHow] = useState<PrototypeHow>(prototype.how)
  const [withWhat, setWithWhat] = useState(prototype.withWhat)
  const [when, setWhen] = useState(prototype.when ?? '')
  const [learned, setLearned] = useState(prototype.learned)
  const [after, setAfter] = useState<string[]>(prototype.after)
  const [next, setNext] = useState<PrototypeNext | null>(prototype.next)
  const [ownWords, setOwnWords] = useState<OwnWord[]>([...own])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { busy, run } = useRun(onClose)
  const done = prototype.doneAt !== null

  const addOwn = (word: OwnWord) => {
    setOwnWords((current) => [...current.filter((w) => !(w.kind === word.kind && w.word === word.word)), word])
    void addOwnWord(word)
  }
  const edited = (): Prototype => ({ ...prototype, question, how, withWhat, when: isDateKey(when) ? when : null, learned, after, next })

  const footer = (
    <>
      {done ? null : (
        <button type="button" className="primary wide" disabled={busy || !question.trim()} onClick={() => void savePrototype(edited()).then(onDone, () => undefined)}>
          I did it
        </button>
      )}
      <button type="button" className={done ? 'primary wide' : 'wide'} disabled={busy || !question.trim()} onClick={() => void run(() => savePrototype(edited()))}>
        Save
      </button>
      {confirmDelete ? (
        <div className="row">
          <span className="grow">Delete this prototype?</span>
          <button type="button" className="danger" disabled={busy} onClick={() => void run(() => deletePrototype(prototype.id))}>
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
    <Dialog title="Prototype" onClose={onClose} footer={footer}>
      <label className="question-text" htmlFor={questionId}>
        {QUESTION_TEXT}
      </label>
      <input id={questionId} value={question} maxLength={160} autoCapitalize="sentences" onChange={(e) => setQuestion(e.target.value)} />
      <Question id={howId}>{HOW_TEXT}</Question>
      <HowFields labelledBy={howId} how={how} onHow={setHow} withWhat={withWhat} onWithWhat={setWithWhat} />
      <WhenField when={when} onWhen={setWhen} />
      {done ? (
        <>
          <LearnedField learned={learned} onLearned={setLearned} />
          <Question id={afterId} info={AFTER_INFO} infoLabel="What does this ask about energy?">
            {AFTER_QUESTION}
          </Question>
          <WordPicker labelledBy={afterId} kind="after" presets={AFTER_WORDS} own={ownWords} value={after} onChange={setAfter} onAddOwn={addOwn} />
          <Question id={nextId}>{NEXT_TEXT}</Question>
          <NextChoice labelledBy={nextId} next={next} onNext={setNext} />
        </>
      ) : null}
    </Dialog>
  )
}
