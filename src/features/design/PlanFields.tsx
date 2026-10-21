import { useId, useState } from 'react'
import { addOwnWord, type ViewsText } from '../../db/repo'
import type { Need, OdysseyPlan } from '../../db/types'
import type { OwnWord } from '../../domain/feelings'
import { NEEDS, PLAN_WORDS, slotOf } from '../../domain/lifeDesign'
import { hashFor } from '../../lib/route'
import { WordPicker } from '../../ui/WordPicker'

export type UpdatePlan = (change: (plan: OdysseyPlan) => OdysseyPlan) => void

interface FieldProps {
  plan: OdysseyPlan
  update: UpdatePlan
  /** Id of the visible question naming the field. */
  labelledBy: string
}

export function AboutField({ plan, update, labelledBy }: FieldProps) {
  return (
    <textarea
      aria-labelledby={labelledBy}
      rows={4}
      maxLength={2000}
      placeholder={slotOf(plan.slot).about}
      value={plan.description}
      onChange={(e) => {
        const description = e.target.value
        update((p) => ({ ...p, description }))
      }}
    />
  )
}

const toLines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

/** Year 1 to Year 5, one box each, one line per thing. Typing stays in local text so blank lines never vanish mid-typing. */
export function YearsField({ plan, update }: Omit<FieldProps, 'labelledBy'>) {
  const id = useId()
  const [texts, setTexts] = useState(() => plan.years.map((items) => items.join('\n')))
  return (
    <>
      <p className="field-help">Work, and life outside it. One line per thing.</p>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="year-field">
          <label className="field" htmlFor={`${id}-${i}`}>
            <span>Year {i + 1}</span>
          </label>
          <textarea
            id={`${id}-${i}`}
            rows={2}
            maxLength={1000}
            value={texts[i] ?? ''}
            onChange={(e) => {
              const next = [...texts]
              next[i] = e.target.value
              setTexts(next)
              update((p) => ({ ...p, years: next.map(toLines) }))
            }}
          />
        </div>
      ))}
    </>
  )
}

export function TitleField({ plan, update, labelledBy }: FieldProps) {
  return (
    <input
      aria-labelledby={labelledBy}
      maxLength={80}
      autoCapitalize="sentences"
      placeholder="e.g. Teaching design by the Lisbon sea"
      value={plan.title}
      onChange={(e) => {
        const title = e.target.value
        update((p) => ({ ...p, title }))
      }}
    />
  )
}

const QUESTION_EXAMPLES = ['e.g. Would I enjoy teaching every day?', 'e.g. Could we live on less?', 'e.g. Would I miss the city?']

/** Up to three questions living it would answer. Kept as typed (three boxes) so nothing shifts while typing. */
export function QuestionsField({ plan, update }: Omit<FieldProps, 'labelledBy'>) {
  const id = useId()
  const [texts, setTexts] = useState(() => [0, 1, 2].map((i) => plan.questions[i] ?? ''))
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <label className="visually-hidden" htmlFor={`${id}-${i}`}>
            Question {i + 1}
          </label>
          <input
            id={`${id}-${i}`}
            className="question-input"
            maxLength={200}
            placeholder={QUESTION_EXAMPLES[i]}
            value={texts[i] ?? ''}
            onChange={(e) => {
              const next = [...texts]
              next[i] = e.target.value
              setTexts(next)
              update((p) => ({ ...p, questions: next.map((q) => q.trim()).filter(Boolean) }))
            }}
          />
        </div>
      ))}
    </>
  )
}

export function FeelingsField({
  plan,
  update,
  labelledBy,
  own,
  onOwn,
}: FieldProps & { own: readonly OwnWord[]; onOwn: (word: OwnWord) => void }) {
  return (
    <WordPicker
      labelledBy={labelledBy}
      kind="plan"
      presets={PLAN_WORDS}
      own={own}
      value={plan.feelings}
      onChange={(feelings) => update((p) => ({ ...p, feelings }))}
      onAddOwn={(word) => {
        onOwn(word)
        void addOwnWord(word)
      }}
    />
  )
}

export function NeedsField({ plan, update, labelledBy }: FieldProps) {
  const noteId = useId()
  const toggle = (need: Need) =>
    update((p) => ({ ...p, needs: p.needs.includes(need) ? p.needs.filter((n) => n !== need) : NEEDS.map((n) => n.value).filter((n) => n === need || p.needs.includes(n)) }))
  return (
    <>
      <p className="field-help">Tap what's missing.</p>
      <div role="group" aria-labelledby={labelledBy} className="chip-row">
        {NEEDS.map((n) => (
          <button key={n.value} type="button" className="chip" aria-pressed={plan.needs.includes(n.value)} onClick={() => toggle(n.value)}>
            {n.label}
          </button>
        ))}
      </div>
      <label className="field" htmlFor={noteId}>
        <span>What exactly?</span>
      </label>
      <textarea
        id={noteId}
        rows={2}
        maxLength={1000}
        placeholder="Optional"
        value={plan.needsNote}
        onChange={(e) => {
          const needsNote = e.target.value
          update((p) => ({ ...p, needsNote }))
        }}
      />
    </>
  )
}

export function FitField({ plan, update, labelledBy, views }: FieldProps & { views: ViewsText | null }) {
  const written = views && (views.workview.trim() || views.lifeview.trim())
  return (
    <>
      <textarea
        aria-labelledby={labelledBy}
        rows={4}
        maxLength={2000}
        placeholder="In your own words"
        value={plan.fit}
        onChange={(e) => {
          const fit = e.target.value
          update((p) => ({ ...p, fit }))
        }}
      />
      {written ? (
        <details className="more-ways">
          <summary>Your Workview and Lifeview</summary>
          {views.workview.trim() ? <p className="views-text">{views.workview}</p> : null}
          {views.lifeview.trim() ? <p className="views-text">{views.lifeview}</p> : null}
        </details>
      ) : (
        <p className="field-help">
          <a href={hashFor('design', 'views')}>Write them first ›</a> (optional)
        </p>
      )}
    </>
  )
}
