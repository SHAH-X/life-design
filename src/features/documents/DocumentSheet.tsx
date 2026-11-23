import { useEffect, useState } from 'react'
import { documentData, dismissDate, removeDocument, trackDate, untrackDate, updateDocument } from '../../db/documents'
import type { Bill, DocumentRecord, TrackKind } from '../../db/types'
import { EVERY_WORDS } from '../../domain/bills'
import { datesIn, DOC_TYPES, docEvents, KIND_WORDS } from '../../domain/documents'
import { formatDateKey, shortDayMonth } from '../../lib/dates'
import { fileOf } from '../../lib/docfile'
import { money } from '../../lib/money'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { buildIcs } from '../../reminders/ics'
import { Dialog } from '../../ui/Dialog'
import { PdfView } from './PdfView'
import { useAutosave } from './useAutosave'

// One document (step 5, 2026-11-23): its type and title, the dates found in it (tracked only when you say so), the bill it is linked
// to, its file (drawn here, or sent through the share menu: never a link to a file) and a note. The file is never changed.

const TRACK: Record<TrackKind, string> = { renews: 'renewal', expires: 'expiry', ends: 'end', due: 'due date', starts: 'start' }
const TRACK_KINDS = Object.keys(TRACK) as TrackKind[]
const key = (date: string, kind: string) => `${date}|${kind}`

