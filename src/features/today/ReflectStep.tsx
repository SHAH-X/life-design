import { useId } from 'react'
import type { Purpose } from '../../db/types'
import { type EntryQuestion, PURPOSE_KEYS, purposeInfo } from '../../domain/purposes'
import { Question } from '../../ui/Question'

/** A purpose question on screen, with its answer so far. */
export interface ShownQuestion {
  id: string
  question: string
  text: string
}

export const MAX_QUESTIONS = 3

/** The next question not on screen yet, if any. */
export function nextQuestion(candidates: readonly EntryQuestion[], shown: readonly ShownQuestion[]): EntryQuestion | undefined {
  return candidates.find((c) => !shown.some((s) => s.id === c.id))
}

/** When the purpose changes, answered questions stay; unanswered ones make way for the new purpose's first. */
export function questionsForPurpose(candidates: readonly EntryQuestion[], shown: readonly ShownQuestion[]): ShownQuestion[] {
  const answered = shown.filter((s) => s.text.trim())
  const first = nextQuestion(candidates, answered)
  return answered.length || !first ? answered : [{ id: first.id, question: first.text, text: '' }]
}

interface Props {
  purpose: Purpose
  onPurpose: (purpose: Purpose) => void
  candidates: readonly EntryQuestion[]
  shown: readonly ShownQuestion[]
  onShown: (shown: ShownQuestion[]) => void
}

/**
 * Reflection for the entry's purpose (Stage C): one question at a time, up to three, each one optional. Another
 * purpose can be chosen just for this entry.
 */
export function ReflectStep({ purpose, onPurpose, candidates, shown, onShown }: Props) {
  const selectId = useId()
  const baseId = useId()
  const info = purposeInfo(purpose)
  const next = nextQuestion(candidates, shown)

  const swap = (index: number) => {
    const others = shown.filter((_, i) => i !== index)
    const replacement = candidates.find((c) => !shown.some((s) => s.id === c.id) && !others.some((s) => s.id === c.id))
    if (!replacement) return
    onShown(shown.map((s, i) => (i === index ? { id: replacement.id, question: replacement.text, text: '' } : s)))
  }

  return (
    <>
      <div className="purpose-line">
        <label htmlFor={selectId}>For</label>
        <select id={selectId} value={purpose} onChange={(e) => onPurpose(e.target.value as Purpose)}>
          {PURPOSE_KEYS.map((key) => (
            <option key={key} value={key}>
              {purposeInfo(key).label}
            </option>
          ))}
        </select>
      </div>
      {info.gentle ? <p className="field-help gentle">{info.gentle}</p> : null}
      {shown.map((q, i) => (
        <div key={q.id} className="reflection">
          <Question
            as="label"
            htmlFor={`${baseId}-${i}`}
            actions={
              q.text.trim() === '' && nextQuestion(candidates, shown) ? (
                <button type="button" className="link swap" aria-label="A different question" title="A different question" onClick={() => swap(i)}>
                  ↻
                </button>
              ) : null
            }
          >
            {q.question}
          </Question>
          <textarea
            id={`${baseId}-${i}`}
            value={q.text}
            rows={3}
            maxLength={4000}
            placeholder="Optional"
            onChange={(e) => onShown(shown.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)))}
          />
        </div>
      ))}
      {purpose === 'free' ? <p className="muted">No questions: write anything on the next screen.</p> : null}
      {next && shown.length < MAX_QUESTIONS ? (
        <button type="button" className="link" onClick={() => onShown([...shown, { id: next.id, question: next.text, text: '' }])}>
          + Another question
        </button>
      ) : null}
    </>
  )
}
