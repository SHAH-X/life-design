import { useId, useState } from 'react'
import type { InvestLine, InvestSummary } from '../../db/types'
import { investingMonth } from '../../domain/investing'
import { dayMonth, monthYear, shortDayMonth } from '../../lib/dates'
import { Block, Item, pounds, ThisMonth } from './AccountsMonth'
import { hashFor } from '../../lib/route'
import { useMoney } from './MoneyContext'

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

export function Investing({ lines, summaries, month, latest, thisMonth }: { lines: readonly InvestLine[]; summaries: readonly InvestSummary[]; month: string; /** The latest month with anything in it. */ latest: string; thisMonth: string }) {
  const its = investingMonth(lines, summaries, month)
  const { costs, result, income } = its
  const [open, setOpen] = useState<'costs' | 'income' | null>(null)
  const panelId = useId()
  const empty = !its.trades && !income.dividendLines.length && !income.interestLines.length
  if (empty) return <p className="muted acc-empty">Nothing from Trading 212 in {monthYear(month)}.</p>
  const { names } = useMoney()
  const held = result.held
  // What is held is told for each account when there are several (audit 2026-11-20: one account's value was labelled "in all").
  const heldValues = held.map((h) => h.accountValue)
  const heldTotal = heldValues.every((v): v is number => v !== null) ? heldValues.reduce((sum, v) => sum + v, 0) : null
  const othersResult = result.byInstrument.others.reduce((sum, g) => sum + g.result, 0)
  return (
    <>
      <div className="acc-hero-top acc-invest-top">
        <p className="acc-label">{month === thisMonth ? `${monthYear(month)} so far` : monthYear(month)}</p>
        {month !== latest ? <ThisMonth href={hashFor('money', latest === thisMonth ? null : latest)} label={latest === thisMonth ? 'This month' : 'Latest'} /> : null}
      </div>
      {its.checked ? (
        its.mismatches.length ? (
          <p className="acc-account-line acc-account-missing">What these lines add up to isn’t what the statement prints, so some may be missing. {its.mismatches.join('; ')}</p>
        ) : (
          <p className="acc-status">Checked against the totals your statement prints.</p>
        )
      ) : null}

      <Block title="Profit and loss" status="Before charges, as your statement prints it. Charges are under Costs and charges.">
        <ul className="acc-list">
          <li className="acc-pair">
            <ul>
              <Row title="Closed result" sub={`${result.sells} ${result.sells === 1 ? 'sale' : 'sales'} · before charges`} value={signed(result.closed)} tone={toneOf(result.closed)} />
              <Row title="After charges" sub={`FX and exchange fees of ${pounds(costs.fxFees + costs.fees)} taken off`} value={signed(result.afterCharges)} tone={toneOf(result.afterCharges)} />
            </ul>
          </li>
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
        </ul>
      </Block>

      <div className="acc-tiles" role="group" aria-label="More about this month">
        <button type="button" className="acc-tile" aria-expanded={open === 'costs'} aria-controls={panelId} onClick={() => setOpen(open === 'costs' ? null : 'costs')}>
          <span className="acc-tile-label">Costs and charges</span>
          <span className="acc-tile-value">{pounds(costs.total)}</span>
          <span className="acc-tile-sub">on {its.trades} {its.trades === 1 ? 'trade' : 'trades'}</span>
        </button>
        <button type="button" className="acc-tile" aria-expanded={open === 'income'} aria-controls={panelId} onClick={() => setOpen(open === 'income' ? null : 'income')}>
          <span className="acc-tile-label">Income</span>
          <span className="acc-tile-value">{pounds(income.dividends + income.interest)}</span>
          <span className="acc-tile-sub">dividends and interest</span>
        </button>
        {held.length ? (
          <div className="acc-tile">
            <span className="acc-tile-label">Held at {dayMonth(held.map((h) => h.to).sort().at(-1)!)}</span>
            <span className="acc-tile-value">{held.length === 1 ? (held[0]!.accountValue !== null ? `${pounds(held[0]!.accountValue)} in all` : '') : heldTotal !== null ? `${pounds(heldTotal)} in all` : ''}</span>
            {held.map((h) => (
              <span key={h.id} className="acc-tile-sub">
                {held.length > 1 ? `${names.get(h.account) ?? h.account}${h.accountValue !== null ? ` ${pounds(h.accountValue)}` : ''} · ` : ''}
                {h.openResult !== null ? `open result ${signed(h.openResult)}` : ''}
                {h.openResultChange !== null ? ` · ${h.openResultChange >= 0 ? 'up' : 'down'} ${pounds(Math.abs(h.openResultChange))} over the statement` : ''}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div id={panelId}>
      {open === 'costs' ? (
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
      ) : null}

      {open === 'income' ? (
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
      ) : null}
      </div>
    </>
  )
}
