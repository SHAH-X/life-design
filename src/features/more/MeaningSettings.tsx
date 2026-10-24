import { useEffect, useState } from 'react'
import { clearVectors } from '../../db/vectors'
import { meaningFilesDownloaded, removeMeaningFiles } from '../../lib/embedder'
import { Loading } from '../../ui/Loading'
import { Switch } from '../../ui/Switch'
import { setMeaningSearch, useMeaningSearch } from '../meaning/useMeaning'

export const MEANING_INFO =
  'A small model on this phone reads each entry once, then finds the ones about the same thing as your search, even in other words. It downloads once (about 30 MB) the first time you search, and works offline. Nothing you write is sent anywhere.'

/** More → Search by meaning: on or off, and the download removed. */
export function MeaningSettings() {
  const meaning = useMeaningSearch()
  const [downloaded, setDownloaded] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    void meaningFilesDownloaded().then(setDownloaded, () => setDownloaded(false))
  }, [])

  // Render only once both are known, so the button never appears under your finger.
  if (meaning === undefined || downloaded === undefined) return <Loading />
  return <MeaningCard on={meaning === 'on'} downloaded={downloaded} />
}

/** The switch shows your change at once and saves it in the background (never bound to what comes back from the
 *  database, which would snap back for a moment). */
function MeaningCard(initial: { on: boolean; downloaded: boolean }) {
  const [on, setOn] = useState(initial.on)
  const [downloaded, setDownloaded] = useState(initial.downloaded)
  const [note, setNote] = useState<string | null>(null)

  const turn = (next: boolean) => {
    setOn(next)
    setNote(null)
    void setMeaningSearch(next)
  }

  const remove = async () => {
    setOn(false)
    await setMeaningSearch(false)
    await removeMeaningFiles()
    await clearVectors()
    setDownloaded(false)
    setNote('Removed. It downloads again if you turn it on.')
  }

  return (
    <section className="card">
      <Switch label="Find entries by meaning" hint="About 30 MB, once. Stays on this phone." checked={on} onChange={turn} />
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
