import { db } from './db'

// While the app sits in the background, iOS can drop its database connection (a long-running WebKit bug:
// "UnknownError: Connection to Indexed Database server lost. Refresh the page to try again"). Dexie can't open it
// again; a reload can. v0.8 on the iPhone: switching back to the app showed a blank screen.

const CONNECTION_ERRORS = ['UnknownError', 'InvalidStateError', 'DatabaseClosedError', 'OpenFailedError']

/** A database error that a reload fixes: the connection was lost, or can't be opened again. */
export function isLostConnection(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  return (typeof name === 'string' && CONNECTION_ERRORS.includes(name)) || (typeof message === 'string' && /Indexed ?Database server lost/i.test(message))
}

/** At most one reload by itself in this long, so a database that keeps failing can never loop. */
export const RELOAD_GUARD_MS = 30_000
const RELOADED_AT = 'life-design:reloaded-at'

interface ReloadEnv {
  now: () => number
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  reload: () => void
}

function browserEnv(): ReloadEnv {
  let storage: ReloadEnv['storage'] = null
  try {
    storage = window.sessionStorage
  } catch {
    // Storage refused: the app won't reload by itself (see mayReload).
  }
  return { now: () => Date.now(), storage, reload: () => window.location.reload() }
}

/** Whether the app may reload by itself now: not if it just did, nor if it can't remember doing so. */
export function mayReload(env: ReloadEnv = browserEnv()): boolean {
  try {
    if (!env.storage) return false
    const last = Number(env.storage.getItem(RELOADED_AT)) || 0
    return env.now() - last >= RELOAD_GUARD_MS
  } catch {
    return false
  }
}

/** Reloads the app unless it may not (see mayReload). Returns whether it did. */
export function reloadOnce(env: ReloadEnv = browserEnv()): boolean {
  if (!mayReload(env)) return false
  try {
    env.storage?.setItem(RELOADED_AT, String(env.now()))
  } catch {
    return false
  }
  env.reload()
  return true
}

export type DatabaseState = 'open' | 'lost' | 'slow'

/**
 * Whether the database still answers a small read: run when the app comes back from the background. Other
 * failures are left to the screens, which report them; a read that hangs is 'slow' (the loading screen offers a
 * reload) rather than a reason to reload by itself.
 */
export async function checkDatabase(read: () => Promise<unknown> = () => db.settings.get('welcomed'), timeoutMs = 5000): Promise<DatabaseState> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const slow = new Promise<DatabaseState>((resolve) => {
    timer = setTimeout(() => resolve('slow'), timeoutMs)
  })
  const answer = read().then(
    (): DatabaseState => 'open',
    (error: unknown): DatabaseState => (isLostConnection(error) ? 'lost' : 'open'),
  )
  try {
    return await Promise.race([answer, slow])
  } finally {
    clearTimeout(timer)
  }
}
