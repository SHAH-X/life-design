import { useState } from 'react'
import type { Prototype } from '../../db/types'
import type { OwnWord } from '../../domain/feelings'
import { howLine } from '../../domain/prototypes'
import { PrototypeDone } from '../design/PrototypeSheets'

/**
 * The review follows up on prototypes that were planned when it opened. Each stays listed, marked done once
 * it is, so nothing moves away mid-review. Not yet is fine: no "overdue", no guilt.
 */
export function ExperimentsStep({ ids, prototypes, own }: { ids: readonly string[]; prototypes: readonly Prototype[]; own: readonly OwnWord[] }) {
  const [doing, setDoing] = useState<Prototype | null>(null)
  const listed = ids.flatMap((id) => prototypes.filter((p) => p.id === id))

  return (
    <section>
      <p className="muted">Not yet is fine: it'll be here next time.</p>
      <ul className="entry-list">
        {listed.map((p) => (
          <li key={p.id} className="experiment-row">
            <span className="entry-text">
              <span className="entry-activity">{p.question}</span>
              <span className="entry-feelings">{howLine(p)}</span>
            </span>
            {p.doneAt !== null ? (
              <span className="muted small">✓ Done</span>
            ) : (
              <button type="button" onClick={() => setDoing(p)}>
                I did it
              </button>
            )}
          </li>
        ))}
      </ul>
      {doing ? <PrototypeDone prototype={doing} own={own} onClose={() => setDoing(null)} /> : null}
    </section>
  )
}
