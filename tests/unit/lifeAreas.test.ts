import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AREAS_HASH, clearAreaCentres, ensureAreas, lifeAreas } from '../../src/db/areas'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { LIFE_AREAS } from '../../src/domain/areas'
import type { Embed } from '../../src/lib/embedder'
import { areaEntry } from '../fixtures/areas'

// Fictional example data. A stand-in for the model: each word counts towards one of 64 numbers, so texts that share
// words come out close (as in vectors.test.ts). It counts what it was asked to work out.

let phone: LifeDesignDB
let asked: string[]

const fakeEmbed: Embed = async (texts) => {
  asked.push(...texts)
  return texts.map((text) => {
    const v = new Float32Array(64)
    for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
      let h = 0
      for (const c of word) h = (h * 31 + c.charCodeAt(0)) % 64
      v[h]! += 1
    }
    const norm = Math.hypot(...v) || 1
    return v.map((x) => x / norm)
  })
}

const EXAMPLES = LIFE_AREAS.reduce((n, a) => n + a.examples.length, 0)
const written = (id: string, text: string) => areaEntry({ id, text, expect: [] })

beforeEach(() => {
  phone = openDb(`phone-${crypto.randomUUID()}`)
  asked = []
})

afterEach(async () => {
  await phone.delete()
})

describe('ensureAreas and lifeAreas', () => {
  it('has nothing to say until the areas are worked out once; then an entry goes in the area it is about', async () => {
    await phone.entries.put(written('bills', 'Paid the bills and checked my bank account.'))
    expect(await lifeAreas(phone)).toBeNull()
    await ensureAreas(fakeEmbed, phone)
    expect((await lifeAreas(phone))?.get('bills')).toEqual(['money'])
  })

  it("works the areas' centres out once, and again only when the examples (or the model) change", async () => {
    await ensureAreas(fakeEmbed, phone)
    expect(asked).toHaveLength(EXAMPLES)
    expect(await phone.areaCentres.count()).toBe(LIFE_AREAS.length + 1)
    asked = []
    await ensureAreas(fakeEmbed, phone)
    expect(asked).toEqual([])
    await phone.areaCentres.update('money', { hash: `not-${AREAS_HASH}` })
    await ensureAreas(fakeEmbed, phone)
    expect(asked).toHaveLength(EXAMPLES)
  })

  it('works out new entries too, as search by meaning does, and places nothing unfinished or too short to tell', async () => {
    await phone.entries.bulkPut([
      written('bills', 'Paid the bills and checked my bank account.'),
      { ...written('draft', 'Paid the bills and checked my bank account.'), status: 'draft' },
      written('short', 'Bills paid.'),
    ])
    await ensureAreas(fakeEmbed, phone)
    expect(asked).toContain('Paid the bills and checked my bank account.')
    const placed = await lifeAreas(phone)
    expect([...(placed?.keys() ?? [])]).toEqual(['bills'])
  })

  it("forgets the centres with the model's download, and works them out again when it's back", async () => {
    await ensureAreas(fakeEmbed, phone)
    await clearAreaCentres(phone)
    expect(await lifeAreas(phone)).toBeNull()
    await ensureAreas(fakeEmbed, phone)
    expect(await lifeAreas(phone)).not.toBeNull()
  })
})
