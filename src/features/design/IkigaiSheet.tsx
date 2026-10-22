import { useId, useState } from 'react'
import { deleteIkigaiItem, saveIkigaiItem } from '../../db/repo'
import type { IkigaiItem } from '../../db/types'
import { type Circle, CIRCLES } from '../../domain/ikigai'
import { Dialog } from '../../ui/Dialog'

/** A new item started from "Your days suggest": the activity's name, already linked. */
export interface IkigaiDraft {
  text: string
  linkedActivities: string[]
}

interface Props {
  /** The item to change; without it, a new one. */
  existing?: IkigaiItem
  draft?: IkigaiDraft
  /** Your activity names, recent first, to link as evidence. */
  activities: readonly string[]
  onClose: () => void
}

const ACTIVITY_CHIPS_MAX = 8
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Add to the Ikigai map or change an item: name it, tap what's true, and link the activities that are part of it. */
export function IkigaiSheet({ existing, draft, activities, onClose }: Props) {
  const nameId = useId()
  const circlesId = useId()
  const activitiesId = useId()
  const [text, setText] = useState(existing?.text ?? draft?.text ?? '')
  const [circles, setCircles] = useState<Record<Circle, boolean>>(() => ({
    love: existing?.love ?? false,
    goodAt: existing?.goodAt ?? false,
    worldNeeds: existing?.worldNeeds ?? false,
    paidFor: existing?.paidFor ?? false,
  }))
  const [linked, setLinked] = useState<string[]>(() => [...(existing?.linkedActivities ?? draft?.linkedActivities ?? [])])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  // What's linked already comes first, then your recent activities; each name once.
  const choices = [...linked, ...activities]
    .filter((name, i, all) => all.findIndex((other) => same(other, name)) === i)
    .slice(0, Math.max(ACTIVITY_CHIPS_MAX, linked.length))
  const isLinked = (name: string) => linked.some((l) => same(l, name))
  const toggleLinked = (name: string) => setLinked((current) => (isLinked(name) ? current.filter((l) => !same(l, name)) : [...current, name]))

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch {
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  const save = () =>
    run(() =>
      saveIkigaiItem({
        id: existing?.id ?? crypto.randomUUID(),
        text,
        ...circles,
        linkedActivities: linked,
        notes: existing?.notes ?? '',
        createdAt: existing?.createdAt ?? 0,
        updatedAt: existing?.updatedAt ?? 0,
      }),
    )

  const footer = (
    <>
      <button type="button" className="primary wide" disabled={!text.trim() || busy} onClick={() => void save()}>
        {existing ? 'Save' : 'Add'}
      </button>
      {existing ? (
        confirmDelete ? (
          <div className="row">
            <span className="grow">Take this off the map?</span>
            <button type="button" className="danger" disabled={busy} onClick={() => void run(() => deleteIkigaiItem(existing.id))}>
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
        )
      ) : null}
    </>
  )

  return (
    <Dialog title={existing ? existing.text : 'Add to the map'} onClose={onClose} footer={footer}>
      <label className="question-text" htmlFor={nameId}>
        What is it?
      </label>
      <input
        id={nameId}
        data-autofocus={existing || draft ? undefined : ''}
        value={text}
        maxLength={80}
        autoCapitalize="sentences"
        enterKeyHint="done"
        placeholder="e.g. Teaching, gardening, writing"
        onChange={(e) => setText(e.target.value)}
      />
      <p className="question-text" id={circlesId}>
        Tap what's true
      </p>
      <div role="group" aria-labelledby={circlesId} className="chip-row">
        {CIRCLES.map((c) => (
          <button key={c.key} type="button" className="chip" aria-pressed={circles[c.key]} onClick={() => setCircles((v) => ({ ...v, [c.key]: !v[c.key] }))}>
            {c.statement}
          </button>
        ))}
      </div>
      {choices.length ? (
        <>
          <p className="question-text" id={activitiesId}>
            Which activities are part of it?
          </p>
          <div role="group" aria-labelledby={activitiesId} className="chip-row">
            {choices.map((name) => (
              <button key={name.toLowerCase()} type="button" className="chip" aria-pressed={isLinked(name)} onClick={() => toggleLinked(name)}>
                {name}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </Dialog>
  )
}
