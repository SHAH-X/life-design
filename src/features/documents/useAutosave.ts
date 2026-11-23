import { useEffect, useRef } from 'react'

/** Saves a field in the background (the UI rule: what you type is kept at once, never only when the field loses focus, since a tap on ✕ or a
 *  leap to another app doesn't move focus on an iPhone): a moment after you stop typing, when the app is hidden, and when the sheet
 *  closes. `value` is what is in the box, `saved` what is kept; nothing is saved while they are the same. */
export function useAutosave(value: string, saved: string, save: (value: string) => void, delay = 600): void {
  const latest = useRef({ value, saved, save })
  latest.current = { value, saved, save }
  useEffect(() => {
    const timer = setTimeout(() => {
      if (value !== saved) save(value)
    }, delay)
    return () => clearTimeout(timer)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const flush = () => {
      const { value: v, saved: s, save: write } = latest.current
      if (v !== s) write(v)
    }
    const hidden = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [])
}
