import { useState } from 'react'
import { addReceiptPhoto } from '../../db/repo'
import { PhotoError, shrinkPhoto } from '../../lib/photo'
import { Icon } from '../../ui/Icon'
import { ReadingOffer } from '../photos/ReadingOffer'
import { usePhotoText } from '../photos/usePhotoText'

/**
 * "Add a receipt" (v0.26.0, owner 2026-11-07): the iPhone's own camera straight away, never a camera of the app's own
 * (sharper, and no permission asked again and again). The photo is kept as a receipt in an entry of its own and always
 * goes to your AI to be read, however the phone reads it; that needs reading photos on, offered here while it isn't.
 * `waiting`: receipts added here and not read yet, said so they never vanish until they are.
 */
export function AddReceipt({ waiting }: { waiting: number }) {
  const reading = usePhotoText()
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function add(file: File) {
    setAdding(true)
    setProblem(null)
    try {
      const shot = await shrinkPhoto(file).catch((error: unknown) => {
        setProblem(error instanceof PhotoError ? error.message : new PhotoError().message)
        return null
      })
      if (shot) await addReceiptPhoto({ id: crypto.randomUUID(), ...shot })
    } catch {
      // A save that fails is explained by the save-error prompt (src/db/saveErrors.ts).
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <label className="button photo-add">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={adding}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void add(file)
          }}
        />
        <Icon name="camera" size={20} /> Add a receipt
      </label>
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
