import { useId, useRef } from 'react'
import { saveAnswer, setSetting } from '../../db/repo'
import { nextTonight } from '../../prompts/pick'
import { eveningStarters } from '../../prompts/starters'
import type { Tonight, TonightChoice } from '../../prompts/useTonight'
import { Question } from '../../ui/Question'
import { Starters, typeInto } from '../../ui/Starters'
import { useAutosave } from '../../ui/useAutosave'

/** The changing evening question: optional, saves as you type, and can be swapped until it's answered. */
export function EveningQuestion({ date, tonight }: { date: string; tonight: Tonight }) {
  const id = useId()
  const { prompt } = tonight
  const answer = useRef(tonight.answer)
  const box = useRef<HTMLTextAreaElement>(null)
  const field = useAutosave(tonight.answer?.text ?? '', async (value) => {
    const saved = await saveAnswer(date, prompt, value, answer.current ?? undefined)
    if (saved) answer.current = saved
  })

  const canSwap = field.text.trim() === '' && !tonight.answer?.text.trim()
  const another = () => {
    const choice: TonightChoice = { date, promptId: nextTonight(tonight.input, prompt.id).id }
    void setSetting('tonightPrompt', choice)
  }

  return (
    <div className="evening-field">
      <Question
        as="label"
        htmlFor={id}
        info={prompt.method}
        infoLabel="Why this question?"
        actions={
          canSwap ? (
            <button type="button" className="link swap" aria-label="Another question" title="Another question" onClick={another}>
              ↻
            </button>
          ) : null
        }
      >
        {prompt.question}
      </Question>
      <textarea
        ref={box}
        id={id}
        value={field.text}
        rows={2}
        maxLength={2000}
        placeholder="Optional"
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
      />
      <div className="field-foot">
        {field.text.trim() === '' ? (
          <Starters starters={eveningStarters(prompt.purpose)} onPick={(text) => typeInto(box.current, text, field.onChange)} />
        ) : null}
        <p className="save-status" aria-live="polite">
          {field.status === 'saving' ? 'Saving…' : field.status === 'saved' ? 'Saved' : ''}
        </p>
      </div>
    </div>
  )
}
