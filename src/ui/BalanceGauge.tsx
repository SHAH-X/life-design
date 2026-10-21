import { useId, useState } from 'react'

interface Props {
  label: string
  info: string
  value: number | null
  previous: number | null
  onChange: (value: number) => void
}

/** A 0–10 gauge from empty to full (Designing Your Life's Health/Work/Play/Love dashboard). */
export function BalanceGauge({ label, info, value, previous, onChange }: Props) {
  const id = useId()
  const infoId = useId()
  const [showInfo, setShowInfo] = useState(false)

  return (
    <div className="gauge">
      <div className="gauge-head">
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="info-button"
          aria-label={`What does ${label.toLowerCase()} mean?`}
          aria-expanded={showInfo}
          aria-controls={infoId}
          onClick={() => setShowInfo((open) => !open)}
        >
          i
        </button>
        <span className="gauge-value">
          {value === null ? '–' : value}
          <span className="muted">/10</span>
        </span>
      </div>
      {showInfo ? (
        <p id={infoId} className="info-panel">
          {info}
        </p>
      ) : null}
      <input
        id={id}
        type="range"
        min={0}
        max={10}
        step={1}
        value={value ?? 5}
        className={value === null ? 'unset' : undefined}
        aria-valuetext={value === null ? 'Not rated yet' : `${value} out of 10`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="seg-ends" aria-hidden="true">
        <span>Empty</span>
        <span>{value === null ? 'Drag to rate' : previous === null ? '' : `Last review: ${previous}`}</span>
        <span>Full</span>
      </div>
    </div>
  )
}
