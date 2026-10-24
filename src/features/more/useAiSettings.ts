import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from '../../db/repo'
import type { AiProvider } from '../../db/types'
import { PROVIDERS, READS_IMAGES } from '../../lib/ai'

export interface AiSettings {
  provider: AiProvider
  model: string | null
  /** Your own key, kept on this phone only (never in a backup, an export, a log or the app's code). */
  key: string | null
}

/** Where a key, its service and its model are kept, and which services it may be for. */
export interface KeySlot {
  key: string
  provider: string
  model: string
  providers: readonly AiProvider[]
  /** The name of its choice of service. */
  label: string
}

/** For Ask and reviews (More → AI review). */
export const REVIEW_SLOT: KeySlot = { key: 'aiKey', provider: 'aiProvider', model: 'aiModel', providers: Object.keys(PROVIDERS) as AiProvider[], label: 'Service' }

/** For photos alone (More → Reading photos, v0.18.2), when the AI for Ask and reviews can't read them or you'd rather
 *  another did: Groq for asking, Gemini for photos. */
export const PHOTO_SLOT: KeySlot = { key: 'photoAiKey', provider: 'photoAiProvider', model: 'photoAiModel', providers: READS_IMAGES, label: 'Service for photos' }

/** A key's setup; undefined while loading. */
export function useAiSettings(slot: KeySlot = REVIEW_SLOT): AiSettings | undefined {
  return useLiveQuery(async () => {
    const [provider, model, key] = await Promise.all([getSetting<unknown>(slot.provider, null), getSetting<unknown>(slot.model, null), getSetting<unknown>(slot.key, null)])
    return {
      provider: slot.providers.find((p) => p === provider) ?? slot.providers[0]!,
      model: typeof model === 'string' && model ? model : null,
      key: typeof key === 'string' && key ? key : null,
    }
  }, [slot])
}
