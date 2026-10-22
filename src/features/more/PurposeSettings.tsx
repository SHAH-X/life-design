import { useId, useState } from 'react'
import { setPurposeFocus, setSetting } from '../../db/repo'
import type { Purpose } from '../../db/types'
import { PURPOSE_KEYS, purposeInfo } from '../../domain/purposes'
import { useAutosave } from '../../ui/useAutosave'
import { type PurposeSettings as Loaded, usePurposeSettings } from '../today/usePurpose'

/** What journaling is mostly for, and optionally a little more about it. Each entry can still choose another. */
export function PurposeSettings({ labelledBy }: { labelledBy?: string }) {
  const loaded = usePurposeSettings()
  // Render only once loaded, so nothing jumps under your finger.
  if (loaded === undefined) return <div className="loading" aria-busy="true" />
  return <PurposeForm initial={loaded} labelledBy={labelledBy} />
}

function PurposeForm({ initial, labelledBy }: { initial: Loaded; labelledBy?: string }) {
  const name = useId()
  // Local copy so each tap shows at once; saving happens in the background.
  const [primary, setPrimary] = useState<Purpose>(initial.primary)
  const choose = (purpose: Purpose) => {
    setPrimary(purpose)
    void setSetting('primaryPurpose', purpose)
  }

  return (
    <>
      <div role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : 'What journaling is for'} className="purpose-list">
        {PURPOSE_KEYS.map((key) => {
          const info = purposeInfo(key)
          return (
            <label key={key} className="purpose-option">
              <input type="radio" name={name} value={key} checked={primary === key} onChange={() => choose(key)} />
              <span className="purpose-text">
                <span className="purpose-label">{info.label}</span>
                <span className="muted small">{info.hint}</span>
              </span>
            </label>
          )
        })}
      </div>
      <FocusField key={primary} purpose={primary} initial={primary === 'goal' ? initial.goal : (initial.focus[primary] ?? '')} />
    </>
  )
}

/** The optional follow-up for the chosen purpose, saved as you type. */
function FocusField({ purpose, initial }: { purpose: Purpose; initial: string }) {
  const id = useId()
  const focus = purposeInfo(purpose).focus
  const field = useAutosave(initial, (value) => setPurposeFocus(purpose, value))
  if (!focus) return null
  return (
    <div className="focus-field">
      <label className="question-text" htmlFor={id}>
        {focus.question}
      </label>
      <input id={id} maxLength={120} placeholder={focus.placeholder} value={field.text} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur} />
      <p className="save-status" aria-live="polite">
        {field.status === 'saving' ? 'Saving…' : field.status === 'saved' ? 'Saved' : 'Optional'}
      </p>
    </div>
  )
}
