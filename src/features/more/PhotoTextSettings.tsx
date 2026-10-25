import { useEffect, useState } from 'react'
import { ocrFilesDownloaded, removeOcrFiles } from '../../lib/reader'
import { Loading } from '../../ui/Loading'
import { Switch } from '../../ui/Switch'
import { photoReaderSettings, waitingForAi } from '../../db/aiReading'
import { db } from '../../db/db'
import { setSetting } from '../../db/repo'
import { PROVIDERS, READS_IMAGES } from '../../lib/ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { setPhotoText, usePhotoText } from '../photos/usePhotoText'
import { AiForm } from './AiSettings'
import { type AiSettings, PHOTO_SLOT, REVIEW_SLOT, useAiSettings } from './useAiSettings'

type Reader = Awaited<ReturnType<typeof photoReaderSettings>>
/** Which AI reads photos, and the two keys it may come from. */
type PhotoAi = { reader: Reader; photo: AiSettings; review: AiSettings }

export const PHOTO_TEXT_INFO =
  'A small model on this phone reads the words in each photo once (a receipt, a note, a page), so you can find it by them, and it joins your life areas and reviews. The photo itself is never sent anywhere. It downloads once (about 6 MB) and works offline.'

/** More → Reading photos: on or off, and the download removed. */
export function PhotoTextSettings() {
  const reading = usePhotoText()
  const [downloaded, setDownloaded] = useState<boolean | undefined>(undefined)
  const reader = useLiveQuery(async () => (await photoReaderSettings(db)) ?? null, [])
  const photo = useAiSettings(PHOTO_SLOT)
  const review = useAiSettings(REVIEW_SLOT)

  useEffect(() => {
    void ocrFilesDownloaded().then(setDownloaded, () => setDownloaded(false))
  }, [])

  // Render only once all are known, so nothing appears under your finger.
  if (reading === undefined || downloaded === undefined || reader === undefined || photo === undefined || review === undefined) return <Loading />
  return <PhotoTextCard on={reading === 'on'} downloaded={downloaded} ai={{ reader, photo, review }} />
}

/** The switch shows your change at once and saves it in the background. */
function PhotoTextCard({ ai, ...initial }: { on: boolean; downloaded: boolean; ai: PhotoAi }) {
  const [on, setOn] = useState(initial.on)
  const [downloaded, setDownloaded] = useState(initial.downloaded)
  const [note, setNote] = useState<string | null>(null)

  const turn = (next: boolean) => {
    setOn(next)
    setNote(null)
    void setPhotoText(next)
  }

  const remove = async () => {
    setOn(false)
    await setPhotoText(false)
    await removeOcrFiles()
    setDownloaded(false)
    setNote('Removed. Text already read stays with its photos.')
  }

  return (
    <section className="card">
      <Switch label="Read the text in photos" hint="About 6 MB, once. Stays on this phone." checked={on} onChange={turn} />
      {on && ai.reader ? <AiReceiptsSwitch reader={ai.reader} /> : null}
      {on ? <PhotoKey photo={ai.photo} review={ai.review} /> : null}
      {downloaded ? (
        <button type="button" className="wide" onClick={() => void remove()}>
          Remove the download
        </button>
      ) : null}
      {note ? (
        <p className="muted small" role="status">
          {note}
        </p>
      ) : null}
    </section>
  )
}

/** Receipts to your AI as you add them (v0.18, owner's choice), and again until they're read in full (v0.19.4), when an
 *  AI set up reads photos. On by default. */
function AiReceiptsSwitch({ reader }: { reader: NonNullable<Reader> }) {
  const [on, setOn] = useState<boolean | null>(null)
  const checked = on ?? reader.auto
  const waiting = useLiveQuery(async () => waitingForAi(await db.entries.toArray()).length, [])
  const label = PROVIDERS[reader.provider].label
  const turn = (next: boolean) => {
    setOn(next)
    void setSetting('aiReceipts', next)
  }
  return (
    <>
      <Switch
        label="Read receipts with AI"
        hint={`A photo with prices goes to ${label} as you add it, and again until it's read in full; any other photo only when you tap "Read with AI".`}
        checked={checked}
        onChange={turn}
      />
      {checked && waiting ? (
        <p className="muted small" role="status">
          {waiting === 1 ? '1 receipt' : `${waiting} receipts`} waiting for {label}: read by itself while the app is open.
        </p>
      ) : null}
    </>
  )
}

/**
 * A key for photos alone (v0.18.2): Groq for Ask and reviews can't read photos, so Gemini or OpenAI reads them with a
 * key of its own. When the AI for Ask and reviews reads photos already, another one is offered folded away.
 */
function PhotoKey({ photo, review }: { photo: AiSettings; review: AiSettings }) {
  const reviewReads = review.key !== null && READS_IMAGES.includes(review.provider)
  if (!photo.key && reviewReads) {
    return (
      <details className="top-gap">
        <summary>Another AI for photos</summary>
        <AiForm saved={photo} slot={PHOTO_SLOT} />
      </details>
    )
  }
  return (
    <div className="top-gap">
      <p className="question-text">Which AI reads your photos?</p>
      {photo.key ? null : (
        <p className="muted small">To read photos with AI, add a Gemini or OpenAI key{review.key ? ` (${PROVIDERS[review.provider].label} can’t read them)` : ''}.</p>
      )}
      <AiForm saved={photo} slot={PHOTO_SLOT} />
    </div>
  )
}
