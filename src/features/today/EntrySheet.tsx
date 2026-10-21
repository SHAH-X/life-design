import { useId, useState } from 'react'
import { deleteEntry, type Suggestions, saveEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
import { ENERGY_LEVELS, type Energy, ENGAGEMENT_LEVELS, type Engagement } from '../../domain/scales'
import { DAY_PARTS, type DayPart, partOfDay, toDateKey } from '../../lib/dates'
import { ChipPicker } from '../../ui/ChipPicker'
import { Dialog } from '../../ui/Dialog'
import { Segmented } from '../../ui/Segmented'
import { Switch } from '../../ui/Switch'

interface Props {
  date: string
  existing?: Entry
  suggestions: Suggestions
  onClose: () => void
}

export function EntrySheet({ date, existing, suggestions, onClose }: Props) {
  const activityId = useId()
  const noteId = useId()
  const [activity, setActivity] = useState(existing?.activity ?? '')
  const [part, setPart] = useState<DayPart>(() => existing?.part ?? (date === toDateKey(new Date()) ? partOfDay(new Date()) : 'evening'))
  const [engagement, setEngagement] = useState<Engagement | null>(existing?.engagement ?? null)
  const [energy, setEnergy] = useState<Energy | null>(existing?.energy ?? null)
  const [flow, setFlow] = useState(existing?.flow ?? false)
  const [where, setWhere] = useState<string[]>(existing?.where ?? [])
  const [people, setPeople] = useState<string[]>(existing?.people ?? [])
  const [objects, setObjects] = useState<string[]>(existing?.objects ?? [])
  const [note, setNote] = useState(existing?.note ?? '')
  const [showDetail, setShowDetail] = useState(
    Boolean(existing && (existing.where.length || existing.people.length || existing.objects.length || existing.note)),
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const missing = [!activity.trim() && 'what you did', engagement === null && 'engagement', energy === null && 'energy'].filter(
    (x): x is string => Boolean(x),
  )
  const recent = suggestions.activities.filter((a) => a.toLowerCase() !== activity.trim().toLowerCase()).slice(0, 6)

  async function save() {
    if (missing.length > 0 || engagement === null || energy === null) return
    setBusy(true)
    try {
      await saveEntry({ date, part, activity, engagement, energy, flow, where, people, objects, note }, existing)
      onClose()
    } catch {
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  async function remove() {
    if (!existing) return
    setBusy(true)
    try {
      await deleteEntry(existing.id)
      onClose()
    } catch {
      setBusy(false)
    }
  }

  const footer = (
    <>
      {missing.length > 0 ? <p className="muted small">Still needed: {missing.join(', ')}.</p> : null}
      <button type="button" className="primary wide" disabled={missing.length > 0 || busy} onClick={() => void save()}>
        Save
      </button>
      {existing ? (
        confirmDelete ? (
          <div className="row">
            <span className="grow">Delete this activity?</span>
            <button type="button" className="danger" disabled={busy} onClick={() => void remove()}>
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
    <Dialog title={existing ? 'Edit activity' : 'New activity'} onClose={onClose} footer={footer}>
      <label className="field" htmlFor={activityId}>
        <span>What did you do?</span>
      </label>
      <input
        id={activityId}
        value={activity}
        maxLength={120}
        autoCapitalize="sentences"
        enterKeyHint="done"
        placeholder="e.g. Team meeting, cooking, a run"
        onChange={(e) => setActivity(e.target.value)}
      />
      {recent.length > 0 ? (
        <div className="chip-row recent">
          {recent.map((a) => (
            <button key={a.toLowerCase()} type="button" className="chip" onClick={() => setActivity(a)}>
              {a}
            </button>
          ))}
        </div>
      ) : null}

      <Segmented legend="When" options={DAY_PARTS} value={part} onChange={setPart} />

      <Segmented
        legend="Engagement"
        options={ENGAGEMENT_LEVELS}
        value={engagement}
        onChange={setEngagement}
        ends={['Bored', 'Absorbed']}
      />

      <Segmented
        legend="Energy"
        tone="energy"
        options={ENERGY_LEVELS}
        value={energy}
        onChange={setEnergy}
        ends={['Drained', 'Energised']}
      />

      <Switch label="I lost track of time" hint="A sign of flow" checked={flow} onChange={setFlow} />

      {showDetail ? (
        <>
          <ChipPicker legend="Where" values={where} suggestions={suggestions.where} onChange={setWhere} placeholder="e.g. Home, office" />
          <ChipPicker legend="With whom" values={people} suggestions={suggestions.people} onChange={setPeople} placeholder="e.g. Alex, team" />
          <ChipPicker legend="Using" values={objects} suggestions={suggestions.objects} onChange={setObjects} placeholder="e.g. Laptop, guitar" />
          <label className="field" htmlFor={noteId}>
            <span>Note</span>
          </label>
          <textarea id={noteId} value={note} maxLength={1000} placeholder="Anything that made it better or worse?" onChange={(e) => setNote(e.target.value)} />
        </>
      ) : (
        <button type="button" className="link" onClick={() => setShowDetail(true)}>
          + Where, with whom, using what (optional)
        </button>
      )}
    </Dialog>
  )
}
