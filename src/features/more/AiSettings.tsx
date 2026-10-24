import { useId, useState } from 'react'
import { deleteSetting, setSetting } from '../../db/repo'
import type { AiProvider } from '../../db/types'
import { AI_PROBLEMS, AiError, defaultModel, listModels, PROVIDERS } from '../../lib/ai'
import { Loading } from '../../ui/Loading'
import { type KeySlot, REVIEW_SLOT, type AiSettings as Saved, useAiSettings } from './useAiSettings'

/** Behind ⓘ on More → AI review: how your keys are kept (owner: "make sure API key is secured"). */
export const KEY_SAFETY =
  "Your keys stay on this phone. They're never in the app's code, on the website or in a backup, and each is only ever sent to the service it's for. A free Groq key can't cost money; for OpenAI, set a monthly budget on the key."

const HINTS: Record<AiProvider, string> = {
  groq: "Free. By contract it doesn't train on what you send.",
  openai: 'Paid per use. Not used for training by default.',
  gemini: 'Free tier: Google may use what you send to improve its products, and people may read it. With billing on, it doesn\'t.',
}

/** Review with AI's setup: the service, your key (checked with the service before it's kept), and the model. */
export function AiSettings() {
  const saved = useAiSettings(REVIEW_SLOT)
  if (saved === undefined) return <Loading />
  return <AiForm saved={saved} slot={REVIEW_SLOT} />
}

/** A key's form: for Ask and reviews here, or for photos alone (More → Reading photos). */
export function AiForm({ saved, slot }: { saved: Saved; slot: KeySlot }) {
  const name = useId()
  const keyId = useId()
  const modelId = useId()
  const [provider, setProvider] = useState<AiProvider>(saved.provider)
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [works, setWorks] = useState(false)
  const keyFor = saved.key && saved.provider === provider ? saved.key : null

  const check = async (candidate: string) => {
    setBusy(true)
    setProblem(null)
    setWorks(false)
    try {
      const list = await listModels(provider, candidate.trim())
      const model = saved.model && list.includes(saved.model) ? saved.model : defaultModel(provider, list)
      if (!model) throw new AiError('other')
      await Promise.all([setSetting(slot.key, candidate.trim()), setSetting(slot.provider, provider), setSetting(slot.model, model)])
      setModels(list)
      setKey('')
      setWorks(true)
    } catch (error) {
      setProblem(error instanceof AiError ? error.message : AI_PROBLEMS.other)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    await Promise.all([deleteSetting(slot.key), deleteSetting(slot.model)])
    setModels(null)
    setWorks(false)
  }

  const choices = models ?? (saved.model ? [saved.model] : [])

  return (
    <>
      <div role="radiogroup" aria-label={slot.label} className="purpose-list">
        {slot.providers.map((p) => (
          <label key={p} className="purpose-option">
            <input
              type="radio"
              name={name}
              value={p}
              checked={provider === p}
              onChange={() => {
                setProvider(p)
                setProblem(null)
                setWorks(false)
              }}
            />
            <span className="purpose-text">
              <span className="purpose-label">
                {PROVIDERS[p].label}
                {PROVIDERS[p].paid ? ' (paid)' : ''}
              </span>
              <span className="muted small">{HINTS[p]}</span>
            </span>
          </label>
        ))}
      </div>

      {keyFor ? (
        <div className="top-gap">
          <p className="status-line">Key saved on this phone only · ends {keyFor.slice(-4)}</p>
          {works ? <p className="saved-line">✓ Key works.</p> : null}
          <label className="question-text" htmlFor={modelId}>
            Model
          </label>
          <select id={modelId} value={saved.model ?? ''} onChange={(e) => void setSetting(slot.model, e.target.value)}>
            {choices.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <div className="row top-gap">
            <button type="button" disabled={busy} onClick={() => void check(keyFor)}>
              {busy ? 'Checking…' : 'Check again'}
            </button>
            <button type="button" className="link danger-text" onClick={() => void remove()}>
              Remove key
            </button>
          </div>
        </div>
      ) : (
        <div className="top-gap">
          <label className="question-text" htmlFor={keyId}>
            API key
          </label>
          <input
            id={keyId}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={key}
            placeholder={`Paste your ${PROVIDERS[provider].label} key`}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="small">
            <a className="small-link" href={PROVIDERS[provider].keyUrl} target="_blank" rel="noreferrer">
              Get a {PROVIDERS[provider].label} key ›
            </a>
          </p>
          <button type="button" className="primary wide" disabled={busy || !key.trim()} onClick={() => void check(key)}>
            {busy ? 'Checking…' : 'Check key'}
          </button>
        </div>
      )}
      {problem ? <p className="error small">{problem}</p> : null}
    </>
  )
}
