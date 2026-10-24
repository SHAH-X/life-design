import { useEffect, useId, useRef, useState } from 'react'
import { db } from '../../db/db'
import { answered } from '../../db/provoker'
import { deletePhotos, saveEntry, savePhoto } from '../../db/repo'
import type { Entry, PhotoRef } from '../../db/types'
import { partOfDay, toDateKey } from '../../lib/dates'
import { PhotoError, shrinkPhoto } from '../../lib/photo'
import type { Ask } from '../../prompts/provoke'
import { eveningStarters } from '../../prompts/starters'
import { Dialog } from '../../ui/Dialog'
import { Starters, typeInto } from '../../ui/Starters'
import { PhotoView, StoredPhoto } from '../photos/PhotoView'
import { setPhotoText, usePhotoText } from '../photos/usePhotoText'

/** A draft is saved this long after the last change. */
const DRAFT_DELAY_MS = 500

/** A photo added while writing, shrunk already: kept here until it's written beside the entry. */
interface Shot {
  id: string
  data: string
  width: number
  height: number
}

/**
 * Write freely: one blank page, no questions. Openers are there if wanted, never in the way. Saved as a draft
 * as you write, so closing never loses anything. With `ask` (Today's question from your writing, v0.16) the page asks
 * it instead, and the writing keeps it; finishing it settles the question. Photos (v0.16) can be added, or be all
 * there is: each is shrunk on the phone and saved with the draft.
 */
export function FreeWrite(props: { date: string; draft?: Entry; ask?: Ask; onClose: () => void; onSaved?: (entry: Entry) => void }) {
  const { date, draft, ask, onClose, onSaved } = props
  const replyTo = ask ? { id: ask.id, question: ask.question } : (draft?.replyTo ?? null)
  const id = useId()
  const hintId = useId()
  const box = useRef<HTMLTextAreaElement>(null)
  const reading = usePhotoText()
  const [text, setText] = useState(draft?.note ?? '')
  const [photos, setPhotos] = useState<PhotoRef[]>(draft?.photos ?? [])
  const [shots, setShots] = useState<ReadonlyMap<string, Shot>>(new Map())
  const [adding, setAdding] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const saved = useRef<Entry | undefined>(draft)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const finished = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef({ text, photos, shots })
  latest.current = { text, photos, shots }
  /** Shots written beside the entry already, and photos taken off it, to remove when it's next saved. */
  const written = useRef(new Set<string>(draft?.photos.map((p) => p.id) ?? []))
  const removed = useRef<string[]>([])

  const persist = (status: 'draft' | 'done') => {
    const { text: note, photos: refs, shots: added } = latest.current
    queue.current = queue.current.then(async () => {
      const part = saved.current?.part ?? (date === toDateKey(new Date()) ? partOfDay(new Date()) : 'evening')
      // A photo may have been read meanwhile (src/db/photoText.ts): keep its text.
      const stored = saved.current ? await db.entries.get(saved.current.id) : undefined
      const kept = refs.map((ref) => ({ ...ref, text: stored?.photos.find((p) => p.id === ref.id)?.text ?? ref.text }))
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
          replyTo,
          photos: kept,
        },
        stored ?? saved.current,
      )
      const now = Date.now()
      for (const ref of refs) {
        const shot = added.get(ref.id)
        if (!shot || written.current.has(ref.id)) continue
        await savePhoto({ id: shot.id, entryId: saved.current.id, type: 'image/jpeg', width: shot.width, height: shot.height, data: shot.data, createdAt: now, updatedAt: now })
        written.current.add(ref.id)
      }
      await deletePhotos(removed.current.splice(0))
    })
    return queue.current
  }
  const persistRef = useRef(persist)
  persistRef.current = persist

  const hasSomething = text.trim() !== '' || photos.length > 0
  useEffect(() => {
    if (finished.current || !hasSomething) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      void persistRef.current('draft').catch(() => undefined)
    }, DRAFT_DELAY_MS)
  }, [text, photos, hasSomething])
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

  async function addPhotos(files: readonly File[]) {
    setAdding(true)
    setPhotoError(null)
    try {
      for (const file of files) {
        const shot = { id: crypto.randomUUID(), ...(await shrinkPhoto(file)) }
        setShots((s) => new Map(s).set(shot.id, shot))
        setPhotos((p) => [...p, { id: shot.id, text: null }])
      }
    } catch (error) {
      setPhotoError(error instanceof PhotoError ? error.message : new PhotoError().message)
    } finally {
      setAdding(false)
    }
  }

  const removePhoto = (photoId: string) => {
    setPhotos((p) => p.filter((ref) => ref.id !== photoId))
    if (written.current.has(photoId)) removed.current.push(photoId)
  }

  async function save() {
    setBusy(true)
    clearTimeout(timer.current)
    timer.current = undefined
    finished.current = true
    try {
      await persist('done')
      if (replyTo) await answered(toDateKey(new Date()), replyTo).catch(() => undefined)
      if (onSaved && saved.current) onSaved(saved.current)
      else onClose()
    } catch {
      finished.current = false
      setBusy(false) // the save-error prompt explains what happened
    }
  }

  const footer = (
    <button type="button" className="primary wide" disabled={busy || adding || !hasSomething} onClick={() => void save()}>
      Save
    </button>
  )

  return (
    <Dialog title="Write freely" onClose={onClose} footer={footer} full fillBody>
      <label className="question-text" htmlFor={id}>
        {replyTo?.question ?? "What's on your mind?"}
      </label>
      <textarea ref={box} id={id} aria-describedby={hintId} className="fill" data-autofocus value={text} rows={10} maxLength={20000} onChange={(e) => setText(e.target.value)} />
      <div className="field-foot">
        {text.trim() === '' ? <Starters starters={eveningStarters('free')} onPick={(t) => typeInto(box.current, t, setText)} /> : null}
      </div>
      {photos.length ? (
        <ul className="photo-strip" aria-label="Photos">
          {photos.map((ref, i) => {
            const shot = shots.get(ref.id)
            const alt = `Photo ${i + 1}`
            return (
              <li key={ref.id}>
                {shot ? <PhotoView data={shot.data} width={shot.width} height={shot.height} className="photo-thumb" alt={alt} /> : <StoredPhoto id={ref.id} className="photo-thumb" alt={alt} />}
                <button type="button" className="photo-remove" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(ref.id)}>
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
      <label className={`photo-add${adding ? ' busy' : ''}`}>
        <input type="file" accept="image/*" multiple disabled={adding} onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) void addPhotos(files)
        }} />
        {adding ? 'Adding the photo…' : 'Add a photo'}
      </label>
      {photoError ? (
        <p className="error small" role="alert">
          {photoError}
        </p>
      ) : null}
      {photos.length && reading === 'unasked' ? (
        <aside className="notice">
          <p>
            Read the text in photos, so you can find them by it?
            <br />
            <span className="muted small">About 6 MB, once. Stays on this phone.</span>
          </p>
          <div className="row">
            <button type="button" className="primary" onClick={() => void setPhotoText(true)}>
              Turn on
            </button>
            <button type="button" onClick={() => void setPhotoText(false)}>
              No thanks
            </button>
          </div>
        </aside>
      ) : null}
      <p id={hintId} className="field-help">
        Tap the mic on the keyboard to speak.
      </p>
    </Dialog>
  )
}
