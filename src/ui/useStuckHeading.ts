import { useEffect } from 'react'

/**
 * Marks the one sticky heading that is stuck at the top of the screen with `data-stuck`, and no other. Logs' day
 * headers are glass only while stuck: blurring every one of them (a real journal has many) put far more than three
 * blur layers on the screen, and an unstuck header has nothing behind it to show through.
 */
export function useStuckHeading(selector: string) {
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const heads = [...document.querySelectorAll<HTMLElement>(selector)]
      let stuck: HTMLElement | null = null
      for (const head of heads) {
        const top = Number.parseFloat(getComputedStyle(head).top) || 0
        const rect = head.getBoundingClientRect()
        const section = head.parentElement?.getBoundingClientRect()
        // At its stuck position, with its section still reaching below it.
        if (section && window.scrollY > 0 && rect.top <= top + 0.5 && section.bottom > top + rect.height) stuck = head
      }
      for (const head of heads) {
        if (head === stuck) head.setAttribute('data-stuck', 'true')
        else head.removeAttribute('data-stuck')
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    update()
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  })
}
