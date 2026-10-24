// Review with AI (v0.12): our own small client, no dependency. Groq and OpenAI both speak the OpenAI chat format,
// so one request shape covers both. Called straight from the phone with your own key: the key goes only into the
// Authorization header of a request to the service you chose (the CSP allows no other address), and never into a
// log, an error message, a backup or anything copied.
import type { AiProvider } from '../db/types'

export interface ProviderInfo {
  label: string
  baseUrl: string
  /** Paid per use: labelled as paid in the app. */
  paid: boolean
  /** Where to make a key. */
  keyUrl: string
  /** Models to suggest, best first; the first your key can use is the default. */
  preferred: readonly string[]
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    paid: false,
    keyUrl: 'https://console.groq.com/keys',
    preferred: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'],
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    paid: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    preferred: ['gpt-5.5', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'],
  },
}

/** How long to wait for an answer. */
export const AI_TIMEOUT_MS = 60_000

export type AiProblem = 'offline' | 'key' | 'limit' | 'busy' | 'timeout' | 'other'

/** What went wrong, in words, with what to do next (never the service's own message: it can repeat the key). */
export const AI_PROBLEMS: Record<AiProblem, string> = {
  offline: "Can't reach the service. Check the internet connection and try again.",
  key: "The key wasn't accepted. Check it in More → AI review.",
  limit: "That's more than the service allows just now. Try a shorter period, wait a minute, or copy it to an AI chat instead.",
  busy: 'The service is busy. Try again in a minute.',
  timeout: 'No answer within a minute. Try again, or try a shorter period.',
  other: 'The service sent back something unexpected. Try again later.',
}

export class AiError extends Error {
  constructor(readonly problem: AiProblem) {
    super(AI_PROBLEMS[problem])
    this.name = 'AiError'
  }
}

function problemFor(status: number): AiProblem {
  if (status === 401 || status === 403) return 'key'
  if (status === 413 || status === 429) return 'limit'
  if (status === 408 || status === 504) return 'timeout'
  if (status >= 500) return 'busy'
  return 'other'
}

/** Speech, images, embeddings and the like can't review a journal. */
const NOT_CHAT = /whisper|tts|transcribe|audio|realtime|embedding|dall-e|image|moderation|guard|search|computer-use|codex/i

export function chatModels(ids: readonly string[]): string[] {
  return ids.filter((id) => !NOT_CHAT.test(id)).sort()
}

export function defaultModel(provider: AiProvider, models: readonly string[]): string | null {
  return PROVIDERS[provider].preferred.find((id) => models.includes(id)) ?? models[0] ?? null
}

type Fetch = typeof fetch

async function call(url: string, init: RequestInit, fetchImpl: Fetch, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal })
  } catch (error) {
    throw new AiError(error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'offline')
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw new AiError(problemFor(response.status))
  try {
    return await response.json()
  } catch {
    throw new AiError('other')
  }
}

const headers = (key: string) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' })

/** The chat models your key can use ("Check key"). */
export async function listModels(provider: AiProvider, key: string, fetchImpl: Fetch = fetch, timeoutMs = AI_TIMEOUT_MS): Promise<string[]> {
  const body = (await call(`${PROVIDERS[provider].baseUrl}/models`, { method: 'GET', headers: headers(key) }, fetchImpl, timeoutMs)) as {
    data?: { id?: unknown }[]
  }
  const ids = (body.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
  return chatModels(ids)
}

export interface ReviewRequest {
  provider: AiProvider
  key: string
  model: string
  instructions: string
  data: string
}

/** A message in a conversation where the AI can ask the phone things (tools), OpenAI's chat format. */
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

export interface ChatRequest {
  provider: AiProvider
  key: string
  model: string
  messages: readonly ChatMessage[]
  tools: readonly ToolSpec[]
}

/** One turn: the AI's reply, either an answer or things it asks the phone (tool calls). Ask the journal (v0.17). */
export async function chatWithTools(request: ChatRequest, fetchImpl: Fetch = fetch, timeoutMs = AI_TIMEOUT_MS): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const body = { model: request.model, messages: request.messages, tools: request.tools, tool_choice: 'auto' }
  const answer = (await call(
    `${PROVIDERS[request.provider].baseUrl}/chat/completions`,
    { method: 'POST', headers: headers(request.key), body: JSON.stringify(body) },
    fetchImpl,
    timeoutMs,
  )) as { choices?: { message?: { content?: unknown; tool_calls?: unknown } }[] }
  const message = answer.choices?.[0]?.message
  if (!message) throw new AiError('other')
  const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).filter(
    (c): c is ToolCall => typeof c?.id === 'string' && typeof c?.function?.name === 'string' && typeof c?.function?.arguments === 'string',
  )
  const content = typeof message.content === 'string' ? message.content.trim() : ''
  if (!content && toolCalls.length === 0) throw new AiError('other')
  return { content, toolCalls }
}

/** One review: the instructions as the system message, your journal as the message. Returns the answer's text. */
export async function reviewWithAi(request: ReviewRequest, fetchImpl: Fetch = fetch, timeoutMs = AI_TIMEOUT_MS): Promise<string> {
  const body = {
    model: request.model,
    messages: [
      { role: 'system', content: request.instructions },
      { role: 'user', content: request.data },
    ],
  }
  const answer = (await call(
    `${PROVIDERS[request.provider].baseUrl}/chat/completions`,
    { method: 'POST', headers: headers(request.key), body: JSON.stringify(body) },
    fetchImpl,
    timeoutMs,
  )) as { choices?: { message?: { content?: unknown } }[] }
  const text = answer.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new AiError('other')
  return text.trim()
}
