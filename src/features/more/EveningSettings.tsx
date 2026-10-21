import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { getSetting, setSetting } from '../../db/repo'
import { OPTIONAL_PURPOSES, type OptionalPurpose } from '../../db/types'
import { PURPOSES } from '../../prompts/bank'
import { DEFAULT_PURPOSES } from '../../prompts/useTonight'
import { Switch } from '../../ui/Switch'
import { useAutosave } from '../../ui/useAutosave'

const HINTS: Record<OptionalPurpose, string> = {
  calm: 'Name the feeling, write it out',
  grow: 'What went well, what to change',
  goal: 'Small steps and if-then plans',
  learn: 'What you learned, how to use it',
}

/** Which purposes the evening question takes turns between, and the goal it asks about. */
export function EveningSettings() {
  const loaded = useLiveQuery(async () => {
    const [purposes, goal] = await Promise.all([
      getSetting<readonly OptionalPurpose[]>('purposes', DEFAULT_PURPOSES),
      getSetting<string>('goal', ''),
    ])
    return { purposes, goal }
  }, [])
  if (loaded === undefined) return <div className="loading" aria-busy="true" />
  return <EveningForm purposes={loaded.purposes} goal={loaded.goal} />
}

function EveningForm({ purposes: initial, goal }: { purposes: readonly OptionalPurpose[]; goal: string }) {
  const goalId = useId()
  // Local copy so each tap shows at once; saving happens in the background.
  const [purposes, setPurposes] = useState(initial)
  const goalField = useAutosave(goal, (value) => setSetting('goal', value.trim()))

  const toggle = (purpose: OptionalPurpose, on: boolean) => {
    const next = OPTIONAL_PURPOSES.filter((p) => (p === purpose ? on : purposes.includes(p)))
    setPurposes(next)
    void setSetting('purposes', next)
  }

  return (
    <section className="card">
      <p className="muted small">Questions take turns. Know myself and joy are always in.</p>
      <div className="reminder-list">
        {OPTIONAL_PURPOSES.map((p) => (
          <div key={p} className="reminder-row">
            <Switch label={PURPOSES[p].label} hint={HINTS[p]} checked={purposes.includes(p)} onChange={(on) => toggle(p, on)} />
          </div>
        ))}
      </div>
      {purposes.includes('goal') ? (
        <>
          <label className="question-text" htmlFor={goalId}>
            What's your goal?
          </label>
          <input
            id={goalId}
            maxLength={80}
            placeholder="e.g. run a half marathon"
            value={goalField.text}
            onChange={(e) => goalField.onChange(e.target.value)}
            onBlur={goalField.onBlur}
          />
          <p className="save-status" aria-live="polite">
            {goalField.status === 'saved' ? 'Saved' : goalField.text.trim() ? '' : 'Goal questions start once this is set.'}
          </p>
        </>
      ) : null}
    </section>
  )
}
