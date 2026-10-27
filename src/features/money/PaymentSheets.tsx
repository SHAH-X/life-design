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
  onReceipt: (() => void) | null
  onUnlinkReceipt: (() => Promise<void>) | null
  onClose: () => void
}) {
  const { line, way, onReceipt, onUnlinkReceipt, onClose } = props
  const [note, setNote] = useState(props.note)
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
      <p>
        {dayMonthLong(line.date)} · {way} · {money(Math.abs(line.amount), '£')}
      </p>
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
