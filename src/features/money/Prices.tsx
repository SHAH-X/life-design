import { useId, useState } from 'react'
import { joinProduct, listProduct, notSameProduct, splitProduct } from '../../db/products'
import { titleCaseShouted } from '../../domain/money'
import { compareShops, listedProducts, type ProductView, type Sighting, type UnitKind } from '../../domain/products'
import { money } from '../../lib/money'
import { shortDayMonth } from '../../lib/dates'
import { PriceDots, PriceSteps } from '../../ui/charts/PriceCharts'
import { Dialog } from '../../ui/Dialog'
import { Switch } from '../../ui/Switch'

// What you paid for a product, at each shop (step 3, 2026-11-23): a list in Receipts, and a sheet for each product (the picture
// the owner approved as a mock). What you paid on the day you paid it: never what a shop charges now.

const UNIT_WORDS: Record<UnitKind, string> = { litre: 'a litre', kg: 'a kg', each: 'each' }

/** A shop as a person writes it: a name a receipt prints in capitals reads "Tesco" (display only). */
const shopWords = (shop: string) => titleCaseShouted(shop)

/** A price per unit in words: "£0.73 a litre". */
const unitWords = (perUnit: number, kind: UnitKind, currency: string) => `${money(Math.round(perUnit), currency)} ${UNIT_WORDS[kind]}`

/** What a sighting cost: the shelf price of one, and per unit where it printed a size. */
const sightingWords = (s: Sighting) => [money(Math.round(s.each), s.currency || '£'), s.unit ? unitWords(s.unit.perUnit, s.unit.kind, s.currency || '£') : '', s.saving ? 'on offer' : ''].filter(Boolean).join(' · ')

/** The list in Receipts: regular products first, then those bought again or at more than one shop. */
const SHOWN = 12

