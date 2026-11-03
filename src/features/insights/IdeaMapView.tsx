import { useState } from 'react'
import type { Entry, IdeaMap } from '../../db/types'
import { writtenSince } from '../../domain/ideaMap'
import { layoutIdeaMap } from '../../domain/ideaMapLayout'
import { PROVIDERS } from '../../lib/ai'
import { shortDate, shortDay } from '../../lib/dates'
import { IdeaMapChart, KIND_WORDS, type MapChoice } from '../../ui/charts/IdeaMapChart'
import { Evidence } from './Evidence'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What the phone left out, in a line: "1 link wasn't in your words, so it's left out." */
function leftOut({ ideas, links }: IdeaMap['dropped']): string | null {
  const parts = [ideas ? plural(ideas, 'idea', 'ideas') : '', links ? plural(links, 'link', 'links') : ''].filter(Boolean)
  if (!parts.length) return null
  const one = ideas + links === 1
  return `${parts.join(' and ')} ${one ? "wasn't" : "weren't"} in your words, so ${one ? "it's" : "they're"} left out.`
}

/**
 * One map of your ideas (v0.23), as drawn: who drew it and from what, a legend in words, the map, and under it what
 * a tapped idea or link holds. Every link is listed in your words, with the sentence it comes from, and opens its
 * entry: the map's table view too, with "Show as table" for the ideas. What the phone left out is said, never hidden.
 */
export function IdeaMapView({ map, entries, byId, onOpen }: { map: IdeaMap; entries: readonly Entry[]; byId: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  const [chosen, setChosen] = useState<MapChoice>(null)
  const layout = layoutIdeaMap(map.ideas, map.links)
  const idea = new Map(map.ideas.map((i) => [i.id, i]))
  const linksOf = (id: string) => map.links.filter((l) => l.from === id || l.to === id)
  const chosenIdea = chosen?.kind === 'idea' ? idea.get(chosen.id) : undefined
  const chosenLink = chosen?.kind === 'link' ? map.links.find((l) => l.from === chosen.from && l.to === chosen.to) : undefined
  const since = writtenSince(map, entries)
  const dropped = leftOut(map.dropped)

  const quoted = (l: IdeaMap['links'][number]) => {
    const entry = byId.get(l.entryId)
    const words = (
      <>
        {idea.get(l.from)?.label} <span className="muted">— {l.words} →</span> {idea.get(l.to)?.label}
        <br />
        <span className="muted small">
          “{l.quote}”{entry ? ` · ${shortDay(entry.date)}` : ''}
        </span>
      </>
    )
    return entry ? (
      <button type="button" className="line-button" onClick={() => onOpen(entry)}>
        <span>{words}</span>
      </button>
    ) : (
      <span>{words}</span>
    )
  }

  const readout = chosenIdea
    ? `${chosenIdea.label} · ${KIND_WORDS[chosenIdea.kind]} · ${plural(chosenIdea.entryIds.length, 'entry', 'entries')} · ${plural(linksOf(chosenIdea.id).length, 'link', 'links')}`
    : chosenLink
      ? `You wrote: “${chosenLink.quote}”`
      : map.ideas.length
        ? 'Tap an idea or a link.'
        : ''

  return (
    <>
      <div className="card week-card">
        <p className="muted small idea-map-by">
          Drawn by {PROVIDERS[map.provider].label} · {shortDate(map.createdAt)} · from {plural(map.entryCount, 'entry', 'entries')}
        </p>
        <p className="muted small idea-legend">
          <span className="idea-key weighs">Weighs on you</span> <span className="idea-key helps">Helps you</span> <span className="idea-key idea">Other ideas</span>
        </p>
        <figure className="chart">
          <p className="chart-readout" aria-live="polite">
            {readout}
          </p>
          <IdeaMapChart layout={layout} chosen={chosen} onChoose={setChosen} label="Your ideas, and the links you wrote between them" />
          {chosenIdea ? (
            <>
              <Evidence ids={chosenIdea.entryIds} entries={byId} onOpen={onOpen} />
              {linksOf(chosenIdea.id).length ? (
                <ul className="plain-list compact">
                  {linksOf(chosenIdea.id).map((l) => (
                    <li key={`${l.from}-${l.to}`}>{quoted(l)}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : chosenLink ? (
            <ul className="plain-list compact">
              <li>{quoted(chosenLink)}</li>
            </ul>
          ) : null}
          <details className="chart-table">
            <summary>Show as table</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Idea</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Entries</th>
                  <th scope="col">Links</th>
                </tr>
              </thead>
              <tbody>
                {map.ideas.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">{i.label}</th>
                    <td>{KIND_WORDS[i.kind]}</td>
                    <td>{i.entryIds.length}</td>
                    <td>{linksOf(i.id).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
        {map.links.length ? null : <p className="muted small">No links between them in your own words this time.</p>}
        {dropped ? <p className="muted small">{dropped}</p> : null}
        {map.dropped.cut ? <p className="muted small">{plural(map.dropped.cut, 'more was', 'more were')} left out to keep the map readable.</p> : null}
        {since ? <p className="muted small">{plural(since, 'entry', 'entries')} written since. Draw again to include them.</p> : null}
      </div>
      {map.links.length ? (
        <section className="card week-card" aria-label="In your words">
          <h3>In your words</h3>
          <ul className="plain-list">
            {map.links.map((l) => (
              <li key={`${l.from}-${l.to}`}>{quoted(l)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <details className="evidence">
        <summary>What was sent</summary>
        <pre className="sent-preview">{`${map.sent.instructions}\n\n---\n\n${map.sent.data}`}</pre>
      </details>
    </>
  )
}
