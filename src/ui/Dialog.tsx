import { type ReactNode, useEffect, useId, useRef } from 'react'
import { useKeyboardInset } from './useKeyboardInset'
import { useScrollLock } from './useScrollLock'

interface Props {
  /** Names the sheet for VoiceOver; shown in the header unless `titleHidden`. */
  title: string
  titleHidden?: boolean
  /** Controls in the header, e.g. a Back link and progress dots. */
  toolbar?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** A modal sheet built on the native <dialog>. Mount it to open it; unmount it to close it. */
export function Dialog({ title, titleHidden = false, toolbar, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      dialog.showModal()
      // Start on a field marked data-autofocus, or on the sheet itself: never on ✕ Close, where a stray
      // Enter would close the sheet (the browser's default picks the first button, which is Close).
      ;(dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog).focus()
    }
    return () => dialog?.close()
  }, [])
  useKeyboardInset(ref)
  useScrollLock()

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-header">
          <h2 id={titleId} className={titleHidden ? 'visually-hidden' : undefined}>
            {title}
          </h2>
          {toolbar ? <div className="sheet-toolbar">{toolbar}</div> : null}
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </div>
    </dialog>
  )
}
