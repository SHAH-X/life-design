import { useId } from 'react'
import { setSmallJoy } from '../../db/repo'
import { Question } from '../../ui/Question'
import { useAutosave } from '../../ui/useAutosave'

const SMALL_JOY_INFO =
  'Ikigai in its everyday sense: the small things that make life worth living. The words that keep coming back show up in Insights.'

/** One line a day: the small, everyday kind of ikigai. Saves as you type. */
export function SmallJoy({ date, saved }: { date: string; saved: string }) {
  const id = useId()
  const field = useAutosave(saved, (value) => setSmallJoy(date, value))

  return (
    <div className="evening-field">
      <Question as="label" htmlFor={id} info={SMALL_JOY_INFO} infoLabel="Why a small joy?">
        One small joy from the day?
      </Question>
      <textarea
        id={id}
        value={field.text}
        rows={2}
        maxLength={280}
        placeholder="e.g. Coffee in the sun"
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
      />
      <p className="save-status" aria-live="polite">
        {field.status === 'saving' ? 'Saving…' : field.status === 'saved' ? 'Saved' : ''}
      </p>
    </div>
  )
}
