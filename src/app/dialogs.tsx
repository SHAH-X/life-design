import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { onSaveError } from '../db/saveErrors'
import { CsvDialog } from '../features/backup/CsvDialog'
import { ExportDialog } from '../features/backup/ExportDialog'
import { ImportDialog } from '../features/backup/ImportDialog'
import { Dialog } from '../ui/Dialog'

type DialogName = 'export' | 'import' | 'csv'

const DialogsContext = createContext<{ open: (name: DialogName) => void } | null>(null)

export function useDialogs() {
  const context = useContext(DialogsContext)
  if (!context) throw new Error('useDialogs must be used inside DialogsProvider')
  return context
}

function SaveErrorDialog({ onBackup, onClose }: { onBackup: () => void; onClose: () => void }) {
  return (
    <Dialog title="Couldn't save" onClose={onClose}>
      <p>Your last change wasn't saved. This usually means the iPhone is almost out of storage.</p>
      <p>Back up now so nothing is lost, then free up some space in Settings → General → iPhone Storage.</p>
      <div className="stack">
        <button type="button" className="primary wide" onClick={onBackup}>
          Back up now
        </button>
        <button type="button" className="wide" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  )
}

/** App-wide dialogs (backup, restore, CSV) plus the prompt shown whenever a save fails. */
export function DialogsProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<DialogName | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)

  useEffect(() => onSaveError(() => setSaveFailed(true)), [])

  const close = () => setCurrent(null)

  return (
    <DialogsContext.Provider value={{ open: setCurrent }}>
      {children}
      {current === 'export' ? <ExportDialog onClose={close} /> : null}
      {current === 'import' ? <ImportDialog onClose={close} /> : null}
      {current === 'csv' ? <CsvDialog onClose={close} /> : null}
      {saveFailed && current === null ? (
        <SaveErrorDialog
          onBackup={() => {
            setSaveFailed(false)
            setCurrent('export')
          }}
          onClose={() => setSaveFailed(false)}
        />
      ) : null}
    </DialogsContext.Provider>
  )
}
