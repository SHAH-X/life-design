import { useId, useState } from 'react'

interface Props {
  legend: string
  values: string[]
  suggestions: readonly string[]
  onChange: (values: string[]) => void
  placeholder: string
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Tap a suggestion to toggle it, or type a new one. Typed text is kept even without tapping Add. */
export function ChipPicker({ legend, values, suggestions, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState('')
  const inputId = useId()
  const chosen = new Set(values.map((v) => v.toLowerCase()))
  const options = [...values, ...suggestions.filter((s) => !chosen.has(s.toLowerCase()))]

  const toggle = (value: string) =>
    onChange(chosen.has(value.toLowerCase()) ? values.filter((v) => v.toLowerCase() !== value.toLowerCase()) : [...values, value])

  const add = () => {
    const value = tidy(draft)
    if (value && !chosen.has(value.toLowerCase())) onChange([...values, value])
    setDraft('')
  }

  return (
    <fieldset className="chips">
      <legend>{legend}</legend>
      {options.length > 0 ? (
        <div className="chip-row">
          {options.map((value) => (
            <button
              key={value.toLowerCase()}
              type="button"
              className="chip"
              aria-pressed={chosen.has(value.toLowerCase())}
              onClick={() => toggle(value)}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}
      <div className="chip-add">
        <label htmlFor={inputId} className="visually-hidden">
          Add to {legend.toLowerCase()}
        </label>
        <input
          id={inputId}
          value={draft}
          placeholder={placeholder}
          enterKeyHint="done"
          autoCapitalize="sentences"
          maxLength={60}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              add()
            }
          }}
        />
        <button type="button" onClick={add} disabled={!tidy(draft)}>
          Add
        </button>
      </div>
    </fieldset>
  )
}
