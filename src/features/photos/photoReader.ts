import type { PhotoReader } from '../../db/aiReading'
import type { AiProvider } from '../../db/types'
import { AiError, PHOTO_KEY_PROBLEM, PROVIDERS, readPhotoWithAi } from '../../lib/ai'

/** Your AI as a reader of photos (v0.18), with the key and model you set up. `own`: the key for photos alone (More →
 *  Reading photos, v0.18.2), so a refusal says to check it there. */
export function photoReader({ provider, key, model, own = false }: { provider: AiProvider; key: string; model: string; own?: boolean }, fetchImpl: typeof fetch = fetch): PhotoReader {
  return {
    by: `${PROVIDERS[provider].label} · ${model}`,
    send: (jpeg, instructions) =>
      readPhotoWithAi({ provider, key, model, instructions, jpeg }, fetchImpl).catch((error: unknown) => {
        throw own && error instanceof AiError && error.problem === 'key' ? new AiError('key', PHOTO_KEY_PROBLEM) : error
      }),
  }
}
