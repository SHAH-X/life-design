import { energySeries, formatSigned, overview, type Period, type SeriesPoint } from '../../analysis/stats'
import type { Entry } from '../../db/types'
import { dayMonth, formatPeriod, longDate, shortDay } from '../../lib/dates'
import { type Column, ColumnChart } from '../../ui/charts/ColumnChart'

const signedTick = (t: number) => (t > 0 ? `+${t}` : t < 0 ? `−${-t}` : '0')

/** Energy (above or below zero) and engagement (1–5) as two aligned charts: separate scales, never one shared axis. */
export function EnergyCharts({ entries, period }: { entries: readonly Entry[]; period: Period }) {
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
      <ColumnChart
        title={`Energy by ${unit}`}
        columns={columns((p) => p.avgEnergy)}
        domain={[-2, 2]}
        ticks={[-2, 0, 2]}
        mode="diverging"
        formatValue={formatSigned}
        formatTick={signedTick}
        valueName="energy"
        summary={
          totals.avgEnergy === null
            ? 'Nothing logged in this period.'
            : `Average ${formatSigned(totals.avgEnergy)} across ${totals.entries} activities. Tap a column for details.`
        }
      />
      <ColumnChart
        title={`Engagement by ${unit}`}
        columns={columns((p) => p.avgEngagement)}
        domain={[0, 5]}
        ticks={[1, 3, 5]}
        mode="sequential"
        formatValue={(v) => `${v.toFixed(1)}/5`}
        valueName="engagement"
        summary={totals.avgEngagement === null ? 'Nothing logged in this period.' : `Average ${totals.avgEngagement.toFixed(1)} out of 5.`}
      />
    </>
  )
}
