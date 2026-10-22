/** Room kept between a field and the sheet's header and footer. */
const MARGIN = 12

/**
 * Brings an element wholly into sight inside its sheet's scrolling body: never under the footer (Skip, Next,
 * Save) or the header. One taller than the space shows from its top. Outside a sheet it does nothing: the page
 * scrolls itself. (v0.9 on the iPhone: "+ your own word" put its box behind Skip.)
 */
export function keepInView(element: Element | null) {
  if (!(element instanceof HTMLElement)) return
  const body = element.closest('.sheet-body')
  if (!(body instanceof HTMLElement)) return
  const view = body.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  const top = view.top + MARGIN
  const bottom = view.bottom - MARGIN
  if (box.top < top || box.height > bottom - top) body.scrollTop += box.top - top
  else if (box.bottom > bottom) body.scrollTop += box.bottom - bottom
}

/** For something that appears below what's on screen (a follow-up question, an extra field): bring it into sight. */
export function revealOnMount(node: HTMLElement | null) {
  if (node) requestAnimationFrame(() => keepInView(node))
}

/** Fields that bring up the keyboard. */
export const isTextField = (element: EventTarget | null): element is HTMLElement =>
  element instanceof HTMLElement && element.matches('input:not([type=radio]):not([type=checkbox]), textarea, select, [contenteditable]')
