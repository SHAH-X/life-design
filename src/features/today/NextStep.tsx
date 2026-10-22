import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { addStep, linkStep, patchEntry } from '../../db/repo'
import type { Entry, IntentionKind, Step } from '../../db/types'
import { INTENTION_OPTIONS, NEXT_STEP_DETAIL, NEXT_STEP_QUESTION, NOTHING_FOR_NOW } from '../../domain/intentions'
import { findLookAlike, kindFor, stepLine } from '../../domain/steps'
import { hashFor } from '../../lib/route'
import { revealOnMount } from '../../ui/keepInView'

/**
 * "Anything you'd like to do with this?" (Stage F): optional, never forced. A step to do or try joins your list of
 * next steps (Insights → Next steps, v0.11), where you manage it; one that says the same as a step you have joins
 * that instead. "Remember this" stays with the entry (What I'm learning). Once kept, the entry just shows it: there
 * is nothing to tick at the moment of writing (owner: "I am writing it for future, how can I have done it?").
 */
export function NextStep({ entry }: { entry: Entry }) {
  const groupId = useId()
  const detailId = useId()
  const whenId = useId()
  const steps = useLiveQuery(() => db.steps.toArray(), [])
  const [kind, setKind] = useState<IntentionKind | null>(null)
  const [text, setText] = useState('')
  const [when, setWhen] = useState('')
  const [nothing, setNothing] = useState(false)
  const [same, setSame] = useState<Step | null>(null)
  if (steps === undefined) return null

  const linked = steps.filter((s) => s.entryIds.includes(entry.id))
  const remember = entry.intention?.kind === 'remember' ? entry.intention : null
  if (linked.length || remember) {
    return (
      <section className="next-step" aria-label="Next step">
        {linked.map((s) => (
          <p key={s.id}>
            <span className="muted">Next step: </span>
            {stepLine(s)}
          </p>
        ))}
        {remember ? (
          <p>
            <span className="muted">To remember: </span>
            {remember.text || 'This entry'}
          </p>
        ) : null}
        {linked.length ? (
          <a className="small-link" href={hashFor('insights', 'steps')}>
            Next steps ›
          </a>
        ) : null}
      </section>
    )
  }

  if (nothing) return null
  const option = INTENTION_OPTIONS.find((o) => o.value === kind)
  const words = text.trim() || option?.label || ''
  const add = () => (option ? addStep({ text: words, when, kind: kindFor(option.value), entry }) : Promise.resolve())

  const keep = async () => {
    if (!option) return
    if (option.value === 'remember') {
      await patchEntry(entry.id, { intention: { kind: 'remember', text, status: 'open', updatedAt: Date.now() } })
      return
    }
    const found = findLookAlike(words, steps)
    if (found) setSame(found)
    else await add()
  }

  return (
    <section className="next-step">
      <h3 id={groupId}>{NEXT_STEP_QUESTION}</h3>
      <div role="group" aria-labelledby={groupId} className="chip-row">
        {INTENTION_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className="chip"
            aria-pressed={kind === o.value}
            onClick={() => {
              setKind(kind === o.value ? null : o.value)
              setSame(null)
            }}
          >
            {o.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setNothing(true)}>
          {NOTHING_FOR_NOW}
        </button>
      </div>
      {option ? (
        <div ref={revealOnMount}>
          <label className="question-text" htmlFor={detailId}>
            {NEXT_STEP_DETAIL}
          </label>
          <input id={detailId} value={text} maxLength={200} autoCapitalize="sentences" placeholder={option.placeholder} onChange={(e) => setText(e.target.value)} />
          {option.value === 'remember' ? null : (
            <>
              <label className="question-text" htmlFor={whenId}>
                When? <span className="muted small">Optional</span>
              </label>
              <input id={whenId} value={when} maxLength={80} placeholder="e.g. after dinner" onChange={(e) => setWhen(e.target.value)} />
            </>
          )}
          {same ? (
            <div className="same-as" ref={revealOnMount}>
              <p>Same as “{stepLine(same)}”?</p>
              <div className="row">
                <button type="button" onClick={() => void linkStep(same.id, entry.id)}>
                  Same
                </button>
                <button type="button" className="link" onClick={() => void add()}>
                  Different
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="top-gap" onClick={() => void keep()}>
              Keep this
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}
