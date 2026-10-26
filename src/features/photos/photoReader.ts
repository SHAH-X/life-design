import type { PhotoReader } from '../../db/aiReading'
import type { AiProvider } from '../../db/types'
import { AiError, dailyReset, lighterGemini, listModels, PHOTO_KEY_PROBLEM, PROVIDERS, readPhotoWithAi } from '../../lib/ai'

interface ReaderSettings {
  provider: AiProvider
  key: string
  model: string
  own?: boolean
}

/** Gemini's limit for today, in words with when it starts again (owner, 2026-10-26). */
export const dailyProblem = (label: string, now = new Date()) =>
  `${label}’s free limit for today is used up. It starts again at ${dailyReset(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`

/** Your AI as a reader of photos (v0.18), with the key and model you set up. `own`: the key for photos alone (More →
 *  Reading photos, v0.18.2), so a refusal says to check it there. */
export function photoReader({ provider, key, model, own = false }: ReaderSettings, fetchImpl: typeof fetch = fetch): PhotoReader {
  return {
    by: `${PROVIDERS[provider].label} · ${model}`,
    send: (jpeg, instructions) =>
      readPhotoWithAi({ provider, key, model, instructions, jpeg }, fetchImpl).catch((error: unknown) => {
        if (own && error instanceof AiError && error.problem === 'key') throw new AiError('key', PHOTO_KEY_PROBLEM)
        if (error instanceof AiError && error.problem === 'daily') throw new AiError('daily', dailyProblem(PROVIDERS[provider].label))
        throw error
      }),
  }
}

/** The models a key lists, asked once a session (a listing isn't counted against the day's limit). */
const listed = new Map<string, Promise<string[]>>()

/** The reader for receipts: with Gemini, the lighter model (`lighterGemini`) when your key lists one. */
export async function receiptReader(settings: ReaderSettings, fetchImpl: typeof fetch = fetch): Promise<PhotoReader> {
  if (settings.provider !== 'gemini') return photoReader(settings, fetchImpl)
  const id = `${settings.provider}:${settings.key}`
  if (!listed.has(id)) listed.set(id, listModels(settings.provider, settings.key, fetchImpl).catch(() => (listed.delete(id), [])))
  return photoReader({ ...settings, model: lighterGemini(settings.model, await listed.get(id)!) }, fetchImpl)
}