export function DocumentSheet({ doc, bills, today, onClose }: { doc: DocumentRecord; bills: readonly Bill[]; today: string; onClose: () => void }) {
  const [title, setTitle] = useState(doc.title)
  const [notes, setNotes] = useState(doc.notes)
  const [showing, setShowing] = useState(false)
  const [data, setData] = useState<string | null | undefined>(undefined)
  const [mine, setMine] = useState<{ date: string; kind: TrackKind }>({ date: '', kind: 'renews' })
  const [sure, setSure] = useState(false)

  useEffect(() => {
    let live = true
    void documentData(doc.id).then((d) => live && setData(d))
    return () => {
      live = false
    }
  }, [doc.id])

  const found = datesIn(doc.text ?? '').filter((d) => !doc.tracked.some((t) => t.date === d.date && t.kind === d.kind) && !doc.dismissed.includes(key(d.date, d.kind)))
  const bill = bills.find((b) => b.id === doc.billId)
  const comingUp = doc.tracked.some((t) => t.date >= today)

  // Kept as you type (a title with no letters is not kept: the box goes back to the title when you leave it).
  useAutosave(title, doc.title, (v) => v.trim() && v.trim() !== doc.title && void updateDocument(doc.id, { title: v }))
  useAutosave(notes, doc.notes, (v) => v.trim() !== doc.notes && void updateDocument(doc.id, { notes: v }))

  // Built inside the tap, because iPhone only opens the share menu straight from a tap.
  function calendarFile() {
    const file = new File([buildIcs(docEvents([{ ...doc, notes }], today), new Date())], `${doc.title.replace(/[^\w ]+/g, ' ').trim() || 'document'}.ics`, { type: 'text/calendar' })
    if (canShareFile(file)) void shareFile(file).catch(() => undefined)
    else downloadFile(file)
  }

  function sendFile() {
    if (!data) return
    const file = fileOf(doc.title, doc.kind, data)
    if (canShareFile(file)) void shareFile(file).catch(() => undefined)
    else downloadFile(file)
  }

  return (
    <Dialog title={doc.title} onClose={onClose} full>
      <p className="muted small">
        {[doc.kind === 'pdf' ? `PDF${doc.pages ? ` · ${doc.pages} ${doc.pages === 1 ? 'page' : 'pages'}` : ''}` : 'Photo', `added ${formatDateKey(new Date(doc.createdAt).toISOString().slice(0, 10))}`].join(' · ')}
      </p>
      <label className="field">
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title.trim() && setTitle(doc.title)} />
      </label>
      <label className="field">
        <span>What kind of document</span>
        <select value={doc.type} onChange={(e) => void updateDocument(doc.id, { type: e.target.value })}>
          {[...new Set([...DOC_TYPES, doc.type])].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <h3 className="question-text">Dates in it</h3>
      <p className="muted small">Nothing is tracked until you say so.</p>
      {doc.text === null ? <p className="muted">Its words haven’t been read yet.</p> : null}
      {doc.text === '' ? <p className="muted">No text was found in it: it may be a scan. Add a date yourself below.</p> : null}
      <ul className="plain-list compact">
        {found.map((d) => (
          <li key={key(d.date, d.kind)} className="doc-date">
            <span>
              <strong>{formatDateKey(d.date)}</strong> · “{d.label}”
            </span>
            <span className="doc-date-actions">
              <button type="button" onClick={() => void trackDate(doc.id, d)}>
                Track as {TRACK[d.kind]}
              </button>
              <button type="button" onClick={() => void dismissDate(doc.id, key(d.date, d.kind))}>
                Not a date to track
              </button>
            </span>
          </li>
        ))}
        {doc.tracked.map((t) => (
          <li key={key(t.date, t.kind)} className="doc-date">
            <span>
              <strong>{formatDateKey(t.date)}</strong> · {TRACK[t.kind]} · tracked
            </span>
            <button type="button" onClick={() => void untrackDate(doc.id, key(t.date, t.kind))}>
              Stop tracking {formatDateKey(t.date)}
            </button>
          </li>
        ))}
      </ul>
      <div className="doc-date-own">
        <label className="field">
          <span>A date of your own</span>
          <input type="date" value={mine.date} onChange={(e) => setMine({ ...mine, date: e.target.value })} />
        </label>
        <label className="field">
          <span>What it is</span>
          <select value={mine.kind} onChange={(e) => setMine({ ...mine, kind: e.target.value as TrackKind })}>
            {TRACK_KINDS.map((k) => (
              <option key={k} value={k}>
                {TRACK[k]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!mine.date}
          onClick={() => {
            void trackDate(doc.id, { date: mine.date, kind: mine.kind, label: `You said it ${KIND_WORDS[mine.kind].replace(/^is /, 'is ')}` })
            setMine({ date: '', kind: 'renews' })
          }}
        >
          Track this date
        </button>
      </div>
      {comingUp ? (
        <>
          <button type="button" className="small-link" onClick={calendarFile}>
            Add the dates to your calendar
          </button>
          <p className="muted small">A calendar file with alerts 30 and 2 days before each date. Mail it to yourself or AirDrop it to your Mac, then add it.</p>
        </>
      ) : null}

      <h3 className="question-text top-gap">Linked bill</h3>
      <label className="field">
        <span className="visually-hidden">Linked bill</span>
        <select value={doc.billId ?? ''} onChange={(e) => void updateDocument(doc.id, { billId: e.target.value || null })}>
          <option value="">None</option>
          {bills.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} · {money(b.amount, '£')} {EVERY_WORDS[b.every]}
            </option>
          ))}
        </select>
      </label>
      {bill ? <p className="muted small">Next payment of {bill.name}: around {shortDayMonth(bill.next)} or a cycle later.</p> : null}

      <h3 className="question-text top-gap">The file</h3>
      <p className="muted small">Kept as you added it: never changed.</p>
      <div className="doc-file-actions">
        <button type="button" aria-expanded={showing} disabled={!data} onClick={() => setShowing(!showing)}>
          {showing ? 'Hide it' : 'View it here'}
        </button>
        <button type="button" disabled={!data} onClick={sendFile}>
          Send it…
        </button>
      </div>
      {showing && data ? doc.kind === 'pdf' ? <PdfView data={data} pages={doc.pages} /> : <img className="doc-image" alt={`${doc.title}, as photographed`} src={`data:${doc.mime};base64,${data}`} /> : null}

      <label className="field top-gap">
        <span>Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {sure ? (
        <button type="button" className="small-link" onClick={() => void removeDocument(doc.id).then(onClose)}>
          Yes, delete this document and its file
        </button>
      ) : (
        <button type="button" className="small-link" onClick={() => setSure(true)}>
          Delete this document
        </button>
      )}
    </Dialog>
  )
}
