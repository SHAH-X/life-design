import { type Energy, type Engagement, energySymbol } from '../domain/scales'

const LEVELS = [1, 2, 3, 4, 5] as const

/** ▲▲ ▲ – ▼ ▼▼ in blue (gives) or red (takes). Decorative: always paired with words for VoiceOver. */
export function EnergySymbol({ value }: { value: Energy }) {
  return (
    <span className={`sign-energy e${value}`} aria-hidden="true">
      {energySymbol(value)}
    </span>
  )
}

/** How into it you were, as five dots. Decorative: always paired with words for VoiceOver. */
export function EngagementDots({ value }: { value: Engagement }) {
  return (
    <span className="sign-dots" aria-hidden="true">
      {LEVELS.map((level) => (
        <i key={level} className={level <= value ? 'on' : undefined} />
      ))}
    </span>
  )
}
