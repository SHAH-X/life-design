import type { PayeeGroup, MoneyLine } from '../../domain/money'
import { money } from '../../domain/shopping'
import { useMoney } from './MoneyContext'

// One payment, the same wherever Money shows it (v0.31.0, owner 2026-11-19: "I can't do that from everywhere where I see an
// entry"): its name in bold, what it says underneath, its figure on the right (money in with a + and the green of money
// in), and a chevron, because tapping it opens the payment's sheet: Rename, Category, Who it was for.

/** In pounds, as Money shows every figure. */
const pounds = (pence: number) => money(pence, '£')

export function PaymentRow({ line, title, sub, way, group }: { line: MoneyLine; title: string; sub: string; way: string; group?: PayeeGroup }) {
  const { openPayment } = useMoney()
  // Money moved between your own accounts isn't money in: it has no +, no green.
  const came = line.amount > 0 && !line.moving
  return (
    <li className="acc-li">
      <button type="button" className="acc-row" onClick={() => openPayment(line, way, group)}>
        <span className="acc-row-text">
          <span className="acc-row-title">{title}</span>
          {sub ? (
            <>
              {' '}
              <span className="acc-row-sub">{sub}</span>
            </>
          ) : null}
        </span>{' '}
        <span className="acc-row-value" data-in={came || undefined}>
          {came ? '+' : ''}
          {pounds(Math.abs(line.amount))}
        </span>
      </button>
    </li>
  )
}
