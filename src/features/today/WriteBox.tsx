import { type Ref, useId, useState } from 'react'
import type { Purpose, Step } from '../../db/types'
import { type EntryQuestion, HELPERS_SHOWN, helpersPage, PURPOSE_KEYS, purposeInfo } from '../../domain/purposes'
import { stepLine } from '../../domain/steps'
import { Question } from '../../ui/Question'

export const WRITE_QUESTION = "What's on your mind about it?"

interface Props {
  /** The writing box's id. */
  id: string
  purpose: Purpose
  /** Another purpose, just for this entry: its questions replace the helpers. */
  onPurpose: (purpose: Purpose) => void
  /** This purpose's questions for the entry, best first (`questionsFor`). */
  candidates: readonly EntryQuestion[]
  /** Your own focus for this purpose (`focusFor`), or ''. */
  focus: string
  text: string
  onText: (text: string) => void
  boxRef?: Ref<HTMLTextAreaElement>
  headingRef?: Ref<HTMLHeadingElement>
  /** Your next steps for this activity (v0.11): they come back here, and a once-step can be ticked. */
  plans?: readonly Step[]
  /** Once-steps ticked here. */
  didIt?: readonly string[]
  onDidIt?: (step: Step, done: boolean) => void
}

/**
 * One box to write about an activity (v0.9: "just one box … without thinking how much to include against which
 * question"). Your purpose's questions sit above it as helpers to think with, never as fields to fill.
 */
export function WriteBox({ id, purpose, onPurpose, candidates, focus, text, onText, boxRef, headingRef, plans = [], didIt = [], onDidIt }: Props) {
  const questionId = useId()
  const selectId = useId()
  const [page, setPage] = useState(0)
  const info = purposeInfo(purpose)
  const helpers = helpersPage(candidates, page)

  return (
    <>
      <Question id={questionId} headingRef={headingRef}>
        {WRITE_QUESTION}
      </Question>
      {plans.length ? (
        <div className="plans">
          <p className="plans-title">Your plan for this</p>
          <ul className="plain-list compact">
            {plans.map((p) => (
              <li key={p.id}>
                <span>{stepLine(p)}</span>
                {p.kind === 'once' && onDidIt ? (
                  <label className="did-it">
                    <input type="checkbox" checked={didIt.includes(p.id)} onChange={(e) => onDidIt(p, e.target.checked)} />
                    Did it
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="helpers">
        <div className="purpose-line">
          <label htmlFor={selectId}>Questions for</label>
          <select
            id={selectId}
            value={purpose}
            onChange={(e) => {
              setPage(0)
              onPurpose(e.target.value as Purpose)
            }}
          >
            {PURPOSE_KEYS.map((key) => (
              <option key={key} value={key}>
                {purposeInfo(key).label}
              </option>
            ))}
          </select>
        </div>
        {focus ? <p className="helper-focus">Your focus: {focus}</p> : null}
        {info.gentle ? <p className="field-help gentle">{info.gentle}</p> : null}
        {helpers.length ? (
          <ul className="helper-list" aria-label="Questions to think about">
            {helpers.map((q) => (
              <li key={q.id}>{q.text}</li>
            ))}
          </ul>
        ) : null}
        {candidates.length > HELPERS_SHOWN ? (
          <button type="button" className="link" onClick={() => setPage((p) => p + 1)}>
            ↻ Other questions
          </button>
        ) : null}
      </div>
      <textarea
        ref={boxRef}
        id={id}
        aria-labelledby={questionId}
        value={text}
        rows={6}
        maxLength={20000}
        placeholder="Optional"
        onChange={(e) => onText(e.target.value)}
      />
    </>
  )
}
