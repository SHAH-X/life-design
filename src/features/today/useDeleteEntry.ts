import { useUndo } from '../../app/undo'
import { deleteEntry, restoreEntry } from '../../db/repo'
import type { Entry } from '../../db/types'

/** Deletes an entry at once, then offers Undo for a few seconds (swipe to delete, v0.10). */
export function useDeleteEntry() {
  const offerUndo = useUndo()
  return async (entry: Entry) => {
    await deleteEntry(entry.id)
    offerUndo('Entry deleted', () => restoreEntry(entry))
  }
}
