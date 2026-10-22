import { useEffect } from 'react'

// Shared by every open sheet, so a dialog over a sheet keeps the page locked until the last one closes.
let locks = 0
let lockedAt = 0

/**
 * Pins the page behind a sheet while it's open. A modal <dialog> stops taps reaching the page, not scrolling:
 * on iOS a swipe inside the sheet moved the page behind it. `overflow: hidden` isn't reliable there, so the body
 * is fixed in place (at the same spot on screen) and the scroll position is put back when the sheet closes.
 */
export function useScrollLock() {
  useEffect(() => {
    const body = document.body
    if (locks === 0) {
      lockedAt = window.scrollY
      Object.assign(body.style, { position: 'fixed', top: `-${lockedAt}px`, left: '0', right: '0' })
    }
    locks += 1
    return () => {
      locks -= 1
      if (locks > 0) return
      Object.assign(body.style, { position: '', top: '', left: '', right: '' })
      window.scrollTo(0, lockedAt)
    }
  }, [])
}
