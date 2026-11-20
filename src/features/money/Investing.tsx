import type { InvestLine, InvestSummary } from '../../db/types'
import { investingMonth } from '../../domain/investing'
import { dayMonth, monthYear, shortDayMonth } from '../../lib/dates'
import { Block, Item, pounds } from './AccountsMonth'

// Money → Investing (v0.36.0, owner 2026-11-19: "profit made, cost and charges, etc" for Trading 212): a month at a time,
// as cards. Profit and loss, costs and charges, and income, each a plain sum as the statement prints it, opening to the
// lines behind it. No percentages, averages or scores. Instruments are named by their tickers, as the statement names them.

/** What was made or lost, in words and never as a sign. */
export const madeOrLost = (pence: number) => (pence >= 0 ? `${pounds(pence)} made` : `${pounds(-pence)} lost`)

/** One line behind a figure: the instrument, the day and how, and its amount. Not a payment: nothing opens. */
function Row({ title, sub, value }: { title: string; sub: string; value: string }) {
  return (
    <li className="acc-li">
      <div className="acc-row">
        <span className="acc-row-text">
          <span className="acc-row-title">{title}</span> <span className="acc-row-sub">{sub}</span>
        </span>{' '}
        <span className="acc-row-value">{value}</span>
      </div>
    </li>
  )
}

const tradeSub = (l: InvestLine) => `${shortDayMonth(l.date)} · ${l.direction === 'Sell' ? 'sold' : 'bought'}`

export function Investing({ lines, summaries, month }: { lines: readonly InvestLine[]; summaries: readonly InvestSummary[]; month: string }) {
  const its = investingMonth(lines, summaries, month)
  const { costs, result, income } = its
  const empty = !its.trades && !income.dividendLines.length && !income.interestLines.length
  if (empty) return <p className="muted acc-empty">Nothing from Trading 212 in {monthYear(month)}.</p>
  const held = result.summary
  return (
    <>
      {its.checked ? (
        its.mismatches.length ? (
          <p className="acc-account-line acc-account-missing">Doesn’t match the statement’s totals: {its.mismatches.join('; ')}</p>
        ) : (
          <p className="acc-status">Checked against the totals your statement prints.</p>
        )
      ) : null}

      <Block title="Profit and loss" status="What the month’s sales made or lost, as your statement prints it">
        <ul className="acc-list">
          <Row title="Closed result" sub={`${result.sells} ${result.sells === 1 ? 'sale' : 'sales'}`} value={madeOrLost(result.closed)} />
          {result.byInstrument.ranked.map((g) => (
            <Item key={g.instrument} title={g.instrument} sub={`${g.lines.length} ${g.lines.length === 1 ? 'sale' : 'sales'}`} value={madeOrLost(g.result)}>
              <ul className="acc-lines">
                {[...g.lines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                  <Row key={l.id} title={shortDayMonth(l.date)} sub={`sold for ${pounds(l.value)}`} value={madeOrLost(l.result ?? 0)} />
                ))}
              </ul>
            </Item>
          ))}
          {result.byInstrument.others.length ? (
            <Item
              title="Other instruments"
              sub={`${result.byInstrument.others.length} ${result.byInstrument.others.length === 1 ? 'instrument' : 'instruments'}, fewer than 3 sales each`}
              value={madeOrLost(result.byInstrument.others.reduce((sum, g) => sum + g.result, 0))}
            >
              <ul className="acc-lines">
                {result.byInstrument.others.map((g) => (
                  <Row
                    key={g.instrument}
                    title={g.instrument}
                    sub={g.lines.length === 1 ? `${shortDayMonth(g.lines[0]!.date)} · sold for ${pounds(g.lines[0]!.value)}` : `${g.lines.length} sales`}
                    value={madeOrLost(g.result)}
                  />
                ))}
              </ul>
            </Item>
          ) : null}
          {held ? (
            <Row
              title={`Held at ${dayMonth(held.to)}`}
              sub={`${held.openResult !== null ? `open result ${madeOrLost(held.openResult)}` : ''}${held.openResultChange !== null ? ` · ${held.openResultChange >= 0 ? 'up' : 'down'} ${pounds(Math.abs(held.openResultChange))} over the statement` : ''}`}
              value={held.accountValue !== null ? `${pounds(held.accountValue)} in all` : ''}
            />
          ) : null}
        </ul>
      </Block>

      <Block title="Costs and charges" status={`${pounds(costs.total)} in all, on ${its.trades} ${its.trades === 1 ? 'trade' : 'trades'}`}>
        <ul className="acc-list">
          {costs.fxFees ? (
            <Item title="FX fees" sub={`${costs.fxLines.length} ${costs.fxLines.length === 1 ? 'trade' : 'trades'}`} value={pounds(costs.fxFees)}>
              <ul className="acc-lines">
                {[...costs.fxLines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                  <Row key={l.id} title={l.instrument} sub={tradeSub(l)} value={pounds(l.fxFee)} />
                ))}
              </ul>
            </Item>
          ) : null}
          {costs.fees ? (
            <Item title="Exchange and government fees" sub={`${costs.feeLines.length} ${costs.feeLines.length === 1 ? 'trade' : 'trades'}`} value={pounds(costs.fees)}>
              <ul className="acc-lines">
                {[...costs.feeLines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                  <Row key={l.id} title={l.instrument} sub={tradeSub(l)} value={pounds(l.fees)} />
                ))}
              </ul>
            </Item>
          ) : null}
          {costs.tax ? (
            <Item title="Tax withheld on dividends" sub="worked out from the printed rate" value={pounds(costs.tax)}>
              <ul className="acc-lines">
                {[...costs.taxLines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                  <Row key={l.id} title={l.instrument} sub={shortDayMonth(l.date)} value={pounds(l.tax)} />
                ))}
              </ul>
            </Item>
          ) : null}
          {!costs.total ? <Row title="No costs" sub="this month" value={pounds(0)} /> : null}
        </ul>
      </Block>

      <Block title="Income" status="What it paid, after tax withheld">
        <ul className="acc-list">
          {income.dividendLines.length ? (
            <Item title="Dividends" sub={`${income.dividendLines.length} ${income.dividendLines.length === 1 ? 'payment' : 'payments'}`} value={pounds(income.dividends)}>
              <ul className="acc-lines">
                {[...income.dividendLines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                  <Row key={l.id} title={l.instrument} sub={shortDayMonth(l.date)} value={pounds(l.value)} />
                ))}
              </ul>
            </Item>
          ) : null}
          {income.interestLines.length ? <Row title="Interest on cash" sub={`${income.interestLines.length} ${income.interestLines.length === 1 ? 'day' : 'days'}`} value={pounds(income.interest)} /> : null}
          {!income.dividendLines.length && !income.interestLines.length ? <Row title="No income" sub="this month" value={pounds(0)} /> : null}
        </ul>
      </Block>
    </>
  )
}
