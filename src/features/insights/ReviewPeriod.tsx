import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { useUndo } from '../../app/undo'
import { db } from '../../db/db'
import { deleteAiReview, restoreAiReview, saveAiReview } from '../../db/repo'
import type { AiReview } from '../../db/types'
import { buildReviewPackage, type Period, type PeriodPreset, periodFor } from '../../domain/review'
import { AI_PROBLEMS, AiError, PROVIDERS, reviewWithAi } from '../../lib/ai'
import { addDays, formatRecentPeriod, shortDate, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { canShareFile, downloadFile, shareFile } from '../../lib/share'
import { Dialog } from '../../ui/Dialog'
import { Loading } from '../../ui/Loading'
import { PlainMarkdown } from '../../ui/PlainMarkdown'
import { SwipeRow } from '../../ui/SwipeRow'
import { useAiSettings } from '../more/useAiSettings'
import { usePurposeSettings } from '../today/usePurpose'

// Review a period (v0.12, owner's two ways): copy it (or share it as a file) to any AI chat yourself, or "Review with
// AI" here with your own key. Nothing leaves the phone until you tap, and "See what's sent" shows exactly what.

const PRESETS: readonly { value: PeriodPreset | 'custom'; label: string }[] = [
  { value: 'this-week', label: 'This week' },
  { value: 'last-week', label: 'Last week' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'custom', label: 'Custom' },
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function ReviewPeriod() {
  const data = useLiveQuery(async () => {
    const [entries, days, answers, weeks, steps, reviews] = await Promise.all([
      db.entries.toArray(),
      db.days.toArray(),
      db.answers.toArray(),
      db.weeks.toArray(),
      db.steps.toArray(),
      db.aiReviews.toArray(),
    ])
    return { entries, days, answers, weeks, steps, reviews: reviews.sort((a, b) => b.createdAt - a.createdAt) }
  }, [])
  const purpose = usePurposeSettings()
  const ai = useAiSettings()
  const fromId = useId()
  const toId = useId()
  const focusId = useId()
  const offerUndo = useUndo()
  const today = toDateKey(new Date())
  const [preset, setPreset] = useState<PeriodPreset | 'custom'>('this-week')
  const [custom, setCustom] = useState<Period>({ start: addDays(today, -13), end: today })
  const [focus, setFocus] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<AiReview | null>(null)
  const [opened, setOpened] = useState<AiReview | null>(null)
  // Render only once everything has loaded, so nothing moves under your finger.
  if (data === undefined || purpose === undefined || ai === undefined) return <Loading />

  const period: Period =
    preset !== 'custom' ? periodFor(preset, today) : custom.start <= custom.end ? custom : { start: custom.end, end: custom.start }
  const pack = buildReviewPackage({ ...data, purpose: { primary: purpose.primary, focus: purpose.focus, goal: purpose.goal } }, period, focus)
  const { counts } = pack
  const nothing = counts.entries + counts.smallJoys + counts.answers === 0
  const inIt = [
    `${plural(counts.entries, 'entry', 'entries')} on ${plural(counts.days, 'day')}`,
    counts.smallJoys ? plural(counts.smallJoys, 'small joy') : '',
    counts.answers ? plural(counts.answers, 'evening answer') : '',
    counts.steps ? plural(counts.steps, 'next step') : '',
  ].filter(Boolean)
  const fileName = `life-design-${period.start}-to-${period.end}.md`

  const choose = (value: PeriodPreset | 'custom') => {
    setPreset(value)
    setNote(null)
    setProblem(null)
    setResult(null)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pack.text)
      setNote('Copied. Paste it into any AI chat.')
    } catch {
      setNote("Couldn't copy here. Use Share as a file instead.")
    }
  }

  const share = async () => {
    const file = new File([pack.text], fileName, { type: 'text/markdown' })
    try {
      if (canShareFile(file)) await shareFile(file)
      else downloadFile(file)
    } catch {
      setNote("The share menu didn't open. Please try again.")
    }
  }

  const review = async () => {
    if (!ai.key || !ai.model) return
    setBusy(true)
    setProblem(null)
    setResult(null)
    try {
      const text = await reviewWithAi({ provider: ai.provider, key: ai.key, model: ai.model, instructions: pack.instructions, data: pack.data })
      setResult(await saveAiReview({ start: period.start, end: period.end, focus, provider: ai.provider, model: ai.model, text }))
    } catch (error) {
      setProblem(error instanceof AiError ? error.message : AI_PROBLEMS.other)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: AiReview) => {
    await deleteAiReview(r.id)
    if (result?.id === r.id) setResult(null)
    offerUndo('Review deleted', () => restoreAiReview(r))
  }

  return (
    <>
      <a className="back-link" href={hashFor('insights')}>
        ‹ Insights
      </a>
      <h1>Review a period</h1>
      <div className="chip-row" role="group" aria-label="Period">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" className="chip" aria-pressed={preset === p.value} onClick={() => choose(p.value)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' ? (
        <div className="date-range">
          <label htmlFor={fromId}>From</label>
          <input id={fromId} type="date" value={custom.start} max={today} onChange={(e) => e.target.value && setCustom({ ...custom, start: e.target.value })} />
          <label htmlFor={toId}>To</label>
          <input id={toId} type="date" value={custom.end} max={today} onChange={(e) => e.target.value && setCustom({ ...custom, end: e.target.value })} />
        </div>
      ) : null}

      <section className="card" aria-label="What's in it">
        <p className="week-count">{formatRecentPeriod(period.start, period.end)}</p>
        <p className="muted">{nothing ? 'Nothing written in this period yet.' : `${inIt.join(' · ')} · about ${pack.words.toLocaleString()} words`}</p>
        <label className="question-text" htmlFor={focusId}>
          Anything to focus on? <span className="muted small">Optional</span>
        </label>
        <input id={focusId} value={focus} maxLength={200} placeholder="e.g. Why am I tired on Mondays?" onChange={(e) => setFocus(e.target.value)} />
      </section>

      <section className="card" aria-label="Give it to an AI chat">
        <h2>For an AI chat</h2>
        <div className="stack">
          <button type="button" className="wide" disabled={nothing} onClick={() => void copy()}>
            Copy for an AI chat
          </button>
          <button type="button" className="wide" disabled={nothing} onClick={() => void share()}>
            Share as a file
          </button>
        </div>
        {note ? (
          <p className="muted small" role="status">
            {note}
          </p>
        ) : null}
      </section>

      <section className="card" aria-label="Review with AI">
        <h2>Review with AI</h2>
        {ai.key && ai.model ? (
          <>
            <button type="button" className="primary wide" disabled={nothing || busy} onClick={() => void review()}>
              {busy ? 'Reviewing…' : 'Review with AI'}
            </button>
            <p className="muted small">
              {busy ? 'This can take up to a minute.' : `Sends this period to ${PROVIDERS[ai.provider].label} (${ai.model}) when you tap.`}
            </p>
            <details className="evidence">
              <summary>See what's sent</summary>
              <pre className="sent-preview">{pack.text}</pre>
            </details>
          </>
        ) : (
          <a className="list-row" href={hashFor('more', 'ai')}>
            <span className="list-text">
              <span className="list-title">Set up AI review</span>
              <span className="list-status">With your own free Groq key</span>
            </span>
            <span className="list-chevron" aria-hidden="true">
              ›
            </span>
          </a>
        )}
        {problem ? (
          <p className="error small" role="alert">
            {problem}
          </p>
        ) : null}
      </section>

      {result ? <ReviewCard review={result} /> : null}

      {data.reviews.length ? (
        <>
          <h2 className="section-title">Earlier reviews</h2>
          <ul className="entry-list">
            {data.reviews.map((r) => (
              <li key={r.id}>
                <SwipeRow deleteLabel={`Delete the review of ${formatRecentPeriod(r.start, r.end)}`} onDelete={() => void remove(r)}>
                  <button type="button" className="entry-row" onClick={() => setOpened(r)}>
                    <span className="entry-text">
                      <span className="entry-activity">{formatRecentPeriod(r.start, r.end)}</span>
                      <span className="entry-feelings">
                        {PROVIDERS[r.provider].label} · {shortDate(r.createdAt)}
                        {r.focus ? ` · ${r.focus}` : ''}
                      </span>
                    </span>
                  </button>
                </SwipeRow>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {opened ? (
        <Dialog
          title={`Review of ${formatRecentPeriod(opened.start, opened.end)}`}
          onClose={() => setOpened(null)}
          footer={
            <button type="button" className="primary wide" onClick={() => setOpened(null)}>
              Done
            </button>
          }
          full
        >
          <ReviewText review={opened} />
        </Dialog>
      ) : null}
    </>
  )
}

function ReviewText({ review }: { review: AiReview }) {
  return (
    <>
      <p className="muted small">
        By {PROVIDERS[review.provider].label} · {review.model}
        {review.focus ? ` · focus: ${review.focus}` : ''}
      </p>
      <PlainMarkdown text={review.text} />
    </>
  )
}

/** The answer, labelled with who wrote it: tentative, and the app's own read-backs stay. */
function ReviewCard({ review }: { review: AiReview }) {
  return (
    <section className="card ai-review" aria-label="Review by AI">
      <h2>Review by AI</h2>
      <ReviewText review={review} />
    </section>
  )
}
