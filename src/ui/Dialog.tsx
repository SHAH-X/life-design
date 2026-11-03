import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'
import { isTextField, keepInView } from './keepInView'
import { useKeyboardInset } from './useKeyboardInset'
import { useScrollLock } from './useScrollLock'

/** The iPhone keyboard takes about this long to open; a field is brought into sight again after it. */
const KEYBOARD_OPENS_MS = 350

interface Props {
  /** Names the sheet for VoiceOver; shown in the header unless `titleHidden`. */
  title: string
  titleHidden?: boolean
  /** Controls in the header, e.g. a Back link and progress dots. */
  toolbar?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Use the whole screen, or all of it above the keyboard (the entry sheets). */
  full?: boolean
  /** Let one box (class `fill`) take the body's spare height, so it never runs under the footer. */
  fillBody?: boolean
  /** A small, muted header title (the writer: the page is the writing, not the title). */
  quietTitle?: boolean
}

/** A modal sheet built on the native <dialog>. Mount it to open it; close it only on an explicit user action. */
export function Dialog({ title, titleHidden = false, toolbar, onClose, children, footer, full = false, fillBody = false, quietTitle = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // The header's hairline shows only once the content has scrolled under it.
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // Start on a field marked data-autofocus, or on the sheet itself: never on ✕ Close, where a stray
    // Enter would close the sheet (the browser's default picks the first button, which is Close).
    ;(dialog.querySelector<HTMLElement>('[data-autofocus]') ?? dialog).focus()
  }, [])
  useKeyboardInset(ref)
  useScrollLock()

  // A field that gets the focus comes wholly into sight, above the footer: now, and again once the keyboard is up.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onFocus = (event: FocusEvent) => {
      const field = event.target
      if (!isTextField(field)) return
      keepInView(field)
      clearTimeout(timer)
      timer = setTimeout(() => keepInView(field), KEYBOARD_OPENS_MS)
    }
    dialog.addEventListener('focusin', onFocus)
    return () => {
      dialog.removeEventListener('focusin', onFocus)
      clearTimeout(timer)
    }
  }, [])

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      className={['sheet', full && 'full', quietTitle && 'quiet-title'].filter(Boolean).join(' ')}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="sheet-header" data-scrolled={scrolled || undefined}>
          <h2 id={titleId} className={titleHidden ? 'visually-hidden' : undefined}>
            {title}
          </h2>
          {toolbar ? <div className="sheet-toolbar">{toolbar}</div> : null}
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className={fillBody ? 'sheet-body fill' : 'sheet-body'} onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}>
          {children}
        </div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </div>
    </dialog>
  )
}
