import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState } from 'react'
import { journalForAsking } from '../../db/ask'
import { db } from '../../db/db'
import { loadSuggestions, NO_SUGGESTIONS } from '../../db/repo'
import type { Entry, Question } from '../../db/types'
import { ASK_TOOLS, AskError, askJournal } from '../../domain/ask'
import { AI_PROBLEMS, AiError, chatWithTools, PROVIDERS } from '../../lib/ai'
import { embed } from '../../lib/embedder'
import { shortDate, toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { Loading } from '../../ui/Loading'
import { useEntryTitle } from '../areas/AreasProvider'
import { useMeaningSearch } from '../meaning/useMeaning'
import { useAiSettings } from '../more/useAiSettings'
import { EntrySheet, type EntrySheetState } from '../today/EntrySheet'
import { usePurposeSettings } from '../today/usePurpose'
import { useOwnWords } from '../today/useOwnWords'
import { Answer } from './Answer'

type State = { kind: 'idle' } | { kind: 'asking' } | { kind: 'problem'; message: string }

/**
 * Ask (v0.18, its own tab; owner: "asking in the log search box is not helping"): a question about your journal,
 * answered by the AI you set up, on a tap. The phone finds what the question needs and does every sum
 * (src/domain/ask.ts); each answer is kept here, newest first, with everything that was sent for it.
 */
export function AskScreen() {
  const boxId = useId()
  const title = useEntryTitle()
  const ai = useAiSettings()
  const meaning = useMeaningSearch()
  const questions = useLiveQuery(() => db.questions.orderBy('createdAt').reverse().toArray(), [])
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const own = useOwnWords()
  const purpose = usePurposeSettings()
  const suggestions = useLiveQuery(() => loadSuggestions(), [], NO_SUGGESTIONS)
  const [text, setText] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [latest, setLatest] = useState<string | null>(null)
  const [sheet, setSheet] = useState<EntrySheetState>(null)
  // Render only once loaded, so nothing jumps under your finger.
  if (ai === undefined || meaning === undefined || questions === undefined || entries === undefined || own === undefined || purpose === undefined) return <Loading />

  const byId = new Map(entries.map((e) => [e.id, e]))
  const open = (entry: Entry) => setSheet({ kind: 'open', entry })
  const { key, model, provider } = ai
  const ready = Boolean(key && model)

  const ask = async () => {
    const question = text.trim()
    if (!question || !key || !model) return
    setState({ kind: 'asking' })
    try {
      const journal = await journalForAsking(title, meaning === 'on' ? embed : null)
      const result = await askJournal(question, journal, (messages) => chatWithTools({ provider, key, model, messages, tools: ASK_TOOLS }), toDateKey(new Date()))
      const now = Date.now()
      const saved: Question = { id: crypto.randomUUID(), question, ...result, provider, model, createdAt: now, updatedAt: now }
      await db.questions.put(saved)
      setLatest(saved.id)
      setText('')
      setState({ kind: 'idle' })
    } catch (error) {
      setState({ kind: 'problem', message: error instanceof AiError || error instanceof AskError ? error.message : AI_PROBLEMS.other })
    }
  }

  const answered = questions.find((q) => q.id === latest)
  const earlier = questions.filter((q) => q.id !== latest)

  return (
    <div className="ask-screen">
      <header className="ask-header">
        <h1>Ask</h1>
      </header>
      {ready ? (
        <section className="card ask-composer" aria-label="Ask your journal">
          <label className="question-text" htmlFor={boxId}>
            What would you like to know?
          </label>
          <textarea id={boxId} rows={2} maxLength={500} placeholder="e.g. What groceries did I buy this month?" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="button" className="primary ask-submit" disabled={!text.trim() || state.kind === 'asking'} onClick={() => void ask()}>
            {state.kind === 'asking' ? 'Asking…' : 'Ask'}
          </button>
          <p className="muted small ask-composer-note">Sends your question, and the receipts and entries it needs, to {PROVIDERS[provider].label}.</p>
          {state.kind === 'problem' ? (
            <p className="error small" role="alert">
              {state.message}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="muted">
          To ask your journal questions, <a href={hashFor('more', 'ai')}>set up an AI service</a>.
        </p>
      )}

      {answered ? (
        <section className="card ask-answer" aria-label="Answer">
          <h2 className="question-text">{answered.question}</h2>
          <Answer question={answered} entries={byId} onOpen={open} />
        </section>
      ) : null}

      {earlier.length ? (
        <section className="ask-earlier" aria-label="Earlier questions">
          <h2 className="week-title">Earlier</h2>
          <ul className="plain-list">
            {earlier.map((q) => (
              <li key={q.id} className="card">
                <details className="week-line">
                  <summary>
                    <span>{q.question}</span> <span className="muted small">· {shortDate(q.createdAt)}</span>
                  </summary>
                  <Answer question={q} entries={byId} onOpen={open} />
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <EntrySheet state={sheet} onChange={setSheet} suggestions={suggestions} own={own} purpose={purpose} />
    </div>
  )
}
