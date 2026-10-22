import { useEffect, useId, useRef, useState } from 'react'
import { saveEntry } from '../../db/repo'
import type { Entry } from '../../db/types'
import { partOfDay, toDateKey } from '../../lib/dates'
import { eveningStarters } from '../../prompts/starters'
import { Dialog } from '../../ui/Dialog'
import { Starters, typeInto } from '../../ui/Starters'

/** A draft is saved this long after the last change. */
const DRAFT_DELAY_MS = 500

/**
 * Write freely: one blank page, no questions. Openers are there if wanted, never in the way. Saved as a draft
 * as you write, so closing never loses anything.
 */
export function FreeWrite({ date, draft, onClose, onSaved }: { date: string; draft?: Entry; onClose: () => void; onSaved?: (entry: Entry) => void }) {
  const id = useId()
  const hintId = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(draft?.note ?? '')
  const [busy, setBusy] = useState(false)
  const saved = useRef<Entry | undefined>(draft)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const finished = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(text)
  latest.current = text

  const persist = (status: 'draft' | 'done') => {
    const note = latest.current
    queue.current = queue.current.then(async () => {
      const part = saved.current?.part ?? (date === toDateKey(new Date()) ? partOfDay(new Date()) : 'evening')
      saved.current = await saveEntry(
        {
          date,
          part,
          activity: '',
          engagement: 3,
          energy: 0,
          flow: false,
          where: [],
          people: [],
          objects: [],
          during: [],
          after: [],
          note,
          kind: 'free',
          purpose: 'free',
          skipped: ['engagement', 'energy'],
          status,
        },
        saved.current,
      )
    })
    return queue.current
  }
  const persistRef = useRef(persist)
  persistRef.current = persist

  useEffect(() => {
    if (finished.current || !text.trim()) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      void persistRef.current('draft').catch(() => undefined)
    }, DRAFT_DELAY_MS)
  }, [text])
  useEffect(
    () => () => {
      if (timer.current !== undefined && !finished.current) {
        clearTimeout(timer.current)
        void persistRef.current('draft').catch(() => undefined)
      }
    },
    [],
  )
  // Switching to another app saves at once: iOS may close or reload the app before the pause is over.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState !== 'hidden' || timer.current === undefined || finished.current) return
      clearTimeout(timer.current)
      timer.current = undefined
      void persistRef.current('draft').catch(() => undefined)
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [])

  async function save() {
    setBusy(true)
    clearTimeout(timer.current)
    timer.current = undefined
    finished.current = true
    try {
      await persist('done')
      if (onSaved && saved.current) onSaved(saved.current)
      else onClose()
    } catch {
      finished.current = false
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  const footer = (
    <button type="button" className="primary wide" disabled={busy || !text.trim()} onClick={() => void save()}>
      Save
    </button>
  )

  return (
    <Dialog title="Write freely" onClose={onClose} footer={footer} full fillBody>
      <label className="question-text" htmlFor={id}>
        What's on your mind?
      </label>
      <textarea ref={box} id={id} aria-describedby={hintId} className="fill" data-autofocus value={text} rows={10} maxLength={20000} onChange={(e) => setText(e.target.value)} />
      <div className="field-foot">
        {text.trim() === '' ? <Starters starters={eveningStarters('free')} onPick={(t) => typeInto(box.current, t, setText)} /> : null}
      </div>
      <p id={hintId} className="field-help">
        Tap the mic on the keyboard to speak.
      </p>
    </Dialog>
  )
}
