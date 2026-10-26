import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { photoReaderSettings, readOnePhoto } from '../../db/aiReading'
import { db } from '../../db/db'
import type { PhotoRef } from '../../db/types'
import { dueForAi } from '../../domain/aiReading'
import { AI_PROBLEMS, AiError, PHOTO_KEY_PROBLEM, PROVIDERS } from '../../lib/ai'
import { photoReader } from './photoReader'

/** Problems that need you: a refused key. */
const KEY_PROBLEMS = new Set<string>([AI_PROBLEMS.key, PHOTO_KEY_PROBLEM])

/**
 * Under a photo in an entry (v0.18): what was read in it, by the phone or your AI, and "Read with AI" for one the AI
 * hasn't read (a receipt goes by itself; any other photo only on this tap). A receipt the AI read before items had
 * kinds (v0.19) or plain names (v0.19.3) can be read again, on a tap, to sort and name them for Money. A receipt
 * still to be read is read by itself while the app is open (v0.19.4), so a problem that passes is said that way; a
 * refused key needs you, so it's said as it is. A receipt already added from an earlier photo says it's counted once
 * (v0.19.5).
 */
export function PhotoReading(props: { photo: PhotoRef; phoneProblem: string | null; phoneReading: boolean; aiProblem: string | null; copy?: boolean }) {
  const { photo, phoneProblem, phoneReading } = props
  const reader = useLiveQuery(() => photoReaderSettings(db), [])
  const [busy, setBusy] = useState(false)
  const [tapProblem, setProblem] = useState<string | null>(null)
  const ai = photo.ai
  const text = ai?.text || photo.text
  const unsorted = Boolean(ai?.receipt && ai.receipt.items.every((item) => !item.kind))
  const unnamed = Boolean(ai?.receipt && ai.receipt.items.every((item) => !item.plain))
  const again = unsorted ? 'to give its items proper names and sort them into kinds' : unnamed ? 'to give its items proper names' : null
  // A receipt waiting to go by itself shows why it hasn't; a tap's own problem shows after the tap.
  const byItself = Boolean(phoneReading && reader?.auto && dueForAi(photo))
  const said = tapProblem ?? (byItself ? props.aiProblem : null)
  const passes = byItself && said !== null && !KEY_PROBLEMS.has(said)
  const problem = passes ? null : said
  const waiting = byItself && !busy && !problem && reader
    ? passes
      ? "Couldn't be read just now: it's tried again by itself while the app is open."
      : `Waiting for ${PROVIDERS[reader.provider].label}: read by itself while the app is open.`
    : null
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
      {reader && (!ai || (!ai.text && !ai.description) || again) ? (
        <>
          <button type="button" disabled={busy} onClick={() => void read()}>
            {busy ? 'Reading…' : again ? 'Read with AI again' : 'Read with AI'}
          </button>
          <p className="muted small">
            {again ? `Sends this photo to ${PROVIDERS[reader.provider].label} again, ${again}.` : `Sends this photo to ${PROVIDERS[reader.provider].label}.`}
          </p>
        </>
      ) : null}
      {props.copy ? <p className="muted small">Already in Money from an earlier photo: counted once.</p> : null}
      {waiting ? <p className="muted small">{waiting}</p> : null}
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
    </>
  )
}
