import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { db } from '../../db/db'
import { getOwnWords } from '../../db/repo'
import type { Prototype } from '../../db/types'
import { deriveEnergy, energyEdge } from '../../domain/feelings'
import { howLine, nextLabel, PROTOTYPES_INTRO, questionSuggestions } from '../../domain/prototypes'
import { dayMonth } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { PrototypeDone, PrototypeEdit, PrototypeNew } from './PrototypeSheets'

type Sheet = { kind: 'new' } | { kind: 'edit'; prototype: Prototype } | { kind: 'done'; prototype: Prototype }

/** Prototypes: planned ones first, then what they taught you. A date in the past is just a date, never "overdue". */
export function PrototypesPage() {
  const plannedId = useId()
  const doneId = useId()
  const loaded = useLiveQuery(async () => {
    const [prototypes, plans, items, own] = await Promise.all([db.prototypes.toArray(), db.odysseyPlans.toArray(), db.ikigaiItems.toArray(), getOwnWords()])
    return { prototypes, suggestions: questionSuggestions(plans, items), own }
  }, [])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  // Render only once loaded, so nothing jumps under your finger.
  if (loaded === undefined) return <div className="loading" aria-busy="true" />

  const { prototypes, suggestions, own } = loaded
  const planned = prototypes.filter((p) => p.doneAt === null).sort((a, b) => a.createdAt - b.createdAt)
  const done = prototypes.filter((p) => p.doneAt !== null).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))

  return (
    <>
      <a className="back-link" href={hashFor('design')}>
        ‹ Life Design
      </a>
      <h1>Prototypes</h1>
      <p className="muted">{PROTOTYPES_INTRO}</p>

      {planned.length ? (
        <section className="list-section" aria-labelledby={plannedId}>
          <h2 id={plannedId}>Planned</h2>
          <ul className="entry-list">
            {planned.map((p) => (
              <li key={p.id}>
                <button type="button" className="entry-row" onClick={() => setSheet({ kind: 'edit', prototype: p })}>
                  <span className="entry-text">
                    <span className="entry-activity">{p.question}</span>
                    <span className="entry-feelings">
                      {[howLine(p), p.planSlot ? `Plan ${p.planSlot}` : null, p.when ? dayMonth(p.when) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {done.length ? (
        <section className="list-section" aria-labelledby={doneId}>
          <h2 id={doneId}>Done</h2>
          <ul className="entry-list">
            {done.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="entry-row"
                  data-energy={energyEdge(deriveEnergy(p.after, own))}
                  onClick={() => setSheet({ kind: 'edit', prototype: p })}
                >
                  <span className="entry-text">
                    <span className="entry-activity">{p.question}</span>
                    {p.learned ? <span className="entry-note">{p.learned}</span> : null}
                    <span className="entry-feelings">
                      {[p.after.map((w) => w.toLowerCase()).join(' · '), nextLabel(p.next)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {prototypes.length === 0 ? <p className="empty">Pick a question from a plan, then find a quick way to test it.</p> : null}
      <button type="button" className="primary wide" onClick={() => setSheet({ kind: 'new' })}>
        + New prototype
      </button>

      {sheet?.kind === 'new' ? <PrototypeNew suggestions={suggestions} onClose={() => setSheet(null)} /> : null}
      {sheet?.kind === 'edit' ? (
        <PrototypeEdit
          key={sheet.prototype.id}
          prototype={sheet.prototype}
          own={own}
          onClose={() => setSheet(null)}
          onDone={(saved) => setSheet({ kind: 'done', prototype: saved })}
        />
      ) : null}
      {sheet?.kind === 'done' ? <PrototypeDone prototype={sheet.prototype} own={own} onClose={() => setSheet(null)} /> : null}
    </>
  )
}
