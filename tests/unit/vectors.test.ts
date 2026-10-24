import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { ensureVectors, findByMeaning, relevantEntries } from '../../src/db/vectors'
import { meaningText } from '../../src/domain/meaning'
import type { Embed } from '../../src/lib/embedder'
import { fakeEntry } from '../fixtures/meaning'

// Fictional example data. A stand-in for the model: each word counts towards one of 64 numbers, so texts that share
// words come out close. It counts what it was asked to work out.

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

beforeEach(() => {
  phone = openDb(`phone-${crypto.randomUUID()}`)
  asked = []
})

afterEach(async () => {
  await phone.delete()
})

describe('ensureVectors: the numbers kept in step with the journal', () => {
  it('works out every finished entry once, and nothing again while nothing changes', async () => {
    await phone.entries.bulkPut([fakeEntry('a', 'Hike', 'Up the ridge.', [], []), fakeEntry('b', 'Rent', 'Bank statements.', [], [])])
    await ensureVectors(fakeEmbed, phone)
    expect(asked).toHaveLength(2)
    expect((await phone.vectors.toArray()).map((r) => r.entryId).sort()).toEqual(['a', 'b'])
    asked = []
    await ensureVectors(fakeEmbed, phone)
    expect(asked).toEqual([])
  })

  it('leaves drafts and entries with no words out, and removes them if an entry becomes one', async () => {
    await phone.entries.bulkPut([
      fakeEntry('done', 'Hike', 'Up the ridge.', [], []),
      { ...fakeEntry('draft', 'Swim', 'Cold.', [], []), status: 'draft' },
      { ...fakeEntry('empty', '', '', [], []), skipped: ['engagement', 'energy'] },
    ])
    await ensureVectors(fakeEmbed, phone)
    expect((await phone.vectors.toArray()).map((r) => r.entryId)).toEqual(['done'])
    await phone.entries.update('done', { status: 'draft' })
    await ensureVectors(fakeEmbed, phone)
    expect(await phone.vectors.count()).toBe(0)
  })

  it('works out an edited entry again, and removes a deleted one', async () => {
    await phone.entries.bulkPut([fakeEntry('a', 'Hike', 'Up the ridge.', [], []), fakeEntry('b', 'Rent', 'Bank statements.', [], [])])
    await ensureVectors(fakeEmbed, phone)
    asked = []
    await phone.entries.update('a', { note: 'Down to the lake.' })
    await phone.entries.delete('b')
    await ensureVectors(fakeEmbed, phone)
    expect(asked).toEqual([meaningText((await phone.entries.get('a'))!)])
    expect(asked[0]).toContain('Down to the lake.')
    expect((await phone.vectors.toArray()).map((r) => r.entryId)).toEqual(['a'])
  })

  it('keeps long writing in pieces, and replaces all of them when it changes', async () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} has six words.`).join(' ')
    await phone.entries.put({ ...fakeEntry('long', '', long, [], []), kind: 'free' })
    await ensureVectors(fakeEmbed, phone)
    expect(await phone.vectors.where('entryId').equals('long').count()).toBe(2)
    await phone.entries.update('long', { note: 'Short now.' })
    await ensureVectors(fakeEmbed, phone)
    expect((await phone.vectors.toArray()).map((r) => r.id)).toEqual(['long#0'])
  })

  it('saves each batch as it goes: stopped half way, the next run carries on from there', async () => {
    await phone.entries.bulkPut(Array.from({ length: 20 }, (_, i) => fakeEntry(`e${i}`, `Walk ${i}`, 'Out.', [], [])))
    let calls = 0
    const failsSecondTime: Embed = async (texts, kind) => {
      if (++calls === 2) throw new Error('stopped')
      return fakeEmbed(texts, kind)
    }
    await expect(ensureVectors(failsSecondTime, phone)).rejects.toThrow('stopped')
    expect(await phone.vectors.count()).toBe(16)
    asked = []
    const progress: number[] = []
    await ensureVectors(fakeEmbed, phone, (done) => progress.push(done))
    expect(asked).toHaveLength(4)
    expect(progress).toEqual([4])
  })

  it('runs once at a time: a second call while one runs waits for the same work', async () => {
    await phone.entries.bulkPut([fakeEntry('a', 'Hike', 'Up the ridge.', [], [])])
    await Promise.all([ensureVectors(fakeEmbed, phone), ensureVectors(fakeEmbed, phone)])
    expect(asked).toHaveLength(1)
  })
})

describe('findByMeaning and relevantEntries', () => {
  beforeEach(async () => {
    await phone.entries.bulkPut([
      fakeEntry('hike', 'Hike', 'Up the ridge above the lake.', [], []),
      fakeEntry('rent', 'Rent', 'The landlord raised the rent.', [], []),
      fakeEntry('swim', 'Swim', 'The lake was cold.', [], []),
      { ...fakeEntry('draft', 'Lake', 'The lake again.', [], []), status: 'draft' },
    ])
  })

  it('brings the numbers up to date first, then gives the closest entries first, as ids', async () => {
    expect(await findByMeaning('cold lake', fakeEmbed, { max: 2 }, phone)).toEqual(['swim', 'hike'])
    expect(await phone.vectors.count()).toBe(3)
  })

  it('can give simply the closest instead of those that stand out', async () => {
    expect(await findByMeaning('cold lake', fakeEmbed, { max: 1, pick: 'closest' }, phone)).toEqual(['swim'])
  })

  it('looks only among the given entries, and never at drafts', async () => {
    expect(await findByMeaning('the lake', fakeEmbed, { max: 5, among: ['hike', 'rent', 'draft'] }, phone)).toEqual(['hike', 'rent'])
  })

  it('gives nothing for an empty question, without starting the model', async () => {
    expect(await findByMeaning('   ', fakeEmbed, { max: 5 }, phone)).toEqual([])
    expect(asked).toEqual([])
  })

  it('relevantEntries gives the entries themselves, closest first', async () => {
    const found = await relevantEntries('the landlord and the rent', 1, fakeEmbed, phone)
    expect(found.map((e) => e.activity)).toEqual(['Rent'])
  })
})
