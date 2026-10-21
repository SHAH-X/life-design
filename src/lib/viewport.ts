// iOS never shrinks the page for the on-screen keyboard: only the visible area (window.visualViewport) gets
// shorter, and it may be scrolled down within the page. Anything pinned to the bottom of the page stays behind it.

/**
 * How many pixels at the bottom of the page the keyboard covers. Never below 0: after the keyboard closes,
 * iOS 26 can leave a stale offset behind, and that must not push anything off the screen.
 */
export function keyboardInset(layoutHeight: number, visibleHeight: number, visibleTop: number): number {
  return Math.max(0, Math.round(layoutHeight - visibleHeight - visibleTop))
}
