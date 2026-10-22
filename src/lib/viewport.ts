// iOS mostly doesn't shrink the page for the on-screen keyboard: only the visible area (window.visualViewport) gets
// shorter, and it may be scrolled down within the page. Anything pinned to the bottom of the page stays behind it.
// iOS 27 sometimes shrinks the page too: see keyboardInset.

/**
 * How many pixels at the bottom of the page the keyboard covers. Never below 0: after the keyboard closes,
 * iOS 26 can leave a stale offset behind, and that must not push anything off the screen.
 *
 * `fullHeight` is the page's height without the keyboard. iOS 27 sometimes shrinks the page itself for the
 * keyboard (a box low in a sheet, measured in the iOS Simulator, v0.12.2); its offset is then just the page's
 * scroll, not how far the visible area moved, so it's left out.
 */
export function keyboardInset(layoutHeight: number, visibleHeight: number, visibleTop: number, fullHeight = layoutHeight): number {
  const shrunk = layoutHeight < fullHeight - 1
  return Math.max(0, Math.round(layoutHeight - visibleHeight - (shrunk ? 0 : visibleTop)))
}
