import { useId, useState } from 'react'
import { type FeelingKind, type FeelingWord, OWN_WORDS_MAX, type OwnWord } from '../domain/feelings'

interface Props {
  /** Id of the visible question, which names the group for VoiceOver. */
  labelledBy: string
  kind: FeelingKind
  presets: readonly FeelingWord[]
  own: readonly OwnWord[]
  value: readonly string[]
  onChange: (words: string[]) => void
  onAddOwn: (word: OwnWord) => void
  /** True for a moment after the question appears: taps are ignored, so a double tap can't answer it. */
  settling?: boolean
}

/**
 * The one plain question asked when you add a word of your own, so the app knows what it says. Words about a
 * possible future need none: nothing is worked out from them.
 */
const PLACE: Partial<Record<FeelingKind, { question: string; answers: readonly { label: string; weight: number }[] }>> = {
  during: {
    question: 'Were you into it?',
    answers: [
      { label: 'Yes', weight: 4 },
      { label: 'Not really', weight: 2 },
    ],
  },
}

const tidy = (s: string) => s.trim().replace(/\s+/g, ' ')
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Feeling words to tap (as many as fit), none preselected and none better than another, plus your own. */
export function WordPicker({ labelledBy, kind, presets, own, value, onChange, onAddOwn, settling = false }: Props) {
  const inputId = useId()
  const placeId = useId()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [placing, setPlacing] = useState<string | null>(null)
  const mine = own.filter((w) => w.kind === kind)
  const words = [...presets.map((w) => w.word), ...mine.map((w) => w.word)]
  const chosen = (word: string) => value.some((v) => same(v, word))

  const toggle = (word: string) => {
    if (settling) return
    onChange(chosen(word) ? value.filter((v) => !same(v, word)) : [...value, word])
  }

  const add = () => {
    const word = tidy(draft)
    if (!word) return
    const existing = words.find((w) => same(w, word))
    if (existing) {
      if (!chosen(existing)) onChange([...value, existing])
      setDraft('')
      setAdding(false)
      return
    }
    if (!PLACE[kind]) {
      onAddOwn({ word, kind, weight: 0 })
      onChange([...value, word])
      setDraft('')
      setAdding(false)
      return
    }
    setPlacing(word)
  }

  const place = (weight: number) => {
    if (!placing) return
    onAddOwn({ word: placing, kind, weight })
    onChange([...value, placing])
    setPlacing(null)
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="word-picker">
      <div role="group" aria-labelledby={labelledBy} aria-disabled={settling || undefined} className="chip-row words">
        {words.map((word) => (
          <button key={word.toLowerCase()} type="button" className="chip word" aria-pressed={chosen(word)} onClick={() => toggle(word)}>
            {word}
          </button>
        ))}
        {!adding && mine.length < OWN_WORDS_MAX ? (
          <button type="button" className="chip add-word" onClick={() => setAdding(true)}>
            + your own word
          </button>
        ) : null}
      </div>
      {adding && placing === null ? (
        <div className="row add-own">
          <label className="visually-hidden" htmlFor={inputId}>
            Your own word
          </label>
          <input
            id={inputId}
            value={draft}
            maxLength={24}
            autoCapitalize="sentences"
            enterKeyHint="done"
            placeholder="e.g. Playful"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
          <button type="button" disabled={!tidy(draft)} onClick={add}>
            Add
          </button>
        </div>
      ) : null}
      {placing !== null && PLACE[kind] ? (
        <div className="follow-on">
          <p className="question-text" id={placeId}>
            “{placing}”: {PLACE[kind].question}
          </p>
          <div role="group" aria-labelledby={placeId} className="chip-row">
            {PLACE[kind].answers.map((a) => (
              <button key={a.label} type="button" className="chip" onClick={() => place(a.weight)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
