import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { markNoticeSeen, MONEY_NOTICES_SEEN, seenNotices } from '../../src/db/moneyNotices'

// Step 6 (owner-approved plan, 2026-11-23): Today's quiet line is shown once; what was shown is kept by its key.
describe('lines seen on Today', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const seen = async () => seenNotices(await phone.settings.get(MONEY_NOTICES_SEEN))

  it('keeps each key once, newest last, also when several are marked at the same moment', async () => {
    await Promise.all([markNoticeSeen('big:1', phone), markNoticeSeen('price:2', phone), markNoticeSeen('big:3', phone)])
    expect((await seen()).sort()).toEqual(['big:1', 'big:3', 'price:2'])
    await markNoticeSeen('big:1', phone)
    expect((await seen()).at(-1)).toBe('big:1')
    expect(await seen()).toHaveLength(3)
  })

  it('keeps the 200 newest, so the list never grows without end', async () => {
    for (let i = 0; i < 205; i += 1) await markNoticeSeen(`k${i}`, phone)
    const kept = await seen()
    expect(kept).toHaveLength(200)
    expect([kept[0], kept.at(-1)]).toEqual(['k5', 'k204'])
  })

  it('reads nothing from a damaged setting', () => {
    expect(seenNotices(undefined)).toEqual([])
    expect(seenNotices({ value: 'nope' })).toEqual([])
    expect(seenNotices({ value: ['a', 3, 'b'] })).toEqual(['a', 'b'])
  })
})
