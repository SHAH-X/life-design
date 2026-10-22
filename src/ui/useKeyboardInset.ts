import { type RefObject, useEffect } from 'react'
import { keyboardInset } from '../lib/viewport'
import { keepInView } from './keepInView'

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

    const update = () => {
      const inset = keyboardInset(window.innerHeight, viewport.height, viewport.offsetTop)
      element.style.setProperty('--keyboard-inset', `${inset}px`)
      element.style.setProperty('--visible-height', `${Math.round(viewport.height)}px`)
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
