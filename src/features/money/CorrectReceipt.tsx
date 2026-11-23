import { useId, useState } from 'react'
import { correctReceipt, type ItemEdit, resetCorrection } from '../../db/receiptItems'
import type { ExtraItem, ReceiptFix } from '../../db/types'
import { itemShown } from '../../domain/receipts'
import { type KnownReceipt, receiptChanges, type ReceiptSnapshot } from '../../domain/shopping'
import { amountField, parseMoney } from '../../lib/money'
import { Dialog } from '../../ui/Dialog'

// Putting a receipt right (step 2, 2026-11-23: "allow editing before final approval"): its shop, day and total, each item's name,
// price and quantity, an item taken off, an item the reading missed. What was read is never changed: the corrections lie over
// it, and "Back to as read" takes them all away. Every save leaves a note of what changed in words (`auditLog`).

interface Row {
  /** The item's key for your changes; an item you add has none until it is saved. */
  key: string | null
  name: string
  price: string
  quantity: string
  removed: boolean
}

/** An item you added earlier is kept as an added one, whatever number it is now. */
const isAdded = (key: string | null) => key === null || key.startsWith('added#')

export function CorrectReceipt({ receipt, onClose }: { receipt: KnownReceipt; onClose: () => void }) {
  const id = useId()
  const [shop, setShop] = useState(receipt.shop)
  const [date, setDate] = useState(receipt.date)
  const [total, setTotal] = useState(receipt.total === null ? '' : amountField(receipt.total))
  const [rows, setRows] = useState<Row[]>(() => receipt.items.map((item) => ({ key: item.key ?? null, name: itemShown(item), price: amountField(item.price), quantity: String(item.quantity), removed: false })))
  const [problem, setProblem] = useState<string | null>(null)
  const currency = receipt.currency || '£'
  const set = (at: number, change: Partial<Row>) => setRows((now) => now.map((row, i) => (i === at ? { ...row, ...change } : row)))

  async function save() {
    // Every amount is read here, so a word or a wrong number is said, never guessed at.
    const totalMinor = total.trim() === '' ? null : parseMoney(total)
    if (total.trim() !== '' && totalMinor === null) return setProblem('The total isn’t an amount. Type it like 9.99, or leave it empty if the receipt printed none.')
    if (!date) return setProblem('Choose the day on the receipt.')
    const kept: { row: Row; price: number; quantity: number }[] = []
    for (const row of rows) {
      if (row.removed) continue
      const price = parseMoney(row.price)
      const quantity = Number(row.quantity)
      if (!row.name.trim()) return setProblem('Every item needs a name. Take an item off, or give it one.')
      if (price === null) return setProblem(`“${row.name}” has a price that isn’t an amount. Type it like 1.20.`)
      if (!Number.isInteger(quantity) || quantity < 1) return setProblem(`“${row.name}” needs a quantity of 1 or more.`)
      kept.push({ row, price, quantity })
    }
    const before: ReceiptSnapshot = { shop: receipt.shop, date: receipt.date, total: receipt.total, items: receipt.items.map((i) => ({ name: itemShown(i), price: i.price, quantity: i.quantity })) }
    const after: ReceiptSnapshot = { shop: shop.trim(), date, total: totalMinor, items: kept.map(({ row, price, quantity }) => ({ name: row.name.trim(), price, quantity })) }
    const changes = receiptChanges(before, after, currency)
    if (changes.length === 0) return onClose()
    const fix: ReceiptFix = {
      ...(after.shop && after.shop !== receipt.shop ? { shop: after.shop } : {}),
      ...(date !== receipt.date ? { date } : {}),
      ...(totalMinor !== receipt.total ? { total: totalMinor } : {}),
    }
    const original = new Map(receipt.items.map((item) => [item.key ?? '', item]))
    const items: ItemEdit[] = []
    for (const row of rows) {
      if (isAdded(row.key)) continue
      const was = original.get(row.key!)
      if (!was) continue
      if (row.removed) {
        items.push({ key: row.key!, removed: true })
        continue
      }
      const price = parseMoney(row.price)!
      const quantity = Number(row.quantity)
      const edit: ItemEdit = {
        key: row.key!,
        ...(row.name.trim() !== itemShown(was) ? { name: row.name.trim() } : {}),
        ...(price !== was.price ? { price } : {}),
        ...(quantity !== was.quantity ? { quantity } : {}),
      }
      if (Object.keys(edit).length > 1) items.push(edit)
    }
    const extra: ExtraItem[] = kept.filter(({ row }) => isAdded(row.key)).map(({ row, price, quantity }) => ({ name: row.name.trim(), price, quantity }))
    await correctReceipt(receipt.entryId, receipt.id, { fix, items, extra }, changes)
    onClose()
  }

  async function back() {
    await resetCorrection(receipt.entryId, receipt.id, ['Back to as read'])
    onClose()
  }

  return (
    <Dialog
      title="Correct this receipt"
      onClose={onClose}
      full
      footer={
        <button type="button" className="primary wide" onClick={() => void save()}>
          Save
        </button>
      }
    >
      <label className="field">
        <span>Shop</span>
        <input value={shop} autoCapitalize="words" onChange={(e) => setShop(e.target.value)} data-autofocus />
      </label>
      <label className="field">
        <span>Day on the receipt</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="field">
        <span>Total it printed</span>
        <input inputMode="decimal" value={total} placeholder="none" onChange={(e) => setTotal(e.target.value)} />
      </label>
      <p className="question-text" id={`${id}-items`}>
        Items
      </p>
      <ul className="plain-list compact" aria-labelledby={`${id}-items`}>
        {rows.map((row, i) => (
          <li key={i} className="correct-row" data-removed={row.removed ? 'true' : undefined}>
            <input aria-label={`Name of item ${i + 1}`} value={row.name} disabled={row.removed} onChange={(e) => set(i, { name: e.target.value })} />
            <input aria-label={`Price of ${row.name || `item ${i + 1}`}`} inputMode="decimal" value={row.price} disabled={row.removed} onChange={(e) => set(i, { price: e.target.value })} />
            <input aria-label={`Quantity of ${row.name || `item ${i + 1}`}`} inputMode="numeric" value={row.quantity} disabled={row.removed} onChange={(e) => set(i, { quantity: e.target.value })} />
            <button type="button" className="small-link" onClick={() => (row.key === null && !row.removed ? setRows((now) => now.filter((_, at) => at !== i)) : set(i, { removed: !row.removed }))}>
              {row.removed ? 'Put back' : 'Take off'}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="small-link" onClick={() => setRows((now) => [...now, { key: null, name: '', price: '', quantity: '1', removed: false }])}>
        + Add an item
      </button>
      {problem ? (
        <p className="error small" role="alert">
          {problem}
        </p>
      ) : null}
      {receipt.edited ? (
        <button type="button" className="small-link top-gap" onClick={() => void back()}>
          Back to as read
        </button>
      ) : null}
      <p className="muted small">What was read stays as it was. Each change is noted.</p>
    </Dialog>
  )
}
