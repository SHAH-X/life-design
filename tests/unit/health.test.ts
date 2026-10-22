import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { checkDatabase, isLostConnection, RELOAD_GUARD_MS, reloadOnce } from '../../src/db/health'

const LOST = 'Connection to Indexed Database server lost. Refresh the page to try again'

describe('isLostConnection', () => {
  it("recognises iOS's lost database connection, as Safari reports it or as Dexie passes it on", () => {
    expect(isLostConnection(new DOMException(LOST, 'UnknownError'))).toBe(true)
    expect(isLostConnection(new Dexie.DatabaseClosedError(new DOMException(LOST, 'UnknownError')))).toBe(true)
    expect(isLostConnection(new Dexie.OpenFailedError(new DOMException(LOST, 'UnknownError')))).toBe(true)
    expect(isLostConnection(new DOMException('The database connection is closing.', 'InvalidStateError'))).toBe(true)
  })

  it('leaves every other error alone', () => {
    expect(isLostConnection(new TypeError("Cannot read properties of undefined (reading 'date')"))).toBe(false)
    expect(isLostConnection(new Error('Something else'))).toBe(false)
    expect(isLostConnection(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))).toBe(false)
    expect(isLostConnection('UnknownError')).toBe(false)
    expect(isLostConnection(undefined)).toBe(false)
  })
})

describe('reloadOnce', () => {
  function fakeWindow(start: number) {
    const stored = new Map<string, string>()
    const env = {
      now: start,
      reloads: 0,
      storage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value) },
      reload: () => {
        env.reloads += 1
      },
    }
    return env
  }

  it('reloads at most once in a short while, so a failing database can never loop', () => {
    const env = fakeWindow(1_000_000)
    const run = () => reloadOnce({ now: () => env.now, storage: env.storage, reload: env.reload })
    expect(run()).toBe(true)
    expect(run()).toBe(false)
    expect(env.reloads).toBe(1)
    env.now += RELOAD_GUARD_MS + 1
    expect(run()).toBe(true)
    expect(env.reloads).toBe(2)
  })

  it("never reloads by itself when it can't remember doing so (storage refused), so it can't loop", () => {
    let reloads = 0
    const refused = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError')
      },
    }
    expect(reloadOnce({ now: () => 1, storage: refused, reload: () => (reloads += 1) })).toBe(false)
    expect(reloadOnce({ now: () => 1, storage: null, reload: () => (reloads += 1) })).toBe(false)
    expect(reloads).toBe(0)
  })
})

describe('checkDatabase', () => {
  it('says the database is open when a small read works', async () => {
    expect(await checkDatabase(() => Promise.resolve(true))).toBe('open')
  })

  it('says the connection is lost when the read fails that way', async () => {
    expect(await checkDatabase(() => Promise.reject(new Dexie.DatabaseClosedError(new DOMException(LOST, 'UnknownError'))))).toBe('lost')
  })

  it('leaves other failures to the screens, which report them', async () => {
    expect(await checkDatabase(() => Promise.reject(new TypeError('x')))).toBe('open')
  })

  it('says it is slow when the read takes too long, without waiting for ever', async () => {
    expect(await checkDatabase(() => new Promise(() => undefined), 20)).toBe('slow')
  })
})
