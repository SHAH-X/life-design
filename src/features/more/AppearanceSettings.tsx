import { useId, useState } from 'react'
import { APPEARANCE_LABELS, type Appearance, getAppearance, setAppearance } from '../../lib/appearance'

const OPTIONS: readonly { value: Appearance; hint?: string }[] = [{ value: 'auto', hint: "Follows the iPhone's setting." }, { value: 'light' }, { value: 'dark' }]

/** Light or dark, or as the iPhone is set (v0.10: "I don't see where can you get the dark mode from"). */
export function AppearanceSettings() {
  const name = useId()
  const [choice, setChoice] = useState<Appearance>(getAppearance)
  return (
    <div role="radiogroup" aria-label="Appearance" className="purpose-list">
      {OPTIONS.map((o) => (
        <label key={o.value} className="purpose-option">
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={choice === o.value}
            onChange={() => {
              setChoice(o.value)
              setAppearance(o.value)
            }}
          />
          <span className="purpose-text">
            <span className="purpose-label">{APPEARANCE_LABELS[o.value]}</span>
            {o.hint ? <span className="muted small">{o.hint}</span> : null}
          </span>
        </label>
      ))}
    </div>
  )
}
