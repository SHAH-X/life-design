import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from '../../db/repo'
import type { AiProvider } from '../../db/types'
import { asProvider } from '../../lib/ai'

export interface AiSettings {
  provider: AiProvider
  model: string | null
  /** Your own key, kept on this phone only (never in a backup, an export, a log or the app's code). */
  key: string | null
}

/** Review with AI's setup (More → AI review); undefined while loading. */
export function useAiSettings(): AiSettings | undefined {
  return useLiveQuery(async () => {
    const [provider, model, key] = await Promise.all([getSetting<unknown>('aiProvider', 'groq'), getSetting<unknown>('aiModel', null), getSetting<unknown>('aiKey', null)])
    return {
      provider: asProvider(provider),
      model: typeof model === 'string' && model ? model : null,
      key: typeof key === 'string' && key ? key : null,
    }
  }, [])
}
