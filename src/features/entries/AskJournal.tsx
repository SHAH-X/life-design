import { useState } from 'react'
import { journalForAsking } from '../../db/ask'
import type { Entry } from '../../db/types'
import { ASK_TOOLS, AskError, type AskResult, askJournal } from '../../domain/ask'
import { AI_PROBLEMS, AiError, chatWithTools, PROVIDERS } from '../../lib/ai'
import { embed } from '../../lib/embedder'
import { toDateKey } from '../../lib/dates'
import { hashFor } from '../../lib/route'
import { PlainMarkdown } from '../../ui/PlainMarkdown'
import { useEntryTitle } from '../areas/AreasProvider'
import type { AiSettings } from '../more/useAiSettings'

/** What reads as a question rather than words to find: it ends with "?" or starts as questions do. */
export function looksLikeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase()
  return t.length > 8 && (t.endsWith('?') || /^(what|how|which|when|where|who|why|did|do|does|have|has|show|list|tell|total|sum)\b/.test(t))
}

type State = { kind: 'idle' } | { kind: 'asking' } | { kind: 'answered'; result: AskResult } | { kind: 'problem'; message: string }

/**
 * Ask your journal (v0.17), in Logs: the question in the search box, answered by your AI on a tap. The phone finds
 * what the question needs and does every sum (src/domain/ask.ts); the answer names what it used, and each opens.
 */
export function AskJournal(props: { question: string; ai: AiSettings; meaningOn: boolean; entries: ReadonlyMap<string, Entry>; onOpen: (entry: Entry) => void }) {
  const { question, ai, meaningOn, entries, onOpen } = props
  const title = useEntryTitle()
  const [state, setState] = useState<State>({ kind: 'idle' })

  if (!ai.key || !ai.model) {
    return (
      <p className="muted small">
        To ask your journal questions, <a href={hashFor('more', 'ai')}>set up AI review</a>.
      </p>
    )
  }
  const { key, model, provider } = ai

  const ask = async () => {
    setState({ kind: 'asking' })
    try {
      const journal = await journalForAsking(title, meaningOn ? embed : null)
      const result = await askJournal(question, journal, (messages) => chatWithTools({ provider, key, model, messages, tools: ASK_TOOLS }), toDateKey(new Date()))
      setState({ kind: 'answered', result })
    } catch (error) {
      setState({ kind: 'problem', message: error instanceof AiError || error instanceof AskError ? error.message : AI_PROBLEMS.other })
    }
  }

  const byPhoto = new Map([...entries.values()].flatMap((e) => (e.photos ?? []).map((p) => [p.id, e] as const)))
  const used = (result: AskResult) => [
    ...new Set([...result.cited.receipts.map((id) => byPhoto.get(id)), ...result.cited.entries.map((id) => entries.get(id))].filter((e): e is Entry => e !== undefined)),
  ]

  return (
    <section className="card" aria-label="Ask your journal">
      {state.kind === 'answered' ? (
        <>
          <PlainMarkdown text={state.result.answer} />
          {used(state.result).length ? (
            <ul className="plain-list compact">
              {used(state.result).map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="line-button" onClick={() => onOpen(entry)}>
                    <span>
                      <span className="muted small">{entry.date}</span> {title(entry)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <details className="evidence">
            <summary>What was sent</summary>
            {state.result.sent.map((s, i) => (
              <div key={i}>
                <p className="small">
                  <strong>{s.label}</strong>
                </p>
                <pre className="sent-preview">{s.text}</pre>
              </div>
            ))}
          </details>
        </>
      ) : (
        <>
          <button type="button" className="primary" disabled={state.kind === 'asking'} onClick={() => void ask()}>
            {state.kind === 'asking' ? 'Asking…' : 'Ask'}
          </button>
          <p className="muted small">
            Sends your question, and the receipts and entries it needs, to {PROVIDERS[provider].label}.
          </p>
          {state.kind === 'problem' ? (
            <p className="error small" role="alert">
              {state.message}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
