import type { Suggestions } from '../../db/repo'
import type { Entry } from '../../db/types'
import type { OwnWord } from '../../domain/feelings'
import { EntryEdit, type EntryPart } from './EntryEdit'
import { EntryFlow } from './EntryFlow'
import { EntryView } from './EntryView'
import { FreeWrite } from './FreeWrite'
import { RememberEdit } from './NextStep'
import type { PurposeSettings } from './usePurpose'

/** Which entry sheet is open, on Today or in Logs. */
export type EntrySheetState =
  | { kind: 'new'; date: string }
  | { kind: 'free'; date: string }
  /** An entry you tapped: an unfinished one carries on; a finished one opens to read (fresh: just saved). */
  | { kind: 'open'; entry: Entry; fresh?: boolean }
  /** One part of a finished entry, changed on its own; back to the entry after. */
  | { kind: 'part'; entry: Entry; part: EntryPart | 'remember' }
  | null

interface Props {
  state: EntrySheetState
  onChange: (state: EntrySheetState) => void
  suggestions: Suggestions
  own: readonly OwnWord[]
  purpose: PurposeSettings
}

/** One place for the entry sheets: write, carry on, an entry (read, with its next step), and one part of it changed. */
export function EntrySheet({ state, onChange, suggestions, own, purpose }: Props) {
  if (!state) return null
  const close = () => onChange(null)
  const show = (entry: Entry) => onChange({ kind: 'open', entry, fresh: true })

  if (state.kind === 'new') {
    return (
      <EntryFlow
        date={state.date}
        suggestions={suggestions}
        own={own}
        purpose={purpose.primary}
        goal={purpose.goal}
        focus={purpose.focus}
        onClose={close}
        onSaved={show}
      />
    )
  }
  if (state.kind === 'free') return <FreeWrite date={state.date} onClose={close} onSaved={show} />
  if (state.kind === 'part') {
    const back = () => onChange({ kind: 'open', entry: state.entry })
    if (state.part === 'remember') return <RememberEdit entry={state.entry} onClose={back} />
    return (
      <EntryEdit
        existing={state.entry}
        part={state.part}
        suggestions={suggestions}
        own={own}
        goal={purpose.goal}
        focus={purpose.focus}
        onClose={back}
      />
    )
  }
  const { entry } = state
  if (entry.status === 'draft') {
    return entry.kind === 'free' ? (
      <FreeWrite date={entry.date} draft={entry} onClose={close} onSaved={show} />
    ) : (
      <EntryFlow
        date={entry.date}
        suggestions={suggestions}
        own={own}
        purpose={purpose.primary}
        goal={purpose.goal}
        focus={purpose.focus}
        draft={entry}
        onClose={close}
        onSaved={show}
      />
    )
  }
  return <EntryView key={entry.id} entryId={entry.id} fresh={state.fresh} onPart={(latest, part) => onChange({ kind: 'part', entry: latest, part })} onClose={close} />
}
