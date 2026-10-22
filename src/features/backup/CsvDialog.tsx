import { useEffect, useState } from 'react'
import { csvFileName, entriesToCsv } from '../../db/csv'
import { db } from '../../db/db'
import { Dialog } from '../../ui/Dialog'
import { FileActions } from './FileActions'

export function CsvDialog({ onClose }: { onClose: () => void }) {
  const [prepared, setPrepared] = useState<{ file: File; count: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([db.entries.toArray(), db.steps.toArray()]).then(([entries, steps]) => {
      if (cancelled) return
      const file = new File([entriesToCsv(entries, steps)], csvFileName(new Date()), { type: 'text/csv' })
      setPrepared({ file, count: entries.length })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Dialog title="Spreadsheet export" onClose={onClose}>
      <p>
        Your activities as a table (CSV) for Numbers, Excel or Google Sheets. It's for looking at your data. It isn't a backup
        and can't be restored.
      </p>
      {prepared ? (
        <>
          <p className="muted small">
            {prepared.count} {prepared.count === 1 ? 'entry' : 'entries'}
          </p>
          <FileActions file={prepared.file} saveLabel="Save or share…" />
        </>
      ) : (
        <p className="muted">Preparing…</p>
      )}
    </Dialog>
  )
}
