import { useEffect, useId, useRef, useState } from 'react'
import { setSmallJoy } from '../../db/repo'

/** One line a day: the small, everyday kind of ikigai. Saves as you type. */
export function SmallJoy({ date, saved }: { date: string; saved: string }) {
  const id = useId()
  const [text, setText] = useState(saved)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const edited = useRef(false)
  const pending = useRef(false)
  const latest = useRef(text)
  latest.current = text

  // Show the stored value once it loads, unless you've already started typing.
  useEffect(() => {
    if (!edited.current) setText(saved)
  }, [saved])

  async function persist(value: string) {
    pending.current = false
    setStatus('saving')
    try {
      await setSmallJoy(date, value)
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

  // Leaving the screen within the typing delay still saves.
  useEffect(
    () => () => {
      if (pending.current) void setSmallJoy(date, latest.current)
    },
    [date],
  )

  return (
    <section className="card small-joy">
      <h2>
        <label htmlFor={id}>Small joy</label>
      </h2>
      <p className="muted small">One small thing that gave today meaning or joy.</p>
      <textarea
        id={id}
        value={text}
        rows={2}
        maxLength={280}
        placeholder="e.g. Coffee in the sun before work"
        onChange={(event) => {
          edited.current = true
          pending.current = true
          setText(event.target.value)
        }}
        onBlur={() => {
          if (pending.current) void persist(latest.current)
        }}
      />
      <p className="save-status" aria-live="polite">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : ''}
      </p>
    </section>
  )
}
