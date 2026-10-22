import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useId, useState } from 'react'
import { db } from '../../db/db'
import { loadSuggestions } from '../../db/repo'
import type { IkigaiItem } from '../../db/types'
import { CIRCLES, IKIGAI_GROUPS, IKIGAI_INTRO, ikigaiEvidence, ikigaiGroup, ikigaiLine, ikigaiSuggestions } from '../../domain/ikigai'
import { hashFor } from '../../lib/route'
import { type IkigaiDraft, IkigaiSheet } from './IkigaiSheet'

/** Four small circles, filled where true. Decorative: the group and the words say the same. */
function CircleMark({ item }: { item: IkigaiItem }) {
  return (
    <span className="circle-mark" aria-hidden="true">
      {CIRCLES.map((c) => (
        <i key={c.key} className={item[c.key] ? 'on' : undefined} />
      ))}
    </span>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="list-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}

/** The Ikigai map, as a list in words: each item in one group, with evidence from your days. */
export function IkigaiPage() {
  const loaded = useLiveQuery(async () => {
    const [items, entries, suggestions] = await Promise.all([db.ikigaiItems.toArray(), db.entries.toArray(), loadSuggestions()])
    return { items, entries, activities: suggestions.activities }
  }, [])
  const [sheet, setSheet] = useState<{ existing?: IkigaiItem; draft?: IkigaiDraft } | null>(null)
  // Render only once loaded, so nothing jumps under your finger.
  if (loaded === undefined) return <div className="loading" aria-busy="true" />

  const { items, entries, activities } = loaded
  const groups = IKIGAI_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => ikigaiGroup(item) === group.key).sort((a, b) => a.text.localeCompare(b.text)),
  })).filter((group) => group.items.length > 0)
  const suggestions = ikigaiSuggestions(entries, items)

  return (
    <>
      <a className="back-link" href={hashFor('design')}>
        ‹ Life Design
      </a>
      <h1>Ikigai map</h1>
      <p className="muted">{IKIGAI_INTRO}</p>

      {groups.map((group) => (
        <Group key={group.key} title={group.title}>
          <ul className="entry-list">
            {group.items.map((item) => {
              const line = ikigaiLine(item)
              return (
                <li key={item.id}>
                  <button type="button" className="entry-row ikigai-row" onClick={() => setSheet({ existing: item })}>
                    <CircleMark item={item} />
                    <span className="entry-text">
                      <span className="entry-activity">{item.text}</span>
                      {line ? <span className="entry-feelings">{line}</span> : null}
                      {ikigaiEvidence(item, entries).map((evidence) => (
                        <span key={evidence} className="entry-feelings">
                          {evidence}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Group>
      ))}
      {items.length === 0 ? <p className="empty">Start with something you love, or something you're good at.</p> : null}
      <button type="button" className="primary wide" onClick={() => setSheet({})}>
        + Add
      </button>

      {suggestions.length ? (
        <Group title="Your days suggest">
          <ul className="entry-list">
            {suggestions.map((name) => (
              <li key={name} className="suggest-row">
                <span className="grow">{name}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Add ${name}`}
                  onClick={() => setSheet({ draft: { text: name, linkedActivities: [name] } })}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {sheet ? <IkigaiSheet existing={sheet.existing} draft={sheet.draft} activities={activities} onClose={() => setSheet(null)} /> : null}
    </>
  )
}