export function PricesGroup({ views, onOpen }: { views: readonly ProductView[]; onOpen: (view: ProductView) => void }) {
  const headingId = useId()
  const [all, setAll] = useState(false)
  const listed = listedProducts(views)
  if (listed.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="rc-group">
      <h2 id={headingId} className="rc-title">
        Prices you’ve paid
      </h2>
      <p className="rc-status">A price per litre or kg only where the receipt prints a size.</p>
      <div className="rc-body">
        <ul className="plain-list compact">
          {listed.slice(0, all ? undefined : SHOWN).map((v) => {
            const c = v.last.currency || '£'
            // The price is the last shop's: its name goes with it, and how many shops the product is joined across after.
            const sub = [`${shopWords(v.lastShop)} ${money(Math.round(v.last.each), c)}`, v.last.unit ? unitWords(v.last.unit.perUnit, v.last.unit.kind, c) : '', shortDayMonth(v.last.date), v.shops.length > 1 ? `${v.shops.length} shops` : ''].filter(Boolean).join(' · ')
            const change = v.change ? `${v.change.to > v.change.from ? '▲' : '▼'} ${money(Math.round(Math.abs(v.change.to - v.change.from)), c)}` : v.last.saving ? 'on offer' : ''
            return (
              <li key={v.id}>
                <button type="button" className="line-button product-row" onClick={() => onOpen(v)}>
                  <span className="product-name">
                    {v.regular ? '★ ' : ''}
                    {v.title}
                  </span>
                  {change ? <span className="product-change">{change}</span> : null}
                  <span className="product-sub">{sub}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {listed.length > SHOWN ? (
          <button type="button" className="small-link" aria-expanded={all} onClick={() => setAll(!all)}>
            {all ? `Show the first ${SHOWN}` : `Show all ${listed.length}`}
          </button>
        ) : null}
      </div>
    </section>
  )
}

/** One product: where it was bought and what it cost, the shops side by side where you joined them, one shop over time. */
export function ProductSheet({ view, onClose }: { view: ProductView; onClose: () => void }) {
  const currency = view.last.currency || '£'
  const compare = compareShops(view)
  const [shown, setShown] = useState(view.shops.find((s) => s.last === view.last)?.key ?? view.shops[0]!.key)
  const [table, setTable] = useState(false)
  const line = view.shops.find((s) => s.key === shown) ?? view.shops[0]!
  const ref = { id: view.id, members: view.members }
  const kind = line.last.unit?.kind
  const sameKind = line.sightings.every((s) => s.unit?.kind === kind) && kind !== undefined
  const value = (s: Sighting) => (sameKind ? s.unit!.perUnit : s.each)
  const say = (s: Sighting) => `${shortDayMonth(s.date)} · ${sightingWords(s)}`
  const points = line.sightings.map((s) => ({ date: s.date, value: value(s), said: say(s), offer: s.saving > 0 }))
  const fmt = (pence: number) => `£${(pence / 100).toFixed(2)}`
  return (
    <Dialog title={view.title} onClose={onClose} full>
      <p className="muted small">
        {view.shops.map((s) => shopWords(s.shop)).join(' · ')} · on {view.times} {view.times === 1 ? 'receipt' : 'receipts'}
      </p>
      {view.change ? (
        <p>
          {view.change.to > view.change.from ? 'Up' : 'Down'} {money(Math.round(Math.abs(view.change.to - view.change.from)), currency)} at {shopWords(view.change.shop)} on {shortDayMonth(view.change.toDate)}: {money(Math.round(view.change.from), currency)} → {money(Math.round(view.change.to), currency)}
        </p>
      ) : null}

      {compare ? (
        <>
          <h3 className="question-text">Price {UNIT_WORDS[compare.kind]}</h3>
          <p className="muted small">What you paid on the day you paid it: not what a shop charges now.</p>
          <PriceDots
            label={`Price ${UNIT_WORDS[compare.kind]} at ${compare.rows.map((r) => shopWords(r.shop)).join(' and ')}`}
            rows={compare.rows.map((r) => {
              const l = view.shops.find((s) => s.key === r.key)!
              const per = l.sightings.flatMap((s) => (s.unit ? [s.unit.perUnit] : []))
              return { key: r.key, label: shopWords(r.shop), value: r.perUnit, low: Math.min(...per), high: Math.max(...per), when: shortDayMonth(r.date), said: money(Math.round(r.perUnit), currency) }
            })}
          />
          {compare.cheaper ? <p>{shopWords(compare.cheaper.shop)} was {money(compare.cheaper.lessBy, currency)} {UNIT_WORDS[compare.kind]} less when last bought; it may have changed since.</p> : null}
        </>
      ) : null}

      <h3 className="question-text">Where you bought it</h3>
      <ul className="plain-list compact">
        {view.shops.map((s) => (
          <li key={s.key} className="product-shop">
            <span>
              {shopWords(s.shop)} · {sightingWords(s.last)} · {shortDayMonth(s.last.date)}
            </span>
            {view.shops.length > 1 ? (
              <button type="button" className="small-link" aria-label={`Not the same product: ${shopWords(s.shop)}`} onClick={() => void splitProduct(ref, s.key)}>
                Not the same
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {line.sightings.length >= 2 ? (
        <>
          <h3 className="question-text">At {shopWords(line.shop)}{sameKind ? ` · ${UNIT_WORDS[kind!]}` : ''}</h3>
          {view.shops.length > 1 ? (
            <div role="group" aria-label="Shop" className="chip-row">
              {view.shops.map((s) => (
                <button key={s.key} type="button" className="chip" aria-pressed={s.key === line.key} onClick={() => setShown(s.key)}>
                  {shopWords(s.shop)}
                </button>
              ))}
            </div>
          ) : null}
          <PriceSteps
            key={line.key}
            points={points}
            label={`${shopWords(line.shop)}: ${sameKind ? `price ${UNIT_WORDS[kind!]}` : 'price'} over time`}
            edge={{ first: shortDayMonth(line.sightings[0]!.date), last: shortDayMonth(line.last.date), format: fmt }}
          />
          <button type="button" className="small-link" aria-expanded={table} onClick={() => setTable(!table)}>
            {table ? 'Hide the table' : 'Show as table'}
          </button>
          {table ? (
            <table className="chart-table">
              <caption className="visually-hidden">{shopWords(line.shop)}: every time you bought it</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Price</th>
                  <th scope="col">Per unit</th>
                  <th scope="col">Offer</th>
                </tr>
              </thead>
              <tbody>
                {line.sightings.map((s, i) => (
                  <tr key={i}>
                    <td>{shortDayMonth(s.date)}</td>
                    <td>{money(Math.round(s.each), s.currency || '£')}</td>
                    <td>{s.unit ? unitWords(s.unit.perUnit, s.unit.kind, s.currency || '£') : '–'}</td>
                    <td>{s.saving ? `${money(s.saving, s.currency || '£')} off` : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </>
      ) : null}

      {view.similar.length ? (
        <>
          <h3 className="question-text">Looks similar</h3>
          {view.similar.map((s) => (
            <div key={s.members.join('|')} className="product-suggest">
              <p>
                <strong>{shopWords(s.shop)}’s “{s.title}”</strong> looks like the same thing, but a similar name isn’t proof.
              </p>
              <div className="doc-file-actions">
                <button type="button" onClick={() => void joinProduct(ref, s.members)}>
                  Same product
                </button>
                <button type="button" onClick={() => void notSameProduct(ref, s.members)}>
                  Not the same
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}

      <Switch label="On my regular list" hint="so it comes first in Prices you’ve paid" checked={view.regular} onChange={(on) => void listProduct(ref, on)} />
      <p className="muted small">Only what your receipts say, on the days shown.</p>
    </Dialog>
  )
}
