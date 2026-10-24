import { useId } from 'react'
import type { Entry } from '../../db/types'
import { areaLines } from '../../domain/areas'
import { useAreas } from '../areas/AreasProvider'
import { setMeaningSearch } from '../meaning/useMeaning'
import { Evidence } from './Evidence'

/**
 * Life areas over a period (v0.16): what you wrote about, sorted by itself. Each area with 3+ entries and its count,
 * most first; the rest on one line, by name. Every line opens to its entries. Closeness is never shown. Life areas read
 * the numbers search by meaning works out, so with it off this offers it.
 */
export function LifeAreas({ entries, byId, onOpen }: { entries: readonly Entry[]; byId: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  const headingId = useId()
  const { meaning, byEntry, work } = useAreas()
  const lines = byEntry ? areaLines(entries.map((e) => e.id), byEntry) : null
  const any = lines !== null && lines.ranked.length + lines.also.length > 0

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        Life areas
      </h2>
      <p className="muted small week-period">Last 30 days, sorted by what you wrote.</p>
      {meaning !== 'on' ? (
        <aside className="notice">
          <p>
            Sort what you write into areas?
            <br />
            <span className="muted small">Uses search by meaning: about 30 MB, once. Stays on this phone.</span>
          </p>
          <button type="button" className="primary" onClick={() => void setMeaningSearch(true)}>
            Turn on
          </button>
        </aside>
      ) : work.state === 'problem' ? (
        <p className="error small" role="alert">
          {work.message}
        </p>
      ) : work.state === 'working' && work.progress ? (
        <p className="muted small" role="status">
          Sorting your writing: {work.progress.done} of {work.progress.total}
        </p>
      ) : !lines ? (
        <p className="muted small" role="status">
          Getting life areas ready…
        </p>
      ) : null}
      {meaning === 'on' && lines && !any && work.state !== 'working' ? (
        <div className="card">
          <p className="muted">Areas show as you write.</p>
        </div>
      ) : null}
      {lines && any ? (
        <div className="card week-card">
          <ul className="plain-list compact">
            {lines.ranked.map((line) => (
              <li key={line.id}>
                <details className="week-line">
                  <summary>
                    <span>{line.name}</span> <span className="muted small">· {line.entryIds.length} entries</span>
                  </summary>
                  <Evidence ids={line.entryIds} entries={byId} onOpen={onOpen} />
                </details>
              </li>
            ))}
            {lines.also.length ? (
              <li>
                <details className="week-line">
                  <summary>
                    <span>Also</span>{' '}
                    <span className="muted small">· {lines.also.map((l) => `${l.name} ${l.entryIds.length}`).join(', ')}</span>
                  </summary>
                  <Evidence ids={[...new Set(lines.also.flatMap((l) => l.entryIds))]} entries={byId} onOpen={onOpen} />
                </details>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
