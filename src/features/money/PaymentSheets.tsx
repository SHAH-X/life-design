import { useId, useState } from 'react'
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

/** Who a payment or an item was for (v0.20.38, v0.20.39): a name in use, one from your entries, or a new one. For a
 *  payment, for itself alone or for all its payee's (`scopes`). Choosing is saving. */
export function ForSheet(props: {
  /** Its name now; "" is nobody in particular. */
  current: string
  names: string[]
  suggestions: string[]
  scopes?: { payee: string; all: boolean }
  onFile: (who: string, scope: 'one' | 'all') => Promise<void>
  onClose: () => void
}) {
  const { current, names, suggestions, scopes, onFile, onClose } = props
  const [scope, setScope] = useState<'one' | 'all'>(scopes?.all ? 'all' : 'one')
  const [fresh, setFresh] = useState('')
  const scopeName = useId()
  const listName = useId()
  const freshId = useId()
  const file = async (who: string) => {
    const said = who.trim()
    // A name you have, whatever its capitals, is that name.
    await onFile(names.find((n) => n.toLowerCase() === said.toLowerCase()) ?? said, scope)
    onClose()
  }
  return (
    <Dialog title="Who was it for?" onClose={onClose}>
      {scopes ? (
        <div role="radiogroup" aria-label="Applies to" className="purpose-list">
          <label className="purpose-option">
            <input type="radio" name={scopeName} value="one" checked={scope === 'one'} onChange={() => setScope('one')} />
            <span className="purpose-text">
              <span className="purpose-label">Only this payment</span>
            </span>
          </label>
          <label className="purpose-option">
            <input type="radio" name={scopeName} value="all" checked={scope === 'all'} onChange={() => setScope('all')} />
            <span className="purpose-text">
              <span className="purpose-label">All payments to {scopes.payee}</span>
              <span className="muted small">Earlier and later ones too</span>
            </span>
          </label>
        </div>
      ) : null}
      <div role="radiogroup" aria-label="Who it was for" className={scopes ? 'purpose-list top-gap' : 'purpose-list'}>
        {names.map((who) => (
          <label key={who} className="purpose-option">
            <input type="radio" name={listName} value={who} checked={current === who} onChange={() => void file(who)} />
            <span className="purpose-text">
              <span className="purpose-label">{who}</span>
            </span>
          </label>
        ))}
        <label className="purpose-option">
          <input type="radio" name={listName} value="" checked={current === ''} onChange={() => void file('')} />
          <span className="purpose-text">
            <span className="purpose-label">Nobody in particular</span>
          </span>
        </label>
      </div>
      {suggestions.length ? (
        <>
          <p className="question-text top-gap">From your entries</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {suggestions.map((who) => (
              <button key={who} type="button" className="small-link" onClick={() => void file(who)}>
                {who}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <label className="question-text top-gap" htmlFor={freshId}>
        A new name
      </label>
      <input id={freshId} value={fresh} maxLength={30} autoCapitalize="words" placeholder="e.g. Home" onChange={(e) => setFresh(e.target.value)} />
      <button type="button" className="primary wide top-gap" disabled={!fresh.trim()} onClick={() => void file(fresh)}>
        Add
      </button>
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
  /** Who it was for (v0.20.38): offered for money out. */
  onWho?: (() => void) | null
  /** Offered for a payee that could be you moving money: says so, and the sheet closes. */
  onOwn?: (() => Promise<void>) | null
  onReceipt: (() => void) | null
  onUnlinkReceipt: (() => Promise<void>) | null
  onClose: () => void
}) {
  const { line, way, receiptSummary, kind, onKind, onRename, onWho, onOwn, onReceipt, onUnlinkReceipt, onClose } = props
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
        {onWho ? (
          <button type="button" className="small-link" onClick={onWho}>
            {line.forWho ? `For: ${line.forWho}` : '+ Who was it for?'}
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
