import { useId, useState } from 'react'
import { flushSync } from 'react-dom'

interface Props {
  /** Openers that fit the question, without the "…". */
  starters: readonly string[]
  /** Called with the opener and a space, ready to carry on typing. */
  onPick: (text: string) => void
}

/**
 * "Need a start?" for an empty writing box: a few openers that fit its question. Tapping one types it in.
 * Show it only while the box is empty, inside a .field-foot line (which keeps its height when it hides).
 */
export function Starters({ starters, onPick }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <>
      <button type="button" className="link" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        Need a start?
      </button>
      {open ? (
        <div id={id} role="group" aria-label="Openers" className="chip-row">
          {starters.map((opener) => (
            <button key={opener} type="button" className="chip" onClick={() => onPick(`${opener} `)}>
              {opener}…
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}

/**
 * Puts an opener into a box, with the cursor at the end, and focuses it. Done within the tap itself, as iOS
 * only opens the keyboard for a focus that comes straight from a tap.
 */
export function typeInto(box: HTMLTextAreaElement | null, text: string, set: (text: string) => void) {
  flushSync(() => set(text))
  box?.focus()
  box?.setSelectionRange(text.length, text.length)
}
