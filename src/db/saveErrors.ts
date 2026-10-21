// Every write goes through guardWrite so a failed save (usually a full phone) is never silent.

type Listener = (error: unknown) => void

const listeners = new Set<Listener>()

export function onSaveError(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function reportSaveError(error: unknown): void {
  console.error('Save failed', error)
  for (const listener of listeners) listener(error)
}

export async function guardWrite<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write()
  } catch (error) {
    reportSaveError(error)
    throw error
  }
}
