import { useId } from 'react'
import { setPayeeKind } from '../../db/statements'
import { type MoneyLine, nameOf, PAYMENT_KINDS } from '../../domain/money'
import { money } from '../../domain/shopping'
import { dayMonthLong } from '../../lib/dates'
import { Dialog } from '../../ui/Dialog'

// What a payment was for (owner, 2026-10-26: "other transactions in the bank account without receipts are not very
// clear"): a kind for its payee, remembered for all its payments, and a note on one payment.

/** What a payee is for: one tap picks it and it's kept; "Let the app guess" takes yours away. */
export function KindSheet(props: { payeeKey: string; payee: string; chosen: string | null; guess: string | null; onClose: () => void }) {
  const { payeeKey, payee, chosen, guess, onClose } = props
  const name = useId()
  const choose = async (kind: string | null) => {
    await setPayeeKind(payeeKey, kind)
    onClose()
  }
  return (
    <Dialog title={`What is ${payee} for?`} onClose={onClose}>
      <p className="muted small">For all its payments, earlier and later ones too.</p>
      <div role="radiogroup" aria-label={`What ${payee} is for`} className="purpose-list">
        {PAYMENT_KINDS.map((kind) => (
          <label key={kind} className="purpose-option">
            <input type="radio" name={name} value={kind} checked={chosen === kind} onChange={() => void choose(kind)} />
            <span className="purpose-text">
              <span className="purpose-label">{kind}</span>
            </span>
          </label>
        ))}
        <label className="purpose-option">
          <input type="radio" name={name} value="" checked={chosen === null} onChange={() => void choose(null)} />
          <span className="purpose-text">
            <span className="purpose-label">Let the app guess</span>
            <span className="muted small">{guess ? `Its guess: ${guess}` : 'It has no guess for this one'}</span>
          </span>
        </label>
      </div>
    </Dialog>
  )
}

/** One payment: when, who, which way, and what you call it; its kind, and its receipt when there's one. */
export function PaymentSheet(props: {
  line: MoneyLine
  way: string
  receiptSummary: string | null
  kind?: string | null
  onKind?: (() => void) | null
  onRename?: (() => void) | null
  /** Offered for a payee that could be you moving money: says so, and the sheet closes. */
  onOwn?: (() => Promise<void>) | null
  onReceipt: (() => void) | null
  onUnlinkReceipt: (() => Promise<void>) | null
  onClose: () => void
}) {
  const { line, way, receiptSummary, kind, onKind, onRename, onOwn, onReceipt, onUnlinkReceipt, onClose } = props
  const isRenamed = Boolean(line.payee.original && line.payee.original !== line.payee.name)
  return (
    <Dialog title={nameOf(line)} onClose={onClose}>
      {line.label ? <p className="muted small">Paid to: {line.payee.name}</p> : null}
      {isRenamed ? <p className="muted small">Original: {line.payee.original}</p> : null}
      <p>
        {dayMonthLong(line.date)} · {way} · {money(Math.abs(line.amount), '£')}
      </p>
      {receiptSummary ? <p className="muted small receipt-payment-summary">{receiptSummary}</p> : null}
      <div className="button-row" style={{ display: 'flex', gap: '8px', margin: '8px 0 16px', flexWrap: 'wrap' }}>
        {onRename ? (
          <button type="button" className="small-link" onClick={onRename}>
            Rename transaction
          </button>
        ) : null}
        {onKind ? (
          <button type="button" className="small-link" onClick={onKind}>
            {kind ? `Category: ${kind}` : '+ Assign category'}
          </button>
        ) : null}
        {onOwn ? (
          <button type="button" className="small-link" onClick={() => void onOwn()}>
            It’s me, moving money
          </button>
        ) : null}
      </div>
      {onReceipt ? (
        <button type="button" className="wide top-gap" onClick={onReceipt}>
          Open its receipt
        </button>
      ) : null}
      {onUnlinkReceipt ? (
        <button type="button" className="wide top-gap" onClick={() => void onUnlinkReceipt()}>
          Unlink receipt
        </button>
      ) : null}
    </Dialog>
  )
}
