import { type ReactNode, useEffect, useId, useRef } from 'react'

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
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  return (
    <dialog
      ref={ref}
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
