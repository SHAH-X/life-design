import type { Suggestions } from '../../db/repo'
import type { Entry } from '../../db/types'
import type { OwnWord } from '../../domain/feelings'
import { EntryEdit } from './EntryEdit'
import { EntryFlow } from './EntryFlow'
import { EntryView } from './EntryView'
import { FreeWrite } from './FreeWrite'
import type { PurposeSettings } from './usePurpose'

/** Which entry sheet is open, on Today or in Entries. */
export type EntrySheetState =
  | { kind: 'new'; date: string }
  | { kind: 'free'; date: string }
  /** An entry you tapped: an unfinished one carries on; a finished one opens to read (fresh: just saved). */
  | { kind: 'open'; entry: Entry; fresh?: boolean }
  | { kind: 'edit'; entry: Entry }
  | null

interface Props {
  state: EntrySheetState
  onChange: (state: EntrySheetState) => void
  suggestions: Suggestions
  own: readonly OwnWord[]
  purpose: PurposeSettings
}

/** One place for the entry sheets: write, carry on, read back (with its summary and next step), and edit. */
export function EntrySheet({ state, onChange, suggestions, own, purpose }: Props) {
  if (!state) return null
  const close = () => onChange(null)
  const show = (entry: Entry) => onChange({ kind: 'open', entry, fresh: true })

  if (state.kind === 'new') {
    return <EntryFlow date={state.date} suggestions={suggestions} own={own} purpose={purpose.primary} goal={purpose.goal} onClose={close} onSaved={show} />
  }
  if (state.kind === 'free') return <FreeWrite date={state.date} onClose={close} onSaved={show} />
  if (state.kind === 'edit') {
    return (
      <EntryEdit
        existing={state.entry}
        suggestions={suggestions}
        own={own}
        goal={purpose.goal}
        onClose={() => onChange({ kind: 'open', entry: state.entry })}
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
        draft={entry}
        onClose={close}
        onSaved={show}
      />
    )
  }
  return <EntryView key={entry.id} entryId={entry.id} fresh={state.fresh} onEdit={(latest) => onChange({ kind: 'edit', entry: latest })} onClose={close} />
}
