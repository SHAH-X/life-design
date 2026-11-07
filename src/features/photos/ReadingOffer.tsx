import { setPhotoText } from './usePhotoText'

/** Offers to read the text in photos on this phone (v0.16), asked in the words of where it's offered: the writer, with
 *  the first photo; Money, with a receipt added there (v0.26.0). */
export function ReadingOffer({ question }: { question: string }) {
  return (
    <aside className="notice">
      <p>
        {question}
        <br />
        <span className="muted small">About 6 MB, once. Stays on this phone.</span>
      </p>
      <div className="row">
        <button type="button" className="primary" onClick={() => void setPhotoText(true)}>
          Turn on
        </button>
        <button type="button" onClick={() => void setPhotoText(false)}>
          No thanks
        </button>
      </div>
    </aside>
  )
}
