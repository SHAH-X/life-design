import { useId } from 'react'
import type { Reflection } from '../../db/types'

/**
 * Answers written under separate questions (v0.8.0, before the one writing box): kept as they were, each under its
 * question, and still editable. New entries never have them.
 */
export function EarlierAnswers({ answers, onChange }: { answers: readonly Reflection[]; onChange: (answers: Reflection[]) => void }) {
  const baseId = useId()
  if (answers.length === 0) return null
  return (
    <>
      {answers.map((a, i) => (
        <div key={`${i}:${a.question}`} className="earlier-answer">
          <label className="question-text" htmlFor={`${baseId}-${i}`}>
            {a.question}
          </label>
          <textarea
            id={`${baseId}-${i}`}
            value={a.text}
            rows={3}
            maxLength={4000}
            onChange={(e) => onChange(answers.map((b, j) => (j === i ? { ...b, text: e.target.value } : b)))}
          />
        </div>
      ))}
    </>
  )
}
