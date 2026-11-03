import { useId, useMemo, useState } from 'react'
import { inPeriod } from '../../analysis/stats'
import type { Entry } from '../../db/types'
import { type AreaId, areaName } from '../../domain/areas'
import { layoutMap, thinkingMap } from '../../domain/thinkingMap'
import { addDays, shortDay } from '../../lib/dates'
import { MAP_H, MAP_W, ThinkingMapChart } from '../../ui/charts/ThinkingMapChart'
import { useAreas } from '../areas/AreasProvider'
import { Evidence } from './Evidence'

type Range = '30' | '90' | 'all'
const RANGES: readonly { id: Range; label: string }[] = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
]

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The map of your thinking (v0.22): what you write about and what came up together. Dots are your life areas (3+
 * entries), lines join two written about on the same days; counts only, never causes. A dot opens its entries, a line
 * its days. Needs life areas, so it shows only when they're on and two or more have shown: with none the Life areas
 * card above has already said what to do.
 */
export function ThinkingMap({
  entries,
  byId,
  today,
  onOpen,
}: {
  entries: readonly Entry[]
  byId: ReadonlyMap<string, Entry>
  today: string
  onOpen: (entry: Entry) => void
}) {
  const headingId = useId()
  const { byEntry } = useAreas()
  const [range, setRange] = useState<Range>('30')
  const [chosen, setChosen] = useState<AreaId | null>(null)
  const inRange = useMemo(
    () => (range === 'all' ? entries : inPeriod(entries, { start: addDays(today, -(Number(range) - 1)), end: today })),
    [entries, range, today],
  )
  const ever = useMemo(() => (byEntry ? thinkingMap(entries, byEntry) : null), [entries, byEntry])
  const map = useMemo(() => (byEntry ? thinkingMap(inRange, byEntry) : null), [inRange, byEntry])
  const dots = useMemo(() => (map ? layoutMap(map, { width: MAP_W, height: MAP_H }) : []), [map])
  if (!ever || !map || ever.dots.length < 2) return null

  const active = chosen && map.dots.some((d) => d.id === chosen) ? chosen : null
  const dot = map.dots.find((d) => d.id === active)
  const withActive = map.lines.filter((l) => l.a === active || l.b === active)
  const readout = dot
    ? `${dot.name}: ${plural(dot.entryIds.length, 'entry', 'entries')}${
        withActive.length ? `. With ${withActive.map((l) => `${areaName(l.a === active ? l.b : l.a)} on ${plural(l.days.length, 'day', 'days')}`).join(', ')}` : ''
      }`
    : 'Tap an area.'

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="week-title">
        Map of your thinking
      </h2>
      <p className="muted small week-period">Areas that came up on the same days, not causes.</p>
      <div className="segmented small map-range" role="group" aria-label="Period for the map">
        {RANGES.map((r) => (
          <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="card week-card">
        {map.dots.length === 0 ? (
          <p className="muted small">Nothing here came up 3 times or more.</p>
        ) : (
          <figure className="chart">
            <p className="chart-readout" aria-live="polite">
              {readout}
            </p>
            <ThinkingMapChart
              dots={dots}
              joins={map.lines.map((l) => ({ a: l.a, b: l.b, days: l.days.length }))}
              active={active}
              onActive={setChosen}
              label="Your life areas, joined when they came up on the same days"
            />
            {dot ? <Evidence ids={dot.entryIds} entries={byId} onOpen={onOpen} /> : null}
            <details className="chart-table">
              <summary>Show as table</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Area</th>
                    <th scope="col">Entries</th>
                    <th scope="col">Same days as</th>
                  </tr>
                </thead>
                <tbody>
                  {map.dots.map((d) => (
                    <tr key={d.id}>
                      <th scope="row">{d.name}</th>
                      <td>{d.entryIds.length}</td>
                      <td>
                        {map.lines
                          .filter((l) => l.a === d.id || l.b === d.id)
                          .map((l) => `${areaName(l.a === d.id ? l.b : l.a)} ${l.days.length}`)
                          .join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </figure>
        )}
        {map.dots.length > 0 ? (
          map.lines.length ? (
            <ul className="plain-list compact">
              {map.lines.map((l) => (
                <li key={`${l.a}-${l.b}`}>
                  <details className="week-line">
                    <summary>
                      <span>
                        {areaName(l.a)} and {areaName(l.b)}
                      </span>{' '}
                      <span className="muted small">· {plural(l.days.length, 'day', 'days')}</span>
                    </summary>
                    <p className="muted small">{l.days.map((d) => shortDay(d)).join(', ')}</p>
                    <Evidence ids={l.entryIds} entries={byId} onOpen={onOpen} />
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No two came up together on 3 days yet.</p>
          )
        ) : null}
      </div>
    </section>
  )
}
