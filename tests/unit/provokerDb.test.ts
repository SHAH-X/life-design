import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { ensureLoopVectors, openLoops } from '../../src/db/loops'
import { answered, doneAlready, loadProvokerState, markShown } from '../../src/db/provoker'
import type { Step } from '../../src/db/types'
import { ensureVectors } from '../../src/db/vectors'
import type { Embed } from '../../src/lib/embedder'
import { addDays } from '../../src/lib/dates'
import { NO_PROVOKER_STATE, stepAsk } from '../../src/prompts/provoke'
import { journalEntry } from '../fixtures/loops'

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

const TODAY = '2026-10-24'
const written = (id: string, daysAgo: number, text: string) => journalEntry({ id, date: addDays(TODAY, -daysAgo), text })
const catchUp = async () => {
  await ensureVectors(fakeEmbed, phone)
  await ensureLoopVectors(fakeEmbed, phone)
}

beforeEach(() => {
  phone = openDb(`phone-${crypto.randomUUID()}`)
  asked = []
})

afterEach(async () => {
  await phone.delete()
})

describe('ensureLoopVectors', () => {
  it('works out each loop once (the sentence, and with the one before), again only when it changes', async () => {
    await phone.entries.put(written('a', 10, 'The bill came. Need to compare tariffs this weekend.'))
    await ensureLoopVectors(fakeEmbed, phone)
    expect(asked).toEqual(['Need to compare tariffs this weekend.', 'The bill came. Need to compare tariffs this weekend.'])
    asked = []
    await ensureLoopVectors(fakeEmbed, phone)
    expect(asked).toEqual([])
    await phone.entries.update('a', { note: 'Need to compare tariffs next weekend.' })
    await ensureLoopVectors(fakeEmbed, phone)
    expect(asked).toHaveLength(2)
    await phone.entries.delete('a')
    await ensureLoopVectors(fakeEmbed, phone)
    expect(await phone.loopVectors.count()).toBe(0)
  })
})

describe('openLoops', () => {
  it('offers loops 3 to 60 days old, oldest first, never a draft', async () => {
    await phone.entries.bulkPut([
      written('fresh', 2, 'Need to call the plumber about the shower.'),
      written('old', 70, 'Need to renew the passport.'),
      written('b', 20, 'Have to book the dentist.'),
      written('a', 30, 'Must sort out the gutters.'),
      { ...written('draft', 10, 'Need to fix the bike.'), status: 'draft' },
    ])
    await catchUp()
    expect((await openLoops(TODAY, phone)).map((l) => l.entryId)).toEqual(['a', 'b'])
  })

  it('lets a loop go once you write about it again, but not for writing before it', async () => {
    await phone.entries.bulkPut([
      // As close as writing that closes it, but written before.
      written('before', 25, 'Compare tariffs this weekend.'),
      written('loop', 20, 'Need to compare tariffs this weekend.'),
      written('other', 10, 'Long run by the river.'),
    ])
    await catchUp()
    expect((await openLoops(TODAY, phone)).map((l) => l.entryId)).toEqual(['loop'])
    await phone.entries.put(written('again', 5, 'Compared tariffs this weekend: need to switch.'))
    await catchUp()
    expect((await openLoops(TODAY, phone)).map((l) => l.entryId)).not.toContain('loop')
  })
})

describe('what you tell the provoker', () => {
  const step = (kind: Step['kind']): Step => ({ id: `s-${kind}`, text: 'Walk after dinner', when: '', kind, status: 'active', entryIds: [], activity: '', createdAt: 1, updatedAt: 1, finishedAt: null })

  it('starts empty, and fills in anything an older backup left out', async () => {
    expect(await loadProvokerState(phone)).toEqual(NO_PROVOKER_STATE)
    await phone.settings.put({ key: 'provoker', value: { closed: ['loop:a#0'] }, updatedAt: 1 })
    expect(await loadProvokerState(phone)).toEqual({ ...NO_PROVOKER_STATE, closed: ['loop:a#0'] })
  })

  it('finishes a next step as Insights does with "Done already": a one-off done, an ongoing one stopped', async () => {
    await phone.steps.bulkPut([step('once'), step('ongoing')])
    await doneAlready(TODAY, stepAsk(step('once'), Date.now()), phone)
    await doneAlready(TODAY, stepAsk(step('ongoing'), Date.now()), phone)
    expect((await phone.steps.toArray()).map((s) => [s.id, s.status]).sort()).toEqual([
      ['s-once', 'done'],
      ['s-ongoing', 'stopped'],
    ])
    expect((await loadProvokerState(phone)).closed.sort()).toEqual(['step:s-once', 'step:s-ongoing'])
  })

  it('closes a loop once its answer is finished, and rests for the day; a quiet area only rests', async () => {
    const reply = { id: 'loop:a#0', question: 'On Tue you wrote …' }
    await markShown(TODAY, { ...reply, kind: 'loop', closable: true }, phone)
    await answered(TODAY, reply, phone)
    expect(await loadProvokerState(phone)).toMatchObject({ closed: ['loop:a#0'], restDay: TODAY, asked: { 'loop:a#0': TODAY } })
    await answered(TODAY, { id: 'quiet:health', question: "You haven't written about Health…" }, phone)
    expect((await loadProvokerState(phone)).closed).toEqual(['loop:a#0'])
  })
})
