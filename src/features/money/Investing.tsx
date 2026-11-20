import type { InvestLine, InvestSummary } from '../../db/types'
import { investingMonth } from '../../domain/investing'
import { dayMonth, monthYear, shortDayMonth } from '../../lib/dates'
import { Block, Item, pounds } from './AccountsMonth'

// Money → Investing (v0.36.0, owner 2026-11-19: "profit made, cost and charges, etc" for Trading 212): a month at a time,
// as cards. Profit and loss, costs and charges, and income, each a plain sum as the statement prints it, opening to the
// lines behind it. No percentages, averages or scores. Instruments are named by their tickers, as the statement names them.

/** What was made or lost, as a sign and its figure: +£37.57 or −£12.30 (a true minus). Nothing at all is plain £0.00. */
export const signed = (pence: number) => (pence > 0 ? `+${pounds(pence)}` : pence < 0 ? `−${pounds(-pence)}` : pounds(0))
/** The colour of a result: green for made, red for lost (Money only, owner 2026-11-20); the sign says it too. */
const toneOf = (pence: number): 'in' | 'loss' | undefined => (pence > 0 ? 'in' : pence < 0 ? 'loss' : undefined)

/** One line behind a figure: the instrument, the day and how, and its amount. Not a payment: nothing opens. */
function Row({ title, sub, value, tone }: { title: string; sub: string; value: string; tone?: 'in' | 'loss' }) {
  return (
    <li className="acc-li">
      <div className="acc-row">
        <span className="acc-row-text">
          <span className="acc-row-title">{title}</span> <span className="acc-row-sub">{sub}</span>
        </span>{' '}
        <span className="acc-row-value" data-in={tone === 'in' || undefined} data-loss={tone === 'loss' || undefined}>
          {value}
        </span>
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
  const othersResult = result.byInstrument.others.reduce((sum, g) => sum + g.result, 0)
  return (
    <>
      {its.checked ? (
        its.mismatches.length ? (
          <p className="acc-account-line acc-account-missing">What these lines add up to isn’t what the statement prints, so some may be missing. {its.mismatches.join('; ')}</p>
        ) : (
          <p className="acc-status">Checked against the totals your statement prints.</p>
        )
      ) : null}

      <Block title="Profit and loss" status="Before charges, as your statement prints it. Charges are under Costs and charges.">
        <ul className="acc-list">
          <Row title="Closed result" sub={`${result.sells} ${result.sells === 1 ? 'sale' : 'sales'} · before charges`} value={signed(result.closed)} tone={toneOf(result.closed)} />
          <li className="acc-madeof">
            <p className="acc-status">Made up of · instruments sold 3 or more times are named</p>
            <ul className="acc-lines">
              {result.byInstrument.ranked.map((g) => (
                <Item key={g.instrument} title={g.instrument} sub={`${g.lines.length} ${g.lines.length === 1 ? 'sale' : 'sales'}`} value={signed(g.result)} tone={toneOf(g.result)}>
                  <ul className="acc-lines">
                    {[...g.lines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                      <Row key={l.id} title={shortDayMonth(l.date)} sub={`sold for ${pounds(l.value)}`} value={signed(l.result ?? 0)} tone={toneOf(l.result ?? 0)} />
                    ))}
                  </ul>
                </Item>
              ))}
              {result.byInstrument.others.length ? (
                <Item
                  title="Other instruments"
                  sub={`${result.byInstrument.others.length} ${result.byInstrument.others.length === 1 ? 'instrument' : 'instruments'}, fewer than 3 sales each`}
                  value={signed(othersResult)}
                  tone={toneOf(othersResult)}
                >
                  <ul className="acc-lines">
                    {result.byInstrument.others.map((g) =>
                      g.lines.length === 1 ? (
                        <Row key={g.instrument} title={g.instrument} sub={`${shortDayMonth(g.lines[0]!.date)} · sold for ${pounds(g.lines[0]!.value)}`} value={signed(g.result)} tone={toneOf(g.result)} />
                      ) : (
                        <Item key={g.instrument} title={g.instrument} sub={`${g.lines.length} sales`} value={signed(g.result)} tone={toneOf(g.result)}>
                          <ul className="acc-lines">
                            {[...g.lines].sort((a, b) => b.at.localeCompare(a.at)).map((l) => (
                              <Row key={l.id} title={shortDayMonth(l.date)} sub={`sold for ${pounds(l.value)}`} value={signed(l.result ?? 0)} tone={toneOf(l.result ?? 0)} />
                            ))}
                          </ul>
                        </Item>
                      ),
                    )}
                  </ul>
                </Item>
              ) : null}
            </ul>
          </li>
          <Row title="After charges" sub={`FX and exchange fees of ${pounds(costs.fxFees + costs.fees)} taken off`} value={signed(result.afterCharges)} tone={toneOf(result.afterCharges)} />
          {held ? (
            <Row
              title={`Held at ${dayMonth(held.to)}`}
              sub={`${held.openResult !== null ? `open result ${signed(held.openResult)}` : ''}${held.openResultChange !== null ? ` · ${held.openResultChange >= 0 ? 'up' : 'down'} ${pounds(Math.abs(held.openResultChange))} over the statement` : ''}`}
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
