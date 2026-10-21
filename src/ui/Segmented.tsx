import { useId, useState } from 'react'

export interface Option<T> {
  value: T
  label: string
  short?: string
}

interface Props<T extends string | number> {
  legend: string
  options: readonly Option<T>[]
  value: T | null
  onChange: (value: T) => void
  ends?: readonly [string, string]
  tone?: 'plain' | 'energy'
  /** Explanation shown when the ⓘ button next to the legend is tapped. */
  info?: string
}

/** A row of large tap targets backed by native radio buttons (keyboard and VoiceOver work as normal). */
export function Segmented<T extends string | number>({ legend, options, value, onChange, ends, tone = 'plain', info }: Props<T>) {
  const name = useId()
  const infoId = useId()
  const [showInfo, setShowInfo] = useState(false)
  const current = options.find((o) => o.value === value)

  return (
    <fieldset className={`segmented ${tone}`}>
      <legend>
        {legend}
        {current ? <span className="seg-current"> · {current.label}</span> : null}
        {info ? (
          <button
            type="button"
            className="info-button"
            aria-label={`What does ${legend.toLowerCase()} mean?`}
            aria-expanded={showInfo}
            aria-controls={infoId}
            onClick={() => setShowInfo((open) => !open)}
          >
            i
          </button>
        ) : null}
      </legend>
      {info && showInfo ? (
        <p id={infoId} className="info-panel">
          {info}
        </p>
      ) : null}
      <div className="seg-row">
        {options.map((option) => (
          <label key={String(option.value)} className="seg" data-value={String(option.value)}>
            <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
            {option.short ? (
              <>
                <span aria-hidden="true">{option.short}</span>
                <span className="visually-hidden">{option.label}</span>
              </>
            ) : (
              <span>{option.label}</span>
            )}
          </label>
        ))}
      </div>
      {ends ? (
        <div className="seg-ends" aria-hidden="true">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
    </fieldset>
  )
}
