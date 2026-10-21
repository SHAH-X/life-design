import type { ReactNode } from 'react'

export interface Answer<T> {
  value: T
  label: string
  /** A decorative sign beside the words, e.g. the ▲▲ used for this answer in lists. */
  marker?: ReactNode
}

interface Props<T extends string | number | boolean> {
  /** Id of the visible question, which names the group for VoiceOver. */
  labelledBy: string
  options: readonly Answer<T>[]
  value: T | null
  onChoose: (value: T) => void
  /** "list": one big button per row (a question on its own screen). "wrap": compact, for editing. */
  layout?: 'list' | 'wrap'
  /** Energy answers are tinted blue (gives) or red (takes); the words carry the meaning too. */
  tone?: 'plain' | 'energy'
  /** True for a moment after the question appears: taps are ignored, so a double tap can't answer it. */
  settling?: boolean
}

/** Worded answers as buttons; the chosen one is marked pressed. No answer is chosen until you tap one. */
export function AnswerButtons<T extends string | number | boolean>({
  labelledBy,
  options,
  value,
  onChoose,
  layout = 'list',
  tone = 'plain',
  settling = false,
}: Props<T>) {
  return (
    <div role="group" aria-labelledby={labelledBy} aria-disabled={settling || undefined} className={`answers ${layout} ${tone}`}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className="answer"
          data-value={String(option.value)}
          aria-pressed={value === option.value}
          onClick={() => {
            if (!settling) onChoose(option.value)
          }}
        >
          {option.label}
          {option.marker ? <span className="answer-marker">{option.marker}</span> : null}
        </button>
      ))}
    </div>
  )
}
