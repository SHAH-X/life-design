import { useId, useState } from 'react'
import { changeItem } from '../../db/receiptItems'
import { ITEM_KINDS, itemShown, paidFor, type ReceiptItem } from '../../domain/receipts'
import { itemKeys, type KnownReceipt, money, paid, returnedOn, spentOn } from '../../domain/shopping'
import { dayMonthLong } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'

// One receipt (v0.20.18, owner 2026-10-31: "i cannot see the item in that receipt or which category the item … is
// assigned to"): its items, each with its price and kind, and a tap to choose another kind or say you returned it. A
// returned item comes off what was spent; what was paid stays as printed, for matching a card payment. An item on
// offer shows what was paid, then what it was and what the offer took off (v0.20.19, owner's choice).

/** A receipt's items and what it came to; "Open the entry" for its photo and journal. */
export function ReceiptSheet(props: { receipt: KnownReceipt; onOpenEntry: () => void; onClose: () => void }) {
  const { receipt, onOpenEntry, onClose } = props
  const [chosen, setChosen] = useState<number | null>(null)
  const keys = itemKeys(receipt.items).map((key, i) => receipt.items[i]!.key ?? key)
  const item = chosen === null ? undefined : receipt.items[chosen]
  if (item && chosen !== null) return <ItemSheet receipt={receipt} item={item} itemKey={keys[chosen]!} onClose={() => setChosen(null)} />
  const returned = returnedOn(receipt)
  const offers = receipt.items.reduce((s, it) => s + (it.saving ?? (it.price < 0 ? -it.price : 0)), 0)
  const footer = (
    <button type="button" className="primary wide" onClick={onOpenEntry}>
      Open the entry
    </button>
  )
  return (
    <Dialog title={receipt.shop || 'No shop read'} onClose={onClose} footer={footer} full>
      <p className="muted small">
        {dayMonthLong(receipt.date)} · {receipt.readBy ? 'Read by your AI' : 'Read by the phone'}
      </p>
      {receipt.items.length ? (
        <ul className="plain-list compact receipt-items" aria-label="Items">
          {receipt.items.map((it, i) => (
            <li key={keys[i]}>
              {it.price > 0 ? (
                <button type="button" className="line-button" onClick={() => setChosen(i)}>
                  <ItemText item={it} currency={receipt.currency} />
                </button>
              ) : (
                <ItemText item={it} currency={receipt.currency} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No items read.</p>
      )}
      <p>
        Total {money(paid(receipt), receipt.currency)}
        {offers ? ` · ${money(offers, receipt.currency)} off with offers` : ''}
        {returned ? ` · ${money(returned, receipt.currency)} returned · ${money(spentOn(receipt), receipt.currency)} spent` : ''}
      </p>
    </Dialog>
  )
}

function ItemText({ item, currency }: { item: ReceiptItem; currency: string }) {
  return (
    <span>
      {item.returned ? <s>{itemShown(item)}</s> : itemShown(item)}
      <span className="muted small">
        {' '}
        · {item.quantity > 1 ? `${item.quantity} × ` : ''}
        {money(paidFor(item), currency)}
      </span>
      {item.saving ? (
        <>
          <br />
          <span className="muted small">
            Was {money(item.price, currency)} · {money(item.saving, currency)} off
          </span>
        </>
      ) : null}
      <br />
      <span className="muted small">{item.price < 0 ? 'Offer on the whole receipt' : [item.kind ?? 'Not sorted', ...(item.returned ? ['Returned'] : [])].join(' · ')}</span>
    </span>
  )
}

/** One item: whether you returned it, and what kind it is. Each tap is kept, and goes back to the receipt. */
function ItemSheet(props: { receipt: KnownReceipt; item: ReceiptItem; itemKey: string; onClose: () => void }) {
  const { receipt, item, itemKey, onClose } = props
  const name = useId()
  const save = async (change: Parameters<typeof changeItem>[3]) => {
    await changeItem(receipt.entryId, receipt.id, itemKey, change)
    onClose()
  }
  return (
    <Dialog title={itemShown(item)} onClose={onClose}>
      <p className="muted small">
        {receipt.shop || 'No shop read'} · {money(paidFor(item), receipt.currency)}
      </p>
      <div className="purpose-list">
        <label className="purpose-option">
          <input type="checkbox" checked={Boolean(item.returned)} onChange={(event) => void save({ returned: event.target.checked })} />
          <span className="purpose-text">
            <span className="purpose-label">I returned it</span>
            <span className="muted small">Its price no longer counts as spent</span>
          </span>
        </label>
      </div>
      <p className="question-text" id={`${name}-kind`}>
        What kind is it?
      </p>
      <div role="radiogroup" aria-labelledby={`${name}-kind`} className="purpose-list">
        {ITEM_KINDS.map((kind) => (
          <label key={kind} className="purpose-option">
            <input type="radio" name={name} value={kind} checked={item.kind === kind} onChange={() => void save({ kind })} />
            <span className="purpose-text">
              <span className="purpose-label">{kind}</span>
            </span>
          </label>
        ))}
      </div>
    </Dialog>
  )
}
