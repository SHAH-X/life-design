import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { photoReaderSettings, readOnePhoto } from '../../db/aiReading'
import { db } from '../../db/db'
import type { PhotoRef } from '../../db/types'
import { looksLikeReceipt } from '../../domain/aiReading'
import { AI_PROBLEMS, AiError, PROVIDERS } from '../../lib/ai'
import { photoReader } from './photoReader'

/**
 * Under a photo in an entry (v0.18): what was read in it, by the phone or your AI, and "Read with AI" for one the AI
 * hasn't read (a receipt goes by itself; any other photo only on this tap). A receipt the AI read before items had
 * kinds (v0.19) can be read again, on a tap, to sort them for Shopping.
 */
export function PhotoReading(props: { photo: PhotoRef; phoneProblem: string | null; phoneReading: boolean; aiProblem: string | null }) {
  const { photo, phoneProblem, phoneReading } = props
  const reader = useLiveQuery(() => photoReaderSettings(db), [])
  const [busy, setBusy] = useState(false)
  const [tapProblem, setProblem] = useState<string | null>(null)
  const ai = photo.ai
  const text = ai?.text || photo.text
  const unsorted = Boolean(ai?.receipt && ai.receipt.items.every((item) => !item.kind))
  // A receipt waiting to go by itself shows why it hasn't; a tap's own problem shows after the tap.
  const problem = tapProblem ?? (!ai && reader?.auto && looksLikeReceipt(photo.text) ? props.aiProblem : null)
  const read = async () => {
    if (!reader) return
    setBusy(true)
    setProblem(null)
    try {
      await readOnePhoto(photo.id, photoReader(reader), db)
    } catch (error) {
      setProblem(error instanceof AiError ? error.message : AI_PROBLEMS.other)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      {ai?.description ? <figcaption>{ai.description}</figcaption> : null}
      {text ? (
        <details>
          <summary>Text in this photo</summary>
          <p className="photo-text">{text}</p>
        </details>
      ) : photo.text === null && !ai ? (
        <p className="muted small">{phoneProblem ?? (phoneReading ? 'Reading its text…' : "Its text isn't read: More → Reading photos.")}</p>
      ) : null}
      {ai ? (
        <p className="muted small">{ai.text || ai.description ? `Read by ${ai.by}` : `${ai.by} couldn't read it.`}</p>
      ) : null}
      {reader && (!ai || (!ai.text && !ai.description) || unsorted) ? (
        <>
          <button type="button" disabled={busy} onClick={() => void read()}>
            {busy ? 'Reading…' : unsorted ? 'Read with AI again' : 'Read with AI'}
          </button>
          <p className="muted small">
            {unsorted ? `Sends this photo to ${PROVIDERS[reader.provider].label} again, to sort its items into kinds.` : `Sends this photo to ${PROVIDERS[reader.provider].label}.`}
          </p>
        </>
      ) : null}
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
    </>
  )
}
