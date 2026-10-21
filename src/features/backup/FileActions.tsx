import { useState } from 'react'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { formatBytes } from '../../lib/storage'

interface Props {
  file: File
  saveLabel?: string
  onSaved?: (how: 'shared' | 'downloaded') => void
}

/**
 * Where the phone supports it, one button that opens the share menu (Save to Files, AirDrop, WhatsApp…).
 * No download link there: in an iPhone Home Screen app a download opens a viewer that can save the file wrongly.
 * Browsers without a share menu get a plain download.
 */
export function FileActions({ file, saveLabel = 'Save to Files…', onSaved }: Props) {
  const [problem, setProblem] = useState<string | null>(null)
  const sharable = canShareFile(file)

  async function share() {
    setProblem(null)
    try {
      if ((await shareFile(file)) === 'shared') onSaved?.('shared')
    } catch {
      setProblem("The share menu didn't open. Please try again.")
    }
  }

  function download() {
    downloadFile(file)
    onSaved?.('downloaded')
  }

  return (
    <div className="stack">
      <p className="file-chip">
        <span>{file.name}</span>
        <span className="muted">{formatBytes(file.size)}</span>
      </p>
      {sharable ? (
        <button type="button" className="primary wide" onClick={() => void share()}>
          {saveLabel}
        </button>
      ) : (
        <button type="button" className="primary wide" onClick={download}>
          Download file
        </button>
      )}
      {problem ? <p className="error small">{problem}</p> : null}
    </div>
  )
}
