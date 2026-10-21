import { useState } from 'react'
import { energySeries, inPeriod, type Period, type SeriesPoint } from '../../analysis/stats'
import type { Entry } from '../../db/types'
import { energyWordFor, intoItWord, overallEnergyWord } from '../../domain/feelings'
import { dayMonth, formatPeriod, longDate, shortDay } from '../../lib/dates'
import { type Column, ColumnChart } from '../../ui/charts/ColumnChart'

const ENERGY_AXIS: Record<number, string> = { 2: 'gives', 0: '', [-2]: 'takes' }
const INTO_AXIS: Record<number, string> = { 1: 'bored', 3: 'fine', 5: 'absorbed' }

/** Energy (gives or takes) or how into things you were: one chart at a time, each on its own scale, read in words. */
export function EnergyCharts({ entries, period }: { entries: readonly Entry[]; period: Period }) {
  const [show, setShow] = useState<'energy' | 'into'>('energy')
  const series = energySeries(entries, period)
  const weekly = series.some((p) => p.start !== p.end)
  const within = inPeriod(entries, period)
  const columns = (pick: (p: SeriesPoint) => number | null): Column[] =>
    series.map((p) => ({
      key: p.start,
      axisLabel: weekly ? dayMonth(p.start) : shortDay(p.start),
      title: weekly ? formatPeriod(p.start, p.end) : longDate(p.start),
      value: pick(p),
      count: p.count,
    }))
  const unit = weekly ? 'week' : 'day'
  const overall = overallEnergyWord(within.map((e) => e.energy))
  const meanInto = within.length ? within.reduce((sum, e) => sum + e.engagement, 0) / within.length : null

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
          formatValue={energyWordFor}
          formatTick={(t) => ENERGY_AXIS[t] ?? ''}
          axisWidth={40}
          valueName="energy"
          summary={overall === null ? 'Nothing logged.' : `${overall} · tap a column`}
        />
      ) : (
        <ColumnChart
          title={`Into it by ${unit}`}
          columns={columns((p) => p.avgEngagement)}
          domain={[0, 5]}
          ticks={[1, 3, 5]}
          mode="sequential"
          formatValue={intoItWord}
          formatTick={(t) => INTO_AXIS[t] ?? ''}
          axisWidth={48}
          valueName="into it"
          summary={meanInto === null ? 'Nothing logged.' : `Mostly ${intoItWord(meanInto)} · tap a column`}
        />
      )}
    </>
  )
}
