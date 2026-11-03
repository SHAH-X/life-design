import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { MIN_COUNT } from '../../analysis/stats'
import { useUndo } from '../../app/undo'
import { db } from '../../db/db'
import { deleteIdeaMap, restoreIdeaMap, saveIdeaMap } from '../../db/repo'
import type { Entry, IdeaMap } from '../../db/types'
import { buildMapPackage, type MapRange, mapPeriod, ownWords, parseIdeaMap } from '../../domain/ideaMap'
import { AiError, drawMapWithAi, MAP_PROBLEMS, PROVIDERS } from '../../lib/ai'
import { formatRecentPeriod, shortDate, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { BackLink } from '../../ui/BackLink'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { Loading } from '../../ui/Loading'
import { SwipeRow } from '../../ui/SwipeRow'
import { useAiSettings } from '../more/useAiSettings'
import { IdeaMapView } from './IdeaMapView'

// The map of your ideas (v0.23, owner's choice, 2026-11-03): your AI reads your own words from a period, on a tap,
// and names the ideas you come back to and the links you wrote between them; the phone keeps only what it finds in
// your words (parseIdeaMap). "See what's sent" shows exactly what goes before anything does; each map is kept with
// it, so it opens again without sending anything.

const RANGES: readonly { id: MapRange; label: string }[] = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
]
const RANGE_WORDS: Record<MapRange, string> = { '30': 'these 30 days', '90': 'these 90 days', all: 'all your entries' }

/** When the AI's map has nothing the phone can find in your words. */
const NOTHING_IN_YOUR_WORDS = "None of what came back was in your words, so there's no map. Try again."

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function IdeaMapPage({ done, byId, onOpen }: { done: readonly Entry[]; byId: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  const maps = useLiveQuery(async () => (await db.ideaMaps.toArray()).sort((a, b) => b.createdAt - a.createdAt), [])
  const ai = useAiSettings()
  const offerUndo = useUndo()
  const [picked, setPicked] = useState<MapRange | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /** A reply that wasn't a map, shown as it came (on this phone only), so what went wrong can be seen. */
  const [unread, setUnread] = useState<string | null>(null)
  const [opened, setOpened] = useState<IdeaMap | null>(null)
  // Render only once everything has loaded, so nothing moves under your finger.
  if (maps === undefined || ai === undefined) return <Loading />

  const today = toDateKey(new Date())
  const range = picked ?? maps[0]?.range ?? '30'
  const first = done.filter((e) => ownWords(e)).reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null)
  const period = mapPeriod(range, today, first)
  const pack = buildMapPackage(done, period)
  const shown = maps.find((m) => m.range === range)
  const earlier = maps.filter((m) => m !== shown)
  const enough = pack.entryCount >= MIN_COUNT

  const choose = (value: MapRange) => {
    setPicked(value)
    setProblem(null)
    setUnread(null)
  }

  const draw = async () => {
    if (!ai.key || !ai.model) return
    setBusy(true)
    setProblem(null)
    setUnread(null)
    try {
      const reply = await drawMapWithAi({ provider: ai.provider, key: ai.key, model: ai.model, instructions: pack.instructions, data: pack.data })
      const parsed = parseIdeaMap(reply, pack)
      if (!parsed) {
        setUnread(reply)
        throw new AiError('other', MAP_PROBLEMS.notAMap)
      }
      if (!parsed.ideas.length) throw new AiError('other', NOTHING_IN_YOUR_WORDS)
      await saveIdeaMap({
        range,
        start: period.start,
        end: period.end,
        ...parsed,
        entryCount: pack.entryCount,
        sent: { instructions: pack.instructions, data: pack.data },
        provider: ai.provider,
        model: ai.model,
      })
    } catch (error) {
      setProblem(error instanceof AiError ? error.message : MAP_PROBLEMS.other)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (map: IdeaMap) => {
    await deleteIdeaMap(map.id)
    offerUndo('Map deleted', () => restoreIdeaMap(map))
  }

  return (
    <>
      <BackLink href={hashFor('insights')}>Insights</BackLink>
      <h1>Map of your ideas</h1>
      <p className="muted small">The ideas you come back to, and the links you wrote between them, quoted.</p>
      <div className="segmented small idea-map-range" role="group" aria-label="Period for the map">
        {RANGES.map((r) => (
          <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => choose(r.id)}>
            {r.label}
          </button>
        ))}
      </div>

      <section className="card" aria-label="Draw a map">
        <p className="week-count">{formatRecentPeriod(period.start, period.end)}</p>
        <p className="muted">
          {pack.entryCount ? `${plural(pack.entryCount, 'entry', 'entries')} · about ${pack.words.toLocaleString()} words` : 'Nothing written in this period yet.'}
        </p>
        {ai.key && ai.model ? (
          <>
            <button type="button" className="primary wide" disabled={!enough || busy} onClick={() => void draw()}>
              {busy ? 'Drawing…' : shown ? 'Draw again' : 'Draw my map'}
            </button>
            <p className="muted small">
              {busy
                ? 'This can take up to two minutes.'
                : enough
                  ? `Sends your own words from ${RANGE_WORDS[range]} to ${PROVIDERS[ai.provider].label} when you tap.`
                  : `Needs ${MIN_COUNT} or more entries in this period.`}
            </p>
            <details className="evidence">
              <summary>See what's sent</summary>
              <pre className="sent-preview">{pack.text}</pre>
            </details>
          </>
        ) : (
          <a className="list-row" href={hashFor('more', 'ai')}>
            <span className="list-text">
              <span className="list-title">Set up AI</span>
              <span className="list-status">With your own free Groq key</span>
            </span>
            <span className="list-chevron" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
          </a>
        )}
        {problem ? (
          <p className="error small" role="alert">
            {problem}
          </p>
        ) : null}
        {unread ? (
          <details className="evidence">
            <summary>What came back</summary>
            <pre className="sent-preview">{unread}</pre>
          </details>
        ) : null}
      </section>

      {shown ? <IdeaMapView key={shown.id} map={shown} entries={done} byId={byId} onOpen={onOpen} /> : null}

      {earlier.length ? (
        <>
          <h2 className="section-title">Earlier maps</h2>
          <ul className="entry-list">
            {earlier.map((m) => (
              <li key={m.id}>
                <SwipeRow deleteLabel={`Delete the map of ${formatRecentPeriod(m.start, m.end)}`} onDelete={() => void remove(m)}>
                  <button type="button" className="entry-row" onClick={() => setOpened(m)}>
                    <span className="entry-text">
                      <span className="entry-activity">{formatRecentPeriod(m.start, m.end)}</span>
                      <span className="entry-feelings">
                        {PROVIDERS[m.provider].label} · {shortDate(m.createdAt)} · {plural(m.ideas.length, 'idea', 'ideas')}, {plural(m.links.length, 'link', 'links')}
                      </span>
                    </span>
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {opened ? (
        <Dialog
          title={`Map of ${formatRecentPeriod(opened.start, opened.end)}`}
          onClose={() => setOpened(null)}
          footer={
            <button type="button" className="primary wide" onClick={() => setOpened(null)}>
              Done
            </button>
          }
          full
        >
          {/* An entry opens in its own sheet: this one closes first, so two never stack. */}
          <IdeaMapView
            map={opened}
            entries={done}
            byId={byId}
            onOpen={(entry) => {
              setOpened(null)
              onOpen(entry)
            }}
          />
        </Dialog>
      ) : null}
    </>
  )
}
