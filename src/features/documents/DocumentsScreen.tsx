import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { addDocument, documentData, setDocumentText } from '../../db/documents'
import { db } from '../../db/db'
import { guessType, KIND_WORDS, needsLook, searchDocuments } from '../../domain/documents'
import { shortDayMonth, toDateKey } from '../../lib/dates'
import { DOCUMENT_PROBLEMS, readDocumentFile } from '../../lib/docfile'
import { EVERY_WORDS } from '../../domain/bills'
import { money } from '../../lib/money'
import { fromBase64 } from '../../lib/photo'
import { readPhoto } from '../../lib/reader'
import { Icon } from '../../ui/Icon'
import { Loading } from '../../ui/Loading'
import { ReadingOffer } from '../photos/ReadingOffer'
import { usePhotoText } from '../photos/usePhotoText'
import { DocumentSheet } from './DocumentSheet'

// Your documents (step 5, 2026-11-23, owner-approved plan; its mock shown first): kept on this phone, found by their words, with the
// dates in them suggested and tracked only when you say so. Nothing is sent anywhere.

/** Tracked dates this many days ahead are "Needs a look". */
const LOOK_DAYS = 60
const word = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function DocumentsScreen() {
  const docs = useLiveQuery(() => db.documents.orderBy('createdAt').reverse().toArray(), [])
  const bills = useLiveQuery(() => db.bills.toArray(), [])
  const reading = usePhotoText()
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const busy = useRef(false)
  const today = toDateKey(new Date())

  // A photo added while reading photos was off, or that couldn't be read, is read once it's on: one at a time, in the background.
  const unread = (docs ?? []).filter((d) => d.kind === 'image' && d.text === null).map((d) => d.id)
  useEffect(() => {
    if (reading !== 'on' || unread.length === 0 || busy.current) return
    busy.current = true
    void (async () => {
      try {
        for (const id of unread) {
          const data = await documentData(id)
          if (data) await setDocumentText(id, await readPhoto(fromBase64(data)))
        }
      } catch {
        // Reading photos explains its own problems (More → Reading photos); the photo stays unread to try again.
      } finally {
        busy.current = false
      }
    })()
  }, [reading, unread.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(file: File) {
    setAdding(true)
    setProblem(null)
    try {
      const read = await readDocumentFile(file, today, reading === 'on' ? readPhoto : null)
      setOpenId(await addDocument({ ...read, type: guessType(read.title, read.text ?? '') }))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : DOCUMENT_PROBLEMS.unreadable)
    } finally {
      setAdding(false)
    }
  }

  // Render only once loaded, so nothing jumps under the finger.
  if (docs === undefined || bills === undefined) return <Loading />
  const opened = docs.find((d) => d.id === openId)
  const looks = needsLook(docs, today, LOOK_DAYS)
  // Two letters at least: a single letter shows the list as it is, not "0 documents".
  const results = query.trim().length >= 2 ? searchDocuments(docs, query) : null
  const billOf = (id: string | null) => bills.find((b) => b.id === id)
  const noText = docs.filter((d) => d.text === '').length

  return (
    <>
      <p className="muted">Kept on this phone. Nothing is sent anywhere.</p>
      {docs.length ? (
        <label className="field">
          <span className="visually-hidden">Search your documents</span>
          <input type="search" value={query} placeholder="Search your documents" onChange={(e) => setQuery(e.target.value)} />
        </label>
      ) : null}

      {results ? (
        <section className="card" aria-label="Search results">
          <h2 className="rc-title">{word(results.length, 'document', 'documents')}</h2>
          <p className="muted small">Matches the letters you type, anywhere in a document.</p>
          <ul className="plain-list compact">
            {results.map(({ doc, snippets }) => (
              <li key={doc.id}>
                <button type="button" className="line-button doc-row" onClick={() => setOpenId(doc.id)}>
                  <span className="product-name">{doc.title}</span>
                  <span className="product-change">{doc.type}</span>
                  {snippets.map((segments, i) => (
                    <span key={i} className="product-sub">
                      {segments.map((s, j) => (s.hit ? <mark key={j}>{s.text}</mark> : s.text))}
                    </span>
                  ))}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          {looks.length ? (
            <section className="card" aria-labelledby="doc-look">
              <h2 id="doc-look" className="rc-title">
                Dates coming up
              </h2>
              <p className="muted small">Dates you tracked, in the next 60 days.</p>
              <ul className="plain-list compact">
                {looks.map((n) => {
                  const bill = billOf(n.doc.billId)
                  const billWords = bill ? `${bill.name} · ${money(bill.amount, '£')} ${EVERY_WORDS[bill.every]}` : ''
                  return (
                    <li key={`${n.doc.id}|${n.date}|${n.kind}`}>
                      <button type="button" className="line-button doc-row" onClick={() => setOpenId(n.doc.id)}>
                        <span className="product-name">{n.doc.title}</span>
                        <span className="product-change">{n.days === 0 ? 'today' : `in ${word(n.days, 'day', 'days')}`}</span>
                        <span className="product-sub">{[`${KIND_WORDS[n.kind].replace(/^is /, '')} ${shortDayMonth(n.date)}`.replace(/^./, (c) => c.toUpperCase()), billWords].filter(Boolean).join(' · ')}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <section className="card" aria-labelledby="doc-all">
            <h2 id="doc-all" className="rc-title">
              All documents {docs.length ? <span className="rc-count">{docs.length}</span> : null}
            </h2>
            {docs.length ? (
              <ul className="plain-list compact">
                {docs.map((d) => (
                  <li key={d.id}>
                    <button type="button" className="line-button doc-row" onClick={() => setOpenId(d.id)}>
                      <span className="product-name">{d.title}</span>
                      <span className="product-change" aria-hidden="true">
                        <Icon name="chevron-right" size={16} />
                      </span>
                      <span className="product-sub">{[d.type, d.kind === 'pdf' ? 'PDF' : 'photo', d.text === null ? 'not read yet' : d.text === '' ? 'no text found' : 'text read'].join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nothing here yet. Add a PDF, or take a photo of a paper: a tenancy agreement, a policy, a warranty, a certificate.</p>
            )}
            {noText ? <p className="muted small">{word(noText, 'document has', 'documents have')} no text to search, such as a scan. {noText === 1 ? 'It is kept as it is.' : 'They are kept as they are.'}</p> : null}
          </section>
        </>
      )}

      <div className="doc-add">
        <label className="button primary photo-add">
          <input
            type="file"
            accept="application/pdf,.pdf,image/*"
            disabled={adding}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void add(file)
            }}
          />
          {adding ? 'Adding…' : 'Add a document'}
        </label>
        <label className="button photo-add">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={adding}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void add(file)
            }}
          />
          <Icon name="camera" size={20} /> Take a photo
        </label>
      </div>
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
      {unread.length && reading === 'unasked' ? <ReadingOffer question="Read the text in photos, so documents you photograph can be searched?" /> : null}
      {unread.length && reading === 'off' ? <p className="muted small">Photos are read once More → Reading photos is on.</p> : null}

      {opened ? <DocumentSheet doc={opened} bills={bills} today={today} onClose={() => setOpenId(null)} /> : null}
    </>
  )
}
