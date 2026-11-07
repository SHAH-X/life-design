import { useState } from 'react'
import { addReceiptPart, addReceiptPhoto } from '../../db/repo'
import { PhotoError, shrinkPhoto } from '../../lib/photo'
import { Icon } from '../../ui/Icon'
import { ReadingOffer } from '../photos/ReadingOffer'
import { usePhotoText } from '../photos/usePhotoText'

/**
 * "Add a receipt" (v0.26.0, owner 2026-11-07): the iPhone's own camera straight away, never a camera of the app's own
 * (sharper, and no permission asked again and again). The photo is kept as a receipt in an entry of its own and always
 * goes to your AI to be read, however the phone reads it; that needs reading photos on, offered here while it isn't.
 * `waiting`: receipts added here and not read yet, said so they never vanish until they are. Once one is added, "Add
 * another part" adds the next part of a long receipt to it (v0.27.0), a little over the last; all go to your AI as one.
 */
export function AddReceipt({ waiting }: { waiting: number }) {
  const reading = usePhotoText()
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** The receipt added last, while on this screen: the next shot can be its next part. */
  const [last, setLast] = useState<{ entryId: string; firstId: string } | null>(null)

  async function add(file: File, part: boolean) {
    setAdding(true)
    setProblem(null)
    try {
      const shot = await shrinkPhoto(file).catch((error: unknown) => {
        setProblem(error instanceof PhotoError ? error.message : new PhotoError().message)
        return null
      })
      if (!shot) return
      const id = crypto.randomUUID()
      if (part && last) {
        if (!(await addReceiptPart(last.entryId, last.firstId, { id, ...shot }))) setLast(null) // its entry was deleted
      } else {
        const entry = await addReceiptPhoto({ id, ...shot })
        setLast({ entryId: entry.id, firstId: id })
      }
    } catch {
      // A save that fails is explained by the save-error prompt (src/db/saveErrors.ts).
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <Camera label="Add a receipt" disabled={adding} onFile={(file) => void add(file, false)} />
      {last ? <Camera label="Add another part" disabled={adding} onFile={(file) => void add(file, true)} /> : null}
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
      {waiting ? (
        <p className="muted small" role="status">
          {waiting === 1 ? '1 receipt' : `${waiting} receipts`} waiting to be read
        </p>
      ) : null}
      {waiting && reading === 'unasked' ? <ReadingOffer question="Read the text in photos, so your receipts can be read?" /> : null}
      {waiting && reading === 'off' ? <p className="muted small">They're read once More → Reading photos is on.</p> : null}
    </div>
  )
}

/** A button that opens the iPhone's camera, its hidden file input covering it (UI rule). */
function Camera({ label, disabled, onFile }: { label: string; disabled: boolean; onFile: (file: File) => void }) {
  return (
    <label className="button photo-add">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <Icon name="camera" size={20} /> {label}
    </label>
  )
}
