import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved'

/**
 * A text box that saves itself: shows what you type at once, saves 800 ms after you stop,
 * on leaving the box, and when the screen closes within that pause.
 */
export function useAutosave(saved: string, save: (value: string) => Promise<unknown>) {
  const [text, setText] = useState(saved)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const edited = useRef(false)
  const pending = useRef(false)
  const latest = useRef(text)
  latest.current = text
  const saveRef = useRef(save)
  saveRef.current = save

  // Show the stored value once it loads, unless typing has started.
  useEffect(() => {
    if (!edited.current) setText(saved)
  }, [saved])

  async function persist(value: string) {
    pending.current = false
    setStatus('saving')
    try {
      await saveRef.current(value)
      setStatus('saved')
    } catch {
      setStatus('idle')
    }
  }

  useEffect(() => {
    if (!edited.current) return
    const timer = setTimeout(() => void persist(text), 800)
    return () => clearTimeout(timer)
  }, [text])

  useEffect(
    () => () => {
      if (pending.current) void saveRef.current(latest.current)
    },
    [],
  )

  return {
    text,
    status,
    onChange: (value: string) => {
      edited.current = true
      pending.current = true
      setText(value)
    },
    onBlur: () => {
      if (pending.current) void persist(latest.current)
    },
  }
}
