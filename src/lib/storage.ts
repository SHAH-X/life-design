// What iOS will and won't keep. Home Screen apps are exempt from Safari's 7-day clean-up, but storage
// can still be cleared when the phone runs low, unless iOS grants "persistent" storage.

export async function ensurePersistentStorage(): Promise<boolean | null> {
  const storage = navigator.storage
  if (!storage?.persisted || !storage.persist) return null
  try {
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

export async function isPersisted(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null
  } catch {
    return null
  }
}

export async function storageUsageBytes(): Promise<number | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    return typeof estimate?.usage === 'number' ? estimate.usage : null
  } catch {
    return null
  }
}

export function isStandalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia?.('(display-mode: standalone)').matches === true || legacy === true
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
