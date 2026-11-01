import { useLiveQuery } from 'dexie-react-hooks'
import { type ReactNode, useId, useState } from 'react'
import { db } from '../../db/db'
import { changeItem, ITEM_KINDS_SETTING, rememberItemKind } from '../../db/receiptItems'
import { ITEM_KINDS, itemShown, paidFor, type ReceiptItem } from '../../domain/receipts'
import { givenBack, itemKeys, type KnownReceipt, money, paid, rememberedKey, rememberedKindsOf, returnedOn, spentOn } from '../../domain/shopping'
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
  if (receipt.refund) return <RefundSheet receipt={receipt} footer={footer} onClose={onClose} />
  return (
    <Dialog title={receipt.shop || 'No shop read'} onClose={onClose} footer={footer} full>
      <p className="muted small">
        {dayMonthLong(receipt.date)} · {receipt.readBy ? 'Read by your AI' : 'Read by the phone'}
      </p>
      {receipt.items.length ? (
        <ul className="plain-list compact receipt-items rc-items" aria-label="Items">
          {receipt.items.map((it, i) => (
            <li key={keys[i]}>
              {it.price > 0 ? (
                <button type="button" className="line-button rc-item-button" onClick={() => setChosen(i)}>
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
      <p className="rc-total">
        <span className="rc-total-main">
          Total <strong>{money(paid(receipt), receipt.currency)}</strong>
        </span>
        {offers ? <TotalNote>{`${money(offers, receipt.currency)} off with offers`}</TotalNote> : null}
        {returned ? <TotalNote>{`${money(returned, receipt.currency)} returned`}</TotalNote> : null}
        {returned ? (
          <TotalNote strong>{`${money(spentOn(receipt), receipt.currency)} spent`}</TotalNote>
        ) : null}
      </p>
    </Dialog>
  )
}

/** A refund slip (v0.20.20): what came back, item by item, in words; counted nowhere, so nothing on it to change. Its
 *  items' return is marked on the receipt they were bought on (owner, 2026-11-01). */
function RefundSheet(props: { receipt: KnownReceipt; footer: ReactNode; onClose: () => void }) {
  const { receipt, footer, onClose } = props
  return (
    <Dialog title={`${receipt.shop || 'No shop read'} refund`} onClose={onClose} footer={footer} full>
      <p className="muted small">
        {dayMonthLong(receipt.date)} · {receipt.readBy ? 'Read by your AI' : 'Read by the phone'}
      </p>
      <ul className="plain-list compact receipt-items rc-items" aria-label="Items">
        {receipt.items.map((it, i) => (
          <li key={`${it.name}#${i}`}>
            <span className="rc-item">
              <span className="rc-name">{itemShown(it)}</span>
              <span className="rc-price">
                <span className="rc-sep"> · </span>
                {money(it.price, receipt.currency)} back
              </span>
              <span className="rc-kind">{it.kind ?? 'Not sorted'}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="rc-total">
        <span className="rc-total-main">
          Total <strong>{money(givenBack(receipt), receipt.currency)}</strong> back
        </span>
        {receipt.giftCard ? <TotalNote>to a gift card</TotalNote> : null}
      </p>
      <p className="muted small">Not counted. Say “I returned it” on the receipt you bought them on.</p>
    </Dialog>
  )
}

/** What follows the total, set apart: an offer, a return, what was spent. */
function TotalNote({ children, strong }: { children: string; strong?: boolean }) {
  return (
    <span className={strong ? 'rc-total-note rc-total-spent' : 'rc-total-note'}>
      <span className="rc-sep"> · </span>
      {children}
    </span>
  )
}

/** One item: its name and price, what an offer took off, and its kind: the row's words, in a grid. */
function ItemText({ item, currency }: { item: ReceiptItem; currency: string }) {
  return (
    <span className="rc-item">
      <span className="rc-name">{item.returned ? <s>{itemShown(item)}</s> : itemShown(item)}</span>
      <span className="rc-price">
        <span className="rc-sep"> · </span>
        {item.quantity > 1 ? `${item.quantity} × ` : ''}
        {money(paidFor(item), currency)}
      </span>
      {item.saving ? (
        <span className="rc-was">
          Was {money(item.price, currency)} · {money(item.saving, currency)} off
        </span>
      ) : null}
      <span className="rc-kind" data-returned={item.returned ? 'true' : undefined}>
        {item.price < 0 ? 'Offer on the whole receipt' : [item.kind ?? 'Not sorted', ...(item.returned ? ['Returned'] : [])].join(' · ')}
      </span>
    </span>
  )
}

/** One item: whether you returned it, and what kind it is. Each tap is kept, and goes back to the receipt. A kind you
 *  choose is kept for this item at this shop, on every receipt (v0.20.37); where no shop was read, for this receipt only. */
function ItemSheet(props: { receipt: KnownReceipt; item: ReceiptItem; itemKey: string; onClose: () => void }) {
  const { receipt, item, itemKey, onClose } = props
  const name = useId()
  const shop = receipt.shop.trim()
  const kept = useLiveQuery(async () => rememberedKindsOf((await db.settings.get(ITEM_KINDS_SETTING))?.value), [])
  const mine = Boolean(kept?.[rememberedKey(shop, item.name)])
  const save = async (change: Parameters<typeof changeItem>[3]) => {
    await changeItem(receipt.entryId, receipt.id, itemKey, change)
    onClose()
  }
  const choose = async (kind: (typeof ITEM_KINDS)[number]) => {
    if (!shop) return save({ kind })
    // Kept for the item at its shop, so this receipt follows it: a choice of its own would stop it following a later one.
    await changeItem(receipt.entryId, receipt.id, itemKey, { kind: null })
    await rememberItemKind(shop, item.name, kind)
    onClose()
  }
  const backToAi = async () => {
    await changeItem(receipt.entryId, receipt.id, itemKey, { kind: null })
    await rememberItemKind(shop, item.name, null)
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
            <input type="radio" name={name} value={kind} checked={item.kind === kind} onChange={() => void choose(kind)} />
            <span className="purpose-text">
              <span className="purpose-label">{kind}</span>
            </span>
          </label>
        ))}
        {mine ? (
          <label className="purpose-option">
            <input type="radio" name={name} value="" checked={false} onChange={() => void backToAi()} />
            <span className="purpose-text">
              <span className="purpose-label">Back to the AI’s guess</span>
            </span>
          </label>
        ) : null}
      </div>
      {shop ? <p className="muted small">Later receipts with this item at {shop} follow it.</p> : null}
    </Dialog>
  )
}
