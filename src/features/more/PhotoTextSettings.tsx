import { useEffect, useState } from 'react'
import { ocrFilesDownloaded, removeOcrFiles } from '../../lib/reader'
import { Loading } from '../../ui/Loading'
import { Switch } from '../../ui/Switch'
import { photoReaderSettings } from '../../db/aiReading'
import { db } from '../../db/db'
import { setSetting } from '../../db/repo'
import { PROVIDERS } from '../../lib/ai'
import { useLiveQuery } from 'dexie-react-hooks'
import { setPhotoText, usePhotoText } from '../photos/usePhotoText'

export const PHOTO_TEXT_INFO =
  'A small model on this phone reads the words in each photo once (a receipt, a note, a page), so you can find it by them, and it joins your life areas and reviews. The photo itself is never sent anywhere. It downloads once (about 6 MB) and works offline.'

/** More → Reading photos: on or off, and the download removed. */
export function PhotoTextSettings() {
  const reading = usePhotoText()
  const [downloaded, setDownloaded] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    void ocrFilesDownloaded().then(setDownloaded, () => setDownloaded(false))
  }, [])

  // Render only once both are known, so the button never appears under your finger.
  if (reading === undefined || downloaded === undefined) return <Loading />
  return <PhotoTextCard on={reading === 'on'} downloaded={downloaded} />
}

/** The switch shows your change at once and saves it in the background. */
function PhotoTextCard(initial: { on: boolean; downloaded: boolean }) {
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
      {on ? <AiReceiptsSwitch /> : null}
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

/** Receipts to your AI as you add them (v0.18, owner's choice), when the AI you set up reads photos. On by default. */
function AiReceiptsSwitch() {
  const reader = useLiveQuery(async () => (await photoReaderSettings(db)) ?? null, [])
  const [on, setOn] = useState<boolean | null>(null)
  if (reader === undefined) return null
  if (reader === null) return <p className="muted small">To read receipts with AI, set up Gemini or OpenAI in More → AI review.</p>
  const checked = on ?? reader.auto
  const turn = (next: boolean) => {
    setOn(next)
    void setSetting('aiReceipts', next)
  }
  return (
    <Switch
      label="Read receipts with AI"
      hint={`A photo with prices goes to ${PROVIDERS[reader.provider].label} as you add it; any other photo only when you tap "Read with AI".`}
      checked={checked}
      onChange={turn}
    />
  )
}
