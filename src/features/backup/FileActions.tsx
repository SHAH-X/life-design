import { useState } from 'react'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { formatBytes } from '../../lib/storage'

interface Props {
  file: File
  saveLabel?: string
  onSaved?: (how: 'shared' | 'downloaded') => void
}

/** "Save to Files…" through the share sheet where the phone supports it, with a download as the fallback. */
export function FileActions({ file, saveLabel = 'Save to Files…', onSaved }: Props) {
  const [shareFailed, setShareFailed] = useState(false)
  const sharable = canShareFile(file) && !shareFailed

  async function share() {
    try {
      if ((await shareFile(file)) === 'shared') onSaved?.('shared')
    } catch {
      setShareFailed(true)
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
        <>
          <button type="button" className="primary wide" onClick={() => void share()}>
            {saveLabel}
          </button>
          <button type="button" className="link" onClick={download}>
            Download instead
          </button>
        </>
      ) : (
        <button type="button" className="primary wide" onClick={download}>
          Download file
        </button>
      )}
      {shareFailed ? <p className="muted small">The share sheet didn't open, so use Download.</p> : null}
    </div>
  )
}
