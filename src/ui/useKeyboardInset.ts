import { type RefObject, useEffect } from 'react'
import { keyboardInset } from '../lib/viewport'
import { isStandalone } from '../lib/storage'
import { isTextField, keepInView } from './keepInView'

/** iOS 27's floating keyboard toolbar (Previous, Next, Done): 54pt from its shadow's top to the keys, measured in the
 * iOS Simulator (v0.12.2), and a little room. */
const KEYBOARD_TOOLBAR = 56

/** How far below the sheet its surface carries on while the keyboard is up, to cover the gap above the keys. */
const BELOW_SHEET = 160

/**
 * Keeps a bottom sheet above the iPhone keyboard. Sets --keyboard-inset (how much of the page the keyboard
 * covers) and --visible-height on the element for its CSS, and keeps the field being typed into in sight.
 */
export function useKeyboardInset(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport
    const element = ref.current
    if (!viewport || !element) return
    let last = 0
    let full = window.innerHeight
    const standalone = isStandalone()

    const update = () => {
      // With no text field focused there's no keyboard: the page's height now is its full height. iOS 27 can
      // shrink the page for the keyboard, and keyboardInset needs to know (v0.12.2).
      if (!isTextField(document.activeElement)) full = window.innerHeight
      const inset = keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop, full)
      element.style.setProperty('--keyboard-inset', `${inset}px`)
      element.style.setProperty('--visible-height', `${Math.round(viewport.height)}px`)
      // In a Safari tab the toolbar can lie over the visible area's bottom; in the Home Screen app it never does.
      element.style.setProperty('--keyboard-toolbar', `${inset > 0 && !standalone ? KEYBOARD_TOOLBAR : 0}px`)
      element.style.setProperty('--below-sheet', `${inset > 0 ? BELOW_SHEET : 0}px`)
      // The sheet just got shorter: bring the focused field back into sight within it, above the footer.
      const focused = document.activeElement
      if (inset > 0 && inset !== last && focused instanceof HTMLElement && focused !== element && element.contains(focused)) {
        keepInView(focused)
      }
      last = inset
    }

    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [ref])
}
