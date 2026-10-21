import { useState } from 'react'
import { db } from '../../db/db'
import { Dialog } from '../../ui/Dialog'

export function DeleteAllCard() {
  const [open, setOpen] = useState(false)
  const [sure, setSure] = useState(false)
  const [busy, setBusy] = useState(false)

  async function deleteEverything() {
    setBusy(true)
    await db.delete()
    window.location.reload()
  }

  return (
    <section className="card">
      <h2 className="danger-text">Delete everything</h2>
      <p className="muted">Removes all your entries and settings from this phone. Back up first if you might want them again.</p>
      <button type="button" className="danger wide" onClick={() => setOpen(true)}>
        Delete everything on this phone…
      </button>
      {open ? (
        <Dialog title="Delete everything?" onClose={() => setOpen(false)}>
          <p>This permanently deletes all Life Design data on this phone. It can't be undone.</p>
          <label className="check">
            <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            I understand
          </label>
          <button type="button" className="danger wide" disabled={!sure || busy} onClick={() => void deleteEverything()}>
            Delete everything
          </button>
        </Dialog>
      ) : null}
    </section>
  )
}
