import type { PhotoReader } from '../../db/aiReading'
import type { AiProvider } from '../../db/types'
import { PROVIDERS, readPhotoWithAi } from '../../lib/ai'

/** Your AI as a reader of photos (v0.18), with the key and model you set up. */
export function photoReader({ provider, key, model }: { provider: AiProvider; key: string; model: string }): PhotoReader {
  return {
    by: `${PROVIDERS[provider].label} · ${model}`,
    send: (jpeg, instructions) => readPhotoWithAi({ provider, key, model, instructions, jpeg }),
  }
}
