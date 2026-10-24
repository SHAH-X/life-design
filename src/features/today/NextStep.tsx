import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { addStep, linkStep, patchEntry } from '../../db/repo'
import type { Entry, IntentionKind, Step } from '../../db/types'
import { INTENTION_OPTIONS, NEXT_STEP_DETAIL, NEXT_STEP_QUESTION, NOTHING_FOR_NOW } from '../../domain/intentions'
import { findLookAlike, kindFor, stepLine } from '../../domain/steps'
import { hashFor } from '../../lib/route'
import { Dialog } from '../../ui/Dialog'
import { revealOnMount } from '../../ui/keepInView'
import { useEntryTitle } from '../areas/AreasProvider'

/**
 * "Anything you'd like to do with this?" (Stage F): optional, never forced. A step to do or try joins your list of
 * next steps (Insights → Next steps, v0.11), where you manage it; one that says the same as a step you have joins
 * that instead. "Remember this" stays with the entry (What you're learning). Once kept, the entry just shows it: there
 * is nothing to tick at the moment of writing (owner: "I am writing it for future, how can I have done it?").
 * What you keep to remember opens with a tap to change or remove (v0.12.3); a next step opens your list.
 */
export function NextStep({ entry, onRemember }: { entry: Entry; onRemember: () => void }) {
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
      <section className="entry-parts" aria-label="Next step">
        {linked.map((s) => (
          <a key={s.id} className="part-row" href={hashFor('insights', 'steps')}>
            <span className="part-label">Next step</span>{' '}
            <span className="part-value">{stepLine(s)}</span>
            <span className="part-chevron" aria-hidden="true">
              ›
            </span>
          </a>
        ))}
        {remember ? (
          <button type="button" className="part-row" onClick={onRemember}>
            <span className="part-label">To remember</span>{' '}
            <span className="part-value">{remember.text || THE_WHOLE_ENTRY}</span>
            <span className="part-chevron" aria-hidden="true">
              ›
            </span>
          </button>
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

/** What "Remember this" keeps when you give it no words of its own (until v0.12.3 it read "This entry"). */
const THE_WHOLE_ENTRY = 'The whole entry'

/** "To remember", changed or removed (owner, 2026-10-23: "there is no option to edit the 'to remember' part"). */
export function RememberEdit({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const entryTitle = useEntryTitle()
  const id = useId()
  const remember = entry.intention?.kind === 'remember' ? entry.intention : null
  const [text, setText] = useState(remember?.text ?? '')
  const placeholder = INTENTION_OPTIONS.find((o) => o.value === 'remember')?.placeholder
  const save = async () => {
    await patchEntry(entry.id, { intention: { kind: 'remember', text, status: remember?.status ?? 'open', updatedAt: Date.now() } })
    onClose()
  }
  // Removed, the entry asks its next-step question again.
  const remove = async () => {
    await patchEntry(entry.id, { intention: undefined })
    onClose()
  }
  const footer = (
    <div className="footer-row">
      <button type="button" className="link" onClick={() => void remove()}>
        Remove
      </button>
      <button type="button" className="primary" onClick={() => void save()}>
        Save
      </button>
    </div>
  )
  return (
    <Dialog title={entryTitle(entry)} onClose={onClose} footer={footer} full>
      <label className="question-text" htmlFor={id}>
        {NEXT_STEP_DETAIL}
      </label>
      <input id={id} data-autofocus value={text} maxLength={200} autoCapitalize="sentences" placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      <p className="muted small">Left empty, the whole entry is kept to remember.</p>
    </Dialog>
  )
}
