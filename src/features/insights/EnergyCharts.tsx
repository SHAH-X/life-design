import { useState } from 'react'
import { energySeries, formatSigned, overview, type Period, type SeriesPoint } from '../../analysis/stats'
import type { Entry } from '../../db/types'
import { dayMonth, formatPeriod, longDate, shortDay } from '../../lib/dates'
import { type Column, ColumnChart } from '../../ui/charts/ColumnChart'

const signedTick = (t: number) => (t > 0 ? `+${t}` : t < 0 ? `−${-t}` : '0')

/** Energy (above or below zero) or how into things you were (1–5): one chart at a time, each on its own scale. */
export function EnergyCharts({ entries, period }: { entries: readonly Entry[]; period: Period }) {
  const [show, setShow] = useState<'energy' | 'into'>('energy')
  const series = energySeries(entries, period)
  const weekly = series.some((p) => p.start !== p.end)
  const totals = overview(entries, period)
  const columns = (pick: (p: SeriesPoint) => number | null): Column[] =>
    series.map((p) => ({
      key: p.start,
      axisLabel: weekly ? dayMonth(p.start) : shortDay(p.start),
      title: weekly ? formatPeriod(p.start, p.end) : longDate(p.start),
      value: pick(p),
      count: p.count,
    }))
  const unit = weekly ? 'week' : 'day'

  return (
    <>
      <div className="chip-row chart-switch" role="group" aria-label="Chart">
        <button type="button" className="chip" aria-pressed={show === 'energy'} onClick={() => setShow('energy')}>
          Energy
        </button>
        <button type="button" className="chip" aria-pressed={show === 'into'} onClick={() => setShow('into')}>
          Into it
        </button>
      </div>
      {show === 'energy' ? (
        <ColumnChart
          title={`Energy by ${unit}`}
          columns={columns((p) => p.avgEnergy)}
          domain={[-2, 2]}
          ticks={[-2, 0, 2]}
          mode="diverging"
          formatValue={formatSigned}
          formatTick={signedTick}
          valueName="energy"
          summary={totals.avgEnergy === null ? 'Nothing logged.' : `Average ${formatSigned(totals.avgEnergy)} · tap a column`}
        />
      ) : (
        <ColumnChart
          title={`Into it by ${unit}`}
          columns={columns((p) => p.avgEngagement)}
          domain={[0, 5]}
          ticks={[1, 3, 5]}
          mode="sequential"
          formatValue={(v) => `${v.toFixed(1)}/5`}
          valueName="into it"
          summary={totals.avgEngagement === null ? 'Nothing logged.' : `Average ${totals.avgEngagement.toFixed(1)}/5 · tap a column`}
        />
      )}
    </>
  )
}
