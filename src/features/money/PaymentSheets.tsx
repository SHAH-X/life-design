import { useId, useState } from 'react'
import { notePayment, setPayeeKind } from '../../db/statements'
import { type MoneyLine, PAYMENT_KINDS } from '../../domain/money'
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

/** One payment: when, who, which way, and your note on what it was for; its receipt, when there's one. */
export function PaymentSheet(props: {
  line: MoneyLine
  way: string
  note: string
  receiptSummary: string | null
  kind?: string | null
  onKind?: (() => void) | null
  onRename?: (() => void) | null
  onReceipt: (() => void) | null
  onUnlinkReceipt: (() => Promise<void>) | null
  onClose: () => void
}) {
  const { line, way, receiptSummary, kind, onKind, onRename, onReceipt, onUnlinkReceipt, onClose } = props
  const [note, setNote] = useState(props.note)
  const isRenamed = Boolean(line.payee.original && line.payee.original !== line.payee.name)
  const id = useId()
  const save = async () => {
    await notePayment(line.id, note)
    onClose()
  }
  const footer = (
    <button type="button" className="primary wide" onClick={() => void save()}>
      Save
    </button>
  )
  return (
    <Dialog title={line.payee.name} onClose={onClose} footer={footer} full>
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
      </div>
      <label className="question-text" htmlFor={id}>
        What was it for?
      </label>
      <input id={id} data-autofocus value={note} maxLength={120} autoCapitalize="sentences" placeholder="e.g. Birthday present" onChange={(e) => setNote(e.target.value)} />
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
