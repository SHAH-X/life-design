// Review with AI (v0.12): our own small client, no dependency. Groq, OpenAI and Gemini (its OpenAI-compatible
// endpoint, v0.18) all speak the OpenAI chat format, so one request shape covers them. Called straight from the phone with your own key: the key goes only into the
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
  gemini: {
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    paid: false,
    keyUrl: 'https://aistudio.google.com/apikey',
    // The newest plain flash your key lists comes first (newestGeminiFlash: Google renames them every few months, and
    // a list of names went stale); with none, these, then the first "flash", then any.
    preferred: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    paid: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    preferred: ['gpt-5.5', 'gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o'],
  },
}

/** A stored provider as one the app knows; anything else (an old or damaged setting) is Groq, the free default. */
export const asProvider = (value: unknown): AiProvider => (value === 'openai' || value === 'gemini' ? value : 'groq')

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

/** A refused key for photos alone (v0.18.2) is checked where it's kept. */
export const PHOTO_KEY_PROBLEM = "The key wasn't accepted. Check it in More → Reading photos."

/** How long to wait for a photo's reading: a long receipt's reply is long (v0.19.1). */
export const PHOTO_TIMEOUT_MS = 120_000

/** A photo's problems in words about a photo: there's no period to shorten or chat to copy it to. */
const PHOTO_PROBLEMS: Partial<Record<AiProblem, string>> = {
  timeout: 'No answer within two minutes. Try again in a moment.',
  limit: "That's more than the service allows just now. Wait a minute and try again.",
}

export class AiError extends Error {
  constructor(
    readonly problem: AiProblem,
    message: string = AI_PROBLEMS[problem],
  ) {
    super(message)
    this.name = 'AiError'
  }
}

/** Gemini refuses a key with 400 and says so in its message: read only to tell which problem it is, never shown. */
const REFUSED_KEY = /api[ _]?key/i

function problemFor(status: number, body: string): AiProblem {
  if (status === 401 || status === 403 || (status === 400 && REFUSED_KEY.test(body))) return 'key'
  if (status === 413 || status === 429) return 'limit'
  if (status === 408 || status === 504) return 'timeout'
  if (status >= 500) return 'busy'
  return 'other'
}

/** Speech, images, embeddings and the like can't review a journal. */
const NOT_CHAT = /whisper|tts|transcribe|audio|realtime|embedding|dall-e|image|moderation|guard|search|computer-use|codex|imagen|veo|aqa|live/i

export function chatModels(ids: readonly string[]): string[] {
  // Gemini names its models "models/gemini-…"; requests take the name alone.
  return ids.map((id) => id.replace(/^models\//, '')).filter((id) => !NOT_CHAT.test(id)).sort()
}

/** Gemini's newest plain fast model a key lists, "gemini-3.8-flash": never a -lite, -preview or other variant.
 *  Versions compare as numbers (3.10 is newer than 3.9). */
function newestGeminiFlash(models: readonly string[]): string | undefined {
  const version = (id: string) => id.match(/^gemini-(\d+)(?:\.(\d+))?-flash$/)
  return models
    .filter((id) => version(id))
    .sort((a, b) => {
      const [, aMajor, aMinor = '0'] = version(a)!
      const [, bMajor, bMinor = '0'] = version(b)!
      return Number(bMajor) - Number(aMajor) || Number(bMinor) - Number(aMinor)
    })[0]
}

export function defaultModel(provider: AiProvider, models: readonly string[]): string | null {
  return (
    (provider === 'gemini' ? newestGeminiFlash(models) : undefined) ??
    PROVIDERS[provider].preferred.find((id) => models.includes(id)) ??
    (provider === 'gemini' ? models.find((id) => /flash/.test(id)) : undefined) ??
    models[0] ??
    null
  )
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
  if (!response.ok) throw new AiError(problemFor(response.status, await response.text().catch(() => '')))
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

/** Services whose chat models read images: reading photos with AI (v0.18) needs one. */
export const READS_IMAGES: readonly AiProvider[] = ['gemini', 'openai']

/** One photo read by the AI (v0.18): how to read it and the photo (a JPEG, base64). Returns its reply's text. */
export async function readPhotoWithAi(
  request: { provider: AiProvider; key: string; model: string; instructions: string; jpeg: string },
  fetchImpl: Fetch = fetch,
  timeoutMs = PHOTO_TIMEOUT_MS,
): Promise<string> {
  const body = {
    model: request.model,
    response_format: { type: 'json_object' },
    // Reading a photo is copying out what's printed, not reasoning: Gemini thinks little, so it answers sooner
    // (Google: lower the thinking level to cut latency). OpenAI's older models refuse this, so it's Gemini's alone.
    ...(request.provider === 'gemini' ? { reasoning_effort: 'low' } : {}),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: request.instructions },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${request.jpeg}` } },
        ],
      },
    ],
  }
  const answer = (await call(
    `${PROVIDERS[request.provider].baseUrl}/chat/completions`,
    { method: 'POST', headers: headers(request.key), body: JSON.stringify(body) },
    fetchImpl,
    timeoutMs,
  ).catch((error: unknown) => {
    const said = error instanceof AiError ? PHOTO_PROBLEMS[error.problem] : undefined
    throw said ? new AiError((error as AiError).problem, said) : error
  })) as { choices?: { message?: { content?: unknown } }[] }
  const text = answer.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new AiError('other')
  return text.trim()
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
