import { useId, useState } from 'react'
import { useUndo } from '../../app/undo'
import { addStep, deleteStep, mergeSteps, restoreStep, setStepStatus, updateStep } from '../../db/repo'
import type { Entry, Step, StepKind } from '../../db/types'
import { findLookAlike, isStale, lookAlikePairs, stepLine } from '../../domain/steps'
import { shortDate } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { Dialog } from '../../ui/Dialog'
import { revealOnMount } from '../../ui/keepInView'
import { SwipeRow } from '../../ui/SwipeRow'
import { entryTitle } from '../today/EntryRow'
import { Evidence } from './Evidence'

// Next steps you can manage (v0.11, owner: "a separate section … where I can see and manage them"). See
// src/domain/steps.ts for why they work the way they do.

export const KIND_LABELS: Record<StepKind, string> = { once: 'Once', ongoing: 'Ongoing' }

const byRecent = (a: Step, b: Step) => b.updatedAt - a.updatedAt

/** On Insights' first page: what you're working on, up to three, and the way to the whole list. */
export function NextStepsCard({ steps }: { steps: readonly Step[] }) {
  const headingId = useId()
  const working = steps.filter((s) => s.status === 'active').sort(byRecent)
  return (
    <section className="card week-card" aria-labelledby={headingId}>
      <h3 id={headingId}>Next steps</h3>
      {working.length ? (
        <ul className="plain-list compact">
          {working.slice(0, 3).map((s) => (
            <li key={s.id}>
              {stepLine(s)} <span className="muted small">· {KIND_LABELS[s.kind]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">What you decide to do after an entry lands here.</p>
      )}
      <a className="small-link" href={hashFor('insights', 'steps')}>
        All next steps ›
      </a>
    </section>
  )
}

/** One step in a list: its words (cue first), how often, and where it came from. */
function StepRow({ step, entries, onOpen }: { step: Step; entries: ReadonlyMap<string, Entry>; onOpen: () => void }) {
  const from = step.entryIds.map((id) => entries.get(id)).find((e): e is Entry => e !== undefined)
  const finished = step.status !== 'active' && step.finishedAt !== null
  const meta = finished
    ? `${step.status === 'done' ? 'Done' : 'Stopped'} ${shortDate(step.finishedAt ?? 0)}`
    : `${KIND_LABELS[step.kind]}${from ? ` · from ${entryTitle(from)}` : step.entryIds.length === 0 ? ' · added by you' : ''}`
  return (
    <button type="button" className="entry-row step-row" onClick={onOpen}>
      <span className="entry-text">
        <span className="entry-activity">{stepLine(step)}</span>
        <span className="entry-feelings">{meta}</span>
      </span>
    </button>
  )
}

/**
 * Insights → Next steps: working on, not touched lately, and finished (collapsed). Add one by hand, open one to
 * change it, swipe to delete (with Undo), and merge two that say the same.
 */
export function NextStepsPage({ steps, entries }: { steps: readonly Step[]; entries: ReadonlyMap<string, Entry> }) {
  const [editing, setEditing] = useState<Step | 'new' | null>(null)
  const offerUndo = useUndo()
  const now = Date.now()
  const working = steps.filter((s) => s.status === 'active').sort(byRecent)
  const fresh = working.filter((s) => !isStale(s, now))
  const stale = working.filter((s) => isStale(s, now))
  const finished = steps.filter((s) => s.status !== 'active').sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
  const pairs = lookAlikePairs(working)

  const remove = async (step: Step) => {
    await deleteStep(step.id)
    offerUndo('Next step deleted', () => restoreStep(step))
  }
  const row = (step: Step) => (
    <li key={step.id}>
      <SwipeRow deleteLabel={`Delete ${step.text}`} onDelete={() => void remove(step)}>
        <StepRow step={step} entries={entries} onOpen={() => setEditing(step)} />
      </SwipeRow>
    </li>
  )

  return (
    <>
      <a className="back-link" href={hashFor('insights')}>
        ‹ Insights
      </a>
      <h1>Next steps</h1>
      <button type="button" className="primary wide" onClick={() => setEditing('new')}>
        + Add a next step
      </button>

      {pairs.length ? (
        <section className="card top-gap" aria-label="These look alike">
          <h2>These look alike</h2>
          <ul className="plain-list">
            {pairs.map(([a, b]) => {
              // The one with more entries behind it stays; on a tie, the older one.
              const [keep, gone] = b.entryIds.length > a.entryIds.length || (b.entryIds.length === a.entryIds.length && b.createdAt < a.createdAt) ? [b, a] : [a, b]
              return (
                <li key={`${a.id}:${b.id}`} className="pair">
                  <span>
                    “{a.text}” and “{b.text}”
                  </span>
                  <button type="button" onClick={() => void mergeSteps(keep.id, gone.id)}>
                    Merge
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <h2 className="section-title">Working on</h2>
      {fresh.length ? (
        <ul className="entry-list">{fresh.map(row)}</ul>
      ) : (
        <p className="muted">Nothing yet. After an entry, “Anything you'd like to do with this?” keeps one here.</p>
      )}

      {stale.length ? (
        <>
          <h2 className="section-title">Not touched lately</h2>
          <ul className="plain-list">
            {stale.map((s) => (
              <li key={s.id} className="stale-step">
                <span>{stepLine(s)}</span>
                <span className="row">
                  <button type="button" onClick={() => void setStepStatus(s.id, 'active')}>
                    Keep
                  </button>
                  <button type="button" className="link" onClick={() => void setStepStatus(s.id, s.kind === 'once' ? 'done' : 'stopped')}>
                    Finish
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {finished.length ? (
        <details className="card finished-steps top-gap">
          <summary>Finished ({finished.length})</summary>
          <ul className="entry-list">{finished.map(row)}</ul>
        </details>
      ) : null}

      {editing ? <StepSheet step={editing === 'new' ? null : editing} steps={steps} entries={entries} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

/** Add a step by hand, or change one: its words, when, how often; finish, take it up again, merge or delete it. */
function StepSheet({ step, steps, entries, onClose }: { step: Step | null; steps: readonly Step[]; entries: ReadonlyMap<string, Entry>; onClose: () => void }) {
  const textId = useId()
  const whenId = useId()
  const kindId = useId()
  const mergeId = useId()
  const offerUndo = useUndo()
  const [text, setText] = useState(step?.text ?? '')
  const [when, setWhen] = useState(step?.when ?? '')
  const [kind, setKind] = useState<StepKind>(step?.kind ?? 'once')
  const [same, setSame] = useState<Step | null>(null)
  const others = steps.filter((s) => s.status === 'active' && s.id !== step?.id)

  const keepNew = async () => {
    const found = same === null ? findLookAlike(text, steps) : undefined
    if (found) {
      setSame(found)
      return
    }
    await addStep({ text, when, kind })
    onClose()
  }
  const save = async () => {
    if (step && (text.trim() !== step.text || when.trim() !== step.when || kind !== step.kind)) await updateStep(step.id, { text: text.trim(), when: when.trim(), kind })
    onClose()
  }

  const footer = (
    <button type="button" className="primary wide" disabled={!text.trim()} onClick={() => void (step ? save() : keepNew())}>
      {step ? 'Save' : 'Keep'}
    </button>
  )

  return (
    <Dialog title={step ? 'Next step' : 'New next step'} onClose={onClose} footer={footer}>
      <label className="question-text" htmlFor={textId}>
        What will you do?
      </label>
      <input id={textId} data-autofocus value={text} maxLength={200} autoCapitalize="sentences" placeholder="e.g. Walk 10 minutes" onChange={(e) => setText(e.target.value)} />
      <label className="question-text" htmlFor={whenId}>
        When? <span className="muted small">Optional</span>
      </label>
      <input id={whenId} value={when} maxLength={80} placeholder="e.g. after dinner" onChange={(e) => setWhen(e.target.value)} />
      <p className="question-text" id={kindId}>
        How often?
      </p>
      <div className="chip-row" role="group" aria-labelledby={kindId}>
        {(['once', 'ongoing'] as const).map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {same ? (
        <div className="same-as" ref={revealOnMount}>
          <p>Same as “{stepLine(same)}”?</p>
          <div className="row">
            <button
              type="button"
              onClick={() => {
                void setStepStatus(same.id, 'active')
                onClose()
              }}
            >
              Same
            </button>
            <button
              type="button"
              className="link"
              onClick={() => {
                void addStep({ text, when, kind }).then(onClose)
              }}
            >
              Different
            </button>
          </div>
        </div>
      ) : null}

      {step ? (
        <>
          {step.entryIds.some((id) => entries.has(id)) ? (
            <>
              <h3>From</h3>
              <Evidence ids={step.entryIds} entries={entries} />
            </>
          ) : null}
          <div className="row top-gap">
            {step.status === 'active' ? (
              <button
                type="button"
                onClick={() => {
                  void setStepStatus(step.id, step.kind === 'once' ? 'done' : 'stopped')
                  onClose()
                }}
              >
                {step.kind === 'once' ? 'I did it' : 'Stop doing it'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void setStepStatus(step.id, 'active')
                  onClose()
                }}
              >
                Take it up again
              </button>
            )}
            <button
              type="button"
              className="link danger-text"
              onClick={() => {
                void deleteStep(step.id).then(() => offerUndo('Next step deleted', () => restoreStep(step)))
                onClose()
              }}
            >
              Delete
            </button>
          </div>
          {others.length ? (
            <div className="top-gap">
              <label className="muted small" htmlFor={mergeId}>
                Says the same as another?
              </label>
              <select
                id={mergeId}
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  void mergeSteps(e.target.value, step.id)
                  onClose()
                }}
              >
                <option value="">Merge into…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {stepLine(o)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </>
      ) : null}
    </Dialog>
  )
}
