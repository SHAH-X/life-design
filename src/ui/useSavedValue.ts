import { useEffect, useRef, useState } from 'react'

/**
 * A record edited on screen and saved in the background: every change shows at once (local state), saving
 * waits 600 ms after the last change, and anything pending is saved when the screen closes.
 */
export function useSavedValue<T>(initial: T, save: (value: T) => Promise<unknown>) {
  const [value, setValue] = useState(initial)
  const latest = useRef(value)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = () => {
    clearTimeout(timer.current)
    if (!pending.current) return
    pending.current = false
    void saveRef.current(latest.current)
  }

  useEffect(() => flush, [])

  const update = (next: T | ((current: T) => T)) => {
    const resolved = typeof next === 'function' ? (next as (current: T) => T)(latest.current) : next
    latest.current = resolved
    pending.current = true
    setValue(resolved)
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 600)
  }

  return { value, update, flush }
}
