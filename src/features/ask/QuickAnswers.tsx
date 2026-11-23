import { useState } from 'react'
import { type AnswerData, biggestExpenses, billsAnswer, cheapestShops, costChange, dueAnswer, kindsSpent, lastMonth, needsLookAnswer, pricesRose, type QuickAnswer, spentOnKind } from '../../domain/answers'
import { monthYear } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'

// Quick answers about your money and papers (step 6, 2026-11-23, owner-approved plan; its mock shown first): worked out on the phone to
// the penny. Nothing is sent anywhere, and no AI sees your bank payments (owner, 2026-10-26). Each answer says its period, keeps what your
// records show apart from an estimate and a thing to look at, and a month with a statement missing is left out, never counted as nothing.

const QUESTIONS = [
  { id: 'kind', label: 'Spent on a kind last month' },
  { id: 'biggest', label: 'Biggest expenses' },
  { id: 'change', label: 'How a cost changed' },
  { id: 'bills', label: 'Bills and subscriptions' },
  { id: 'due', label: 'Due in the next 30 days' },
  { id: 'rose', label: 'Prices that rose' },
  { id: 'cheapest', label: 'Cheapest shop for what I buy' },
  { id: 'look', label: 'What needs a look' },
] as const
type Id = (typeof QUESTIONS)[number]['id']

export function QuickAnswers({ data }: { data: AnswerData }) {
  const [open, setOpen] = useState<Id | null>(null)
  // Nothing to ask about yet: no card (a journal-only owner gets no eight buttons leading to empty answers).
  if (!data.lines.length && !data.products.length && !data.bills.length && !data.docs.length) return null
  return (
    <section className="card" aria-labelledby="quick-answers">
      <h2 id="quick-answers" className="rc-title">
        Your money and papers
      </h2>
      <p className="muted small">Worked out on this phone, to the penny. Nothing is sent anywhere, and no AI sees your bank payments.</p>
      <div className="chip-row" role="group" aria-label="Questions">
        {QUESTIONS.map((q) => (
          <button key={q.id} type="button" className="chip" onClick={() => setOpen(q.id)}>
            {q.label}
          </button>
        ))}
      </div>
      {open ? <AnswerSheet which={open} data={data} onClose={() => setOpen(null)} /> : null}
    </section>
  )
}

function AnswerSheet({ which, data, onClose }: { which: Id; data: AnswerData; onClose: () => void }) {
  const month = lastMonth(data.today)
  const picks = kindsSpent(data, month)
  const [kind, setKind] = useState(picks[0]?.kind ?? '')
  const needsKind = which === 'kind' || which === 'change'
  const label = QUESTIONS.find((q) => q.id === which)!.label
  const answer: QuickAnswer | null = needsKind
    ? kind
      ? which === 'kind'
        ? spentOnKind(data, kind)
        : costChange(data, kind)
      : null
    : which === 'biggest'
      ? biggestExpenses(data)
      : which === 'bills'
        ? billsAnswer(data)
        : which === 'due'
          ? dueAnswer(data)
          : which === 'rose'
            ? pricesRose(data)
            : which === 'cheapest'
              ? cheapestShops(data)
              : needsLookAnswer(data)
  return (
    <Dialog title={answer?.title ?? label} onClose={onClose} full>
      {needsKind ? (
        picks.length ? (
          <div role="group" aria-label="What kind of spending" className="chip-row">
            {picks.map((p) => (
              <button key={p.kind} type="button" className="chip" aria-pressed={p.kind === kind} onClick={() => setKind(p.kind)}>
                {p.kind}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">
            {data.lines.some((l) => l.date.startsWith(lastMonth(data.today)) && l.amount < 0)
              ? `Nothing paid in ${monthYear(lastMonth(data.today))} is sorted into a kind yet. In Money, choose what a payee is for, then ask again.`
              : `No statement has money out for ${monthYear(lastMonth(data.today))}. Bring one in, in Money, then ask again.`}
          </p>
        )
      ) : null}
      {answer ? <AnswerView answer={answer} /> : null}
    </Dialog>
  )
}

function AnswerView({ answer }: { answer: QuickAnswer }) {
  return (
    <>
      <p className="muted small">{answer.period}</p>
      {answer.caveats.map((c) => (
        <p key={c} className="muted small">
          {c}
        </p>
      ))}
      {answer.empty ? <p>{answer.empty}</p> : null}
      {answer.facts.length ? <span className="answer-tag" data-kind="fact">{answer.factsLabel ?? 'What your records show'}</span> : null}
      {answer.facts.map((section, i) => (
        <div key={i}>
          {section.heading ? <h3 className="question-text">{section.heading}</h3> : null}
          <ul className="plain-list compact">
            {section.rows.map((row, j) => (
              <li key={j}>
                {/* A row that goes somewhere is a link with a chevron: its payments are listed in Money, where a payment is always listed the same way. */}
                {rowHref(row) ? (
                  <a className="answer-row answer-link" href={rowHref(row)}>
                    <Row row={row} />
                    <span className="answer-chevron" aria-hidden="true">
                      <Icon name="chevron-right" size={16} />
                    </span>
                  </a>
                ) : (
                  <div className="answer-row">
                    <Row row={row} />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {section.note ? <p>{section.note}</p> : null}
        </div>
      ))}
      {answer.estimate ? (
        <div className="answer-card">
          <span className="answer-tag" data-kind="estimate">An estimate</span>
          <p>{answer.estimate}</p>
        </div>
      ) : null}
      {answer.look.length ? (
        <div className="answer-card">
          <span className="answer-tag" data-kind="look">A thing to look at</span>
          {answer.look.map((l) => (
            <p key={l.text}>{l.text}</p>
          ))}
        </div>
      ) : null}
    </>
  )
}

/** Where a row goes: its own place, else Money at the month its payments are in (the latest, when they run over months). */
const rowHref = (row: { href?: string; lines?: readonly { date: string; payee: { key: string; name: string } }[] }): string | undefined => {
  if (row.href) return row.href
  if (!row.lines?.length) return undefined
  // Spending in that month, with a payee's name in its search box when the row is one payee's: where the payments are listed.
  const month = row.lines.map((l) => l.date).sort().at(-1)!.slice(0, 7)
  const one = new Set(row.lines.map((l) => l.payee.key)).size === 1 ? row.lines[0]!.payee.name : ''
  return `${hashFor('money', month)}?section=spending${one ? `&find=${encodeURIComponent(one)}` : ''}`
}

function Row({ row }: { row: { label: string; value?: string; sub?: string } }) {
  return (
    <span className="product-row-flat">
      <span className="product-name">{row.label}</span>
      {row.value ? <span className="product-change">{row.value}</span> : null}
      {row.sub ? <span className="product-sub">{row.sub}</span> : null}
    </span>
  )
}
