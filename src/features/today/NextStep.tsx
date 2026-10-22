import { useId, useState } from 'react'
import { patchEntry, setIntentionStatus } from '../../db/repo'
import type { Entry, IntentionKind } from '../../db/types'
import { INTENTION_OPTIONS, intentionLabel, isFollowUp, NEXT_STEP_DETAIL, NEXT_STEP_QUESTION, NOTHING_FOR_NOW } from '../../domain/intentions'

/**
 * "Anything you'd like to do with this?" (Stage F): an optional next step, never forced. Once chosen it shows
 * with its follow-up: done, or let go. "Not yet" is fine and needs no tap.
 */
export function NextStep({ entry }: { entry: Entry }) {
  const groupId = useId()
  const detailId = useId()
  const [kind, setKind] = useState<IntentionKind | null>(null)
  const [text, setText] = useState('')
  const [nothing, setNothing] = useState(false)
  const { intention } = entry

  if (intention) {
    const label = intentionLabel(intention.kind)
    return (
      <section className="next-step" aria-label="Next step">
        <h3>{intention.kind === 'remember' ? 'To remember' : 'Next step'}</h3>
        <p>
          {intention.kind === 'remember' ? null : <span className="muted">{label}: </span>}
          {intention.text || label}
        </p>
        {isFollowUp(intention) ? (
          intention.status === 'open' ? (
            <div className="row">
              <button type="button" onClick={() => void setIntentionStatus(entry, 'done')}>
                Done it
              </button>
              <button type="button" className="link" onClick={() => void setIntentionStatus(entry, 'dropped')}>
                Let it go
              </button>
            </div>
          ) : (
            <p className="muted small">{intention.status === 'done' ? '✓ Done' : 'Let go'}</p>
          )
        ) : null}
        <button type="button" className="link small-link" onClick={() => void patchEntry(entry.id, { intention: null })}>
          Remove
        </button>
      </section>
    )
  }

  if (nothing) return null
  const option = INTENTION_OPTIONS.find((o) => o.value === kind)
  return (
    <section className="next-step">
      <h3 id={groupId}>{NEXT_STEP_QUESTION}</h3>
      <div role="group" aria-labelledby={groupId} className="chip-row">
        {INTENTION_OPTIONS.map((o) => (
          <button key={o.value} type="button" className="chip" aria-pressed={kind === o.value} onClick={() => setKind(kind === o.value ? null : o.value)}>
            {o.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setNothing(true)}>
          {NOTHING_FOR_NOW}
        </button>
      </div>
      {option ? (
        <>
          <label className="question-text" htmlFor={detailId}>
            {NEXT_STEP_DETAIL}
          </label>
          <input id={detailId} value={text} maxLength={200} autoCapitalize="sentences" placeholder={option.placeholder} onChange={(e) => setText(e.target.value)} />
          <button
            type="button"
            className="top-gap"
            onClick={() => void patchEntry(entry.id, { intention: { kind: option.value, text, status: 'open', updatedAt: Date.now() } })}
          >
            Keep this
          </button>
        </>
      ) : null}
    </section>
  )
}
